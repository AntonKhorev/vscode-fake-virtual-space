import * as vscode from 'vscode'
import {Mutex} from 'async-mutex'

import {
	combineCoincidingSelections,getVerticalMoveInsertion,
	isKnownWrappingIndent,getColumnInsideWrappedLine,getCharacterInsideWrappedLine
} from './utility'

let lock: Mutex;
let undoLock: Mutex;

class DocumentState {
	version:number
	vspace:vscode.Position|undefined
	redos:Array<Array<[number,number,string]>>=[]
	perturbedRedoStack:boolean=false
	column:number|undefined
	ruinedColumnHiddenState:boolean=false
	constructor(version:number) {
		this.version=version
	}
	resetColumn() {
		this.column=undefined
		this.ruinedColumnHiddenState=false
	}
	async edit(editor:vscode.TextEditor,buildEdit:(editBuilder:vscode.TextEditorEdit)=>void) {
		this.perturbedRedoStack=true
		await editor.edit(buildEdit,{undoStopBefore:this.vspace==undefined,undoStopAfter:false})
		this.version=editor.document.version
	}
}
const documentStates:Map<vscode.TextDocument,DocumentState>=new Map()
const getDocumentState=(document:vscode.TextDocument):DocumentState=>{
	const existingState=documentStates.get(document)
	if (existingState && existingState.version==document.version) return existingState
	const newState=new DocumentState(document.version)
	documentStates.set(document,newState)
	return newState
}

export function activate(context: vscode.ExtensionContext) {
	if (!lock) lock=new Mutex() // see for reasons: https://github.com/jemc/vscode-implicit-indent
	if (!undoLock) undoLock=new Mutex()
	vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocumentListener)
	vscode.workspace.onWillSaveTextDocument(event=>{
		// could just run undo if was sure that document text is in focus, but there's no way to check it
		//     return vscode.commands.executeCommand('undo')
		// yes, you can save from find popup, undos land on popup text input in this case
		const state=getDocumentState(event.document)
		if (!state.vspace) return
		vscode.window.showInformationMessage('Saved with fake virtual space - unless there are other onsave handlers that clean it up. Consider saving from outside of virtual space.')
		// this is the cleanup code which damages redo stack - we'd rather not do anything:
		// const lineRange=event.document.lineAt(state.vspace).range
		// const edit=vscode.TextEdit.delete(new vscode.Range(state.vspace,lineRange.end))
		// event.waitUntil((async()=>[edit])())
	})
	vscode.workspace.onDidCloseTextDocument(document=>{
		documentStates.delete(document)
	})
	vscode.window.onDidChangeTextEditorSelection(onDidChangeTextEditorSelectionListener)
	context.subscriptions.push(
		vscode.commands.registerCommand('fakeVirtualSpace.cursorUp'   ,()=>cursorVerticalMove('cursorUp')),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorDown' ,()=>cursorVerticalMove('cursorDown')),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorLeft' ,()=>cursorHorizontalMove('cursorLeft',-1)),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorRight',()=>cursorHorizontalMove('cursorRight',+1)),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorEnd',cursorEnd),
		vscode.commands.registerCommand('fakeVirtualSpace.undo',undo),
		vscode.commands.registerCommand('fakeVirtualSpace.redo',redo)
		// TODO have find handler that cleans up vspace first
	)
}

export function deactivate() {
	// TODO do undos if necessary
}

async function onDidChangeTextEditorSelectionListener(event:vscode.TextEditorSelectionChangeEvent) {
	// TODO check if text has focus if possible - but looks like it's impossible
	// TODO check if document is changed after undo - if not redo immediately? no, can't do that b/c undo stack could be empty but redo stack contained actions from before
	if (lock.isLocked()) return
	if (!(
		event.kind==vscode.TextEditorSelectionChangeKind.Keyboard ||
		event.kind==vscode.TextEditorSelectionChangeKind.Mouse
	)) return // find popup causes Command kind, undo causes undefined kind? - not every time
	const releaseLock=await lock.acquire()
	try {
		const editor=event.textEditor
		const state=getDocumentState(editor.document)
		state.resetColumn()
		if (editor.selections.length!=1) {
			await cleanupVspace(editor)
			return
		}
		if (!state.vspace) return
		let maxVspaceCharacter:number|undefined
		for (const selection of event.selections) {
			// TODO complete multiple selection support
			if (selection.active.line!=state.vspace.line || selection.active.character<=state.vspace.character) continue
			if (maxVspaceCharacter==null || selection.active.character>maxVspaceCharacter) {
				maxVspaceCharacter=selection.active.character
			}
		}
		const text=editor.document.lineAt(state.vspace.line).text
		const insertion=text.slice(state.vspace.character,maxVspaceCharacter)
		await cleanupVspace(editor) // can't guarantee that stop position is not going to be inserted if editor.edit() is done - have to undo first
		if (maxVspaceCharacter==null) return
		await doVspace(editor,insertion)
	} finally {
		releaseLock()
	}
}

async function cursorEnd() {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		const state=getDocumentState(editor.document)
		state.resetColumn()
		await cleanupVspace(editor)
		await vscode.commands.executeCommand('cursorEnd')
	} finally {
		releaseLock()
	}
}

async function cursorHorizontalMove(moveCommand:string,moveDelta:number) {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		if (editor.selections.length!=1) {
			await cleanupVspace(editor)
			await vscode.commands.executeCommand(moveCommand)
			return
		}
		await undoVspaceIfNotInside(editor)
		if (!editor.selection.isEmpty) {
			await vscode.commands.executeCommand(moveCommand) // collapses selection
			return
		}
		const position=editor.selection.active;
		const text=editor.document.lineAt(position).text
		const state=getDocumentState(editor.document)
		state.resetColumn()
		if (moveDelta>0 && position.character<text.length) {
			await vscode.commands.executeCommand(moveCommand)
			return
		}
		if (moveDelta>0 && position.character>=text.length) {
			await state.edit(editor,editBuilder=>{
				editBuilder.insert(position,' ')
			})
			if (!state.vspace) state.vspace=position
			return
		}
		if (moveDelta<0 && position.character<text.length) {
			await vscode.commands.executeCommand(moveCommand)
			return
		}
		if (moveDelta<0 && position.character>=text.length) {
			const state=getDocumentState(editor.document)
			if (state.vspace) {
				if (position.character>state.vspace.character+1) {
					await state.edit(editor,editBuilder=>{
						editBuilder.delete(new vscode.Range(new vscode.Position(position.line,position.character-1),position))
					})
				} else {
					await cleanupVspace(editor)
				}
			} else {
				await vscode.commands.executeCommand(moveCommand)
			}
			return
		}
	} finally {
		releaseLock()
	}
}

async function cursorVerticalMove(moveCommand:string) {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		if (editor.selections.length!=1) {
			await cleanupVspace(editor)
			await vscode.commands.executeCommand(moveCommand)
			return
		}
		const isWordWrapOff=vscode.workspace.getConfiguration('editor',editor.document).get('wordWrap')=='off'
		await (isWordWrapOff
			? cursorVerticalMoveWithoutWordWrap
			: cursorVerticalMoveWithWordWrap
		)(editor,moveCommand)
	} finally {
		releaseLock()
	}
}

async function cursorVerticalMoveWithoutWordWrap(editor:vscode.TextEditor,moveCommand:string) {
	const selectionBefore=editor.selection
	await vscode.commands.executeCommand(moveCommand)
	const selectionAfter=editor.selection
	const insertion=getVerticalMoveInsertion(
		Number(editor.options.tabSize),
		selectionBefore.active.character,
		editor.document.lineAt(selectionBefore.active).text,
		selectionAfter.active.character,
		editor.document.lineAt(selectionAfter.active).text
	)
	await cleanupVspace(editor)
	if (insertion!=null) {
		await doVspace(editor,insertion)
	}
}

async function cursorVerticalMoveWithWordWrap(editor:vscode.TextEditor,moveCommand:string) {
	const state=getDocumentState(editor.document)
	const getSelectionHome=async():Promise<vscode.Selection>=>{
		state.ruinedColumnHiddenState=true
		const selectionPreHome=editor.selection
		await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineEnd'})
		const wasAtEnd=selectionPreHome.isEqual(editor.selection)
		if (!wasAtEnd) {
			await vscode.commands.executeCommand('cursorUndo')
		}
		await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineStart'})
		const selectionHome=editor.selection
		if (!selectionHome.isEqual(selectionPreHome)) {
			if (!wasAtEnd) {
				await vscode.commands.executeCommand('cursorUndo') // doesn't fully restore screen position at wrap points
			} else {
				await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineEnd'})
			}
		}
		return selectionHome
	}
	const parkCursor=async(cursor:vscode.Position,eol:vscode.Position)=>{
		// makes sure that cursor after cleanup stays on the same wrapped line
		if (cursor.character==0) return // always safe
		if (cursor.isEqual(eol)) return // also safe and required to be kept by later logic
		await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineStart'})
		// ruins column state, but that's recorded by cleanupVspace() below
	}
	const wrappingIndent=String(vscode.workspace.getConfiguration('editor',editor.document).get('wrappingIndent'))
	if (!isKnownWrappingIndent(wrappingIndent)) {
		await cleanupVspace(editor)
		await vscode.commands.executeCommand(moveCommand)
		// TODO warn about unknown wrapping indent
		return
	}
	if (state.column==null) {
		const selectionHome=await getSelectionHome()
		state.column=getColumnInsideWrappedLine(
			Number(editor.options.tabSize),
			wrappingIndent,
			editor.document.lineAt(editor.selection.active).text,
			selectionHome.active.character,
			editor.selection.active.character
		)
	}
	const selectionBefore=editor.selection
	await vscode.commands.executeCommand(moveCommand)
	const lineAfter=editor.document.lineAt(editor.selection.active)
	let homedUnlessAtEol=false
	if (state.vspace) {
		if (state.column!=null) {
			await parkCursor(editor.selection.active,lineAfter.range.end)
			homedUnlessAtEol=true
		}
		// TODO more advanced parkCursor in case state.column is unknown
		await cleanupVspace(editor)
		const L=editor.document.lineCount-1
		if (
			(selectionBefore.active.line==0 && editor.selection.active.line==0 && editor.selection.active.character==0) ||
			(selectionBefore.active.line==L && editor.selection.active.line==L && editor.selection.active.character==0)
		) {
			state.column=0
			state.ruinedColumnHiddenState=false
			return
		}
	}
	if (state.column==null) return
	if (!editor.selection.active.isEqual(lineAfter.range.end)) {
		// restore cursor position by moving it
		if (state.ruinedColumnHiddenState) {
			if (!homedUnlessAtEol) await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineStart'})
			const selectionHomeAfter=editor.selection
			await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineEnd'})
			const selectionEndAfter=editor.selection
			const [targetCharacter,reachedTargetColumn]=getCharacterInsideWrappedLine(
				Number(editor.options.tabSize),
				wrappingIndent,
				lineAfter.text,
				selectionHomeAfter.active.character,
				selectionEndAfter.active.character,
				state.column
			)
			if (targetCharacter<selectionEndAfter.active.character) {
				const position=new vscode.Position(lineAfter.lineNumber,targetCharacter)
				editor.selection=new vscode.Selection(position,position)
			}
			if (reachedTargetColumn) state.ruinedColumnHiddenState=false
		}
		// assume that this restorationon can't require later vspace insertion - maybe wrong
	} else {
		// restore cursor position by adding vspace
		await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineStart'})
		const endColumn=getColumnInsideWrappedLine(
			Number(editor.options.tabSize),
			wrappingIndent,
			lineAfter.text,
			editor.selection.active.character,
			lineAfter.range.end.character
		)
		await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineEnd'})
		if (endColumn==null) return
		if (endColumn<state.column) {
			await doVspace(editor,' '.repeat(state.column-endColumn)) // TODO use getVerticalMoveInsertion to support inserting tabs
			state.ruinedColumnHiddenState=false
		}
	}
}

async function cleanupVspace(editor:vscode.TextEditor) {
	const state=getDocumentState(editor.document)
	if (!state.vspace) return
	state.vspace=undefined
	await undoKeepingSelection(editor)
	state.version=editor.document.version
	state.ruinedColumnHiddenState=true
}

async function undoVspaceIfNotInside(editor:vscode.TextEditor) {
	const state=getDocumentState(editor.document)
	if (!state.vspace) return
	const position=editor.selection.active
	if (position.line==state.vspace.line && position.character>=state.vspace.character) return
	state.vspace=undefined
	await undoKeepingSelection(editor)
	state.version=editor.document.version
	state.ruinedColumnHiddenState=true
}

async function doVspace(editor:vscode.TextEditor,insertion:string) {
	const position=editor.selection.active
	const state=getDocumentState(editor.document)
	await state.edit(editor,editBuilder=>{
		editBuilder.insert(position,insertion)
	})
	state.vspace=position
}

async function undoKeepingSelection(editor:vscode.TextEditor) {
	const savedSelections=editor.selections
	await vscode.commands.executeCommand('undo') // doesn't change number of lines
	const fixPosition=(position:vscode.Position):vscode.Position=>new vscode.Position(
		position.line,
		Math.min(position.character,editor.document.lineAt(position).range.end.character)
	)
	editor.selections=combineCoincidingSelections(savedSelections.map((selection:vscode.Selection):vscode.Selection=>new vscode.Selection(
		fixPosition(selection.anchor),
		fixPosition(selection.active)
	)))
}

let undoDocument:vscode.TextDocument|undefined
let undoDocumentText:string|undefined
let undoDocumentState:DocumentState|undefined

async function undo() {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		const state=getDocumentState(editor.document)
		if (state.vspace) {
			await vscode.commands.executeCommand('undo')
			state.vspace=undefined
			state.resetColumn()
			state.version=editor.document.version
		}
	} finally {
		releaseLock()
	}
	const releaseUndoLock=await undoLock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		undoDocument=editor.document
		undoDocumentText=undoDocument.getText()
		undoDocumentState=getDocumentState(editor.document)
		await vscode.commands.executeCommand('undo')
	} finally {
		undoDocumentState=undefined
		undoDocumentText=undefined
		undoDocument=undefined
		releaseUndoLock()
	}
}

function onDidChangeTextDocumentListener(event:vscode.TextDocumentChangeEvent) {
	if (!undoLock.isLocked()) return
	const document=event.document
	if (document!=event.document) return
	const redo:Array<[number,number,string]>=[]
	for (const change of event.contentChanges) {
		const oldText=undoDocumentText!.substr(change.rangeOffset,change.rangeLength)
		redo.push([change.rangeOffset,change.text.length,oldText])
	}
	undoDocumentState!.redos.push(redo)
	undoDocumentState!.version=document.version
}

async function redo() {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		const state=getDocumentState(editor.document)
		const redo=state.redos.pop()
		if (state.perturbedRedoStack && redo) {
			if (state.vspace) {
				await vscode.commands.executeCommand('undo')
				state.vspace=undefined
				state.resetColumn()
			}
			await doRecordedRedo(editor,redo)
		} else {
			await vscode.commands.executeCommand('redo')
		}
		state.version=editor.document.version
	} finally {
		releaseLock()
	}
}

async function doRecordedRedo(editor:vscode.TextEditor,redo:Array<[number,number,string]>) {
	await editor.edit(editBuilder=>{
		const document=editor.document
		for (const [offset,length,replacement] of redo) {
			editBuilder.replace(new vscode.Range(
				document.positionAt(offset),
				document.positionAt(offset+length)
			),replacement)
		}
	})
}
