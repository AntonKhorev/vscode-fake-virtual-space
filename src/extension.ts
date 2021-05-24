import * as vscode from 'vscode'
import {Mutex} from 'async-mutex'

let lock: Mutex;
let undoLock: Mutex;

class DocumentState {
	version:number
	vspace:vscode.Position|undefined
	redos:Array<Array<[number,number,string]>>
	constructor(version:number) {
		this.version=version
		this.redos=[]
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
	vscode.workspace.onDidCloseTextDocument(document=>{
		documentStates.delete(document)
	})
	vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocumentListener)
	vscode.window.onDidChangeTextEditorSelection(async(event)=>{
		// TODO check if text has focus if possible - but looks like it's impossible
		if (lock.isLocked()) return
		const editor=event.textEditor
		const state=getDocumentState(editor.document)
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
		await doVspace(editor,insertion)
	})
	context.subscriptions.push(
		vscode.commands.registerCommand('fakeVirtualSpace.cursorUp'   ,()=>cursorVerticalMove('cursorUp')),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorDown' ,()=>cursorVerticalMove('cursorDown')),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorLeft' ,()=>cursorHorizontalMove('cursorLeft',-1)),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorRight',()=>cursorHorizontalMove('cursorRight',+1)),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorEnd',cursorEnd),
		vscode.commands.registerCommand('fakeVirtualSpace.undo',undo),
		vscode.commands.registerCommand('fakeVirtualSpace.redo',redo)
	)
}

export function deactivate() {
	// TODO do undos if necessary
}

async function cursorEnd() {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
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
		await undoVspaceIfNotInside(editor)
		const position=editor.selection.active;
		const text=editor.document.lineAt(position).text
		if (moveDelta>0 && position.character<text.length) {
			await vscode.commands.executeCommand(moveCommand)
			return
		}
		if (moveDelta>0 && position.character>=text.length) {
			const state=getDocumentState(editor.document)
			await editor.edit(editBuilder=>{
				editBuilder.insert(position,' ')
			},{undoStopBefore:false,undoStopAfter:false})
			state.version=editor.document.version
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
					await editor.edit(editBuilder=>{
						editBuilder.delete(new vscode.Range(new vscode.Position(position.line,position.character-1),position))
					},{undoStopBefore:false,undoStopAfter:false})
				} else {
					await undoVspace(editor)
				}
				state.version=editor.document.version
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
	} finally {
		releaseLock()
	}
}

async function cleanupVspace(editor:vscode.TextEditor) {
	const state=getDocumentState(editor.document)
	if (!state.vspace) return
	state.vspace=undefined
	await undoVspace(editor)
	state.version=editor.document.version
}

async function undoVspaceIfNotInside(editor:vscode.TextEditor) {
	const state=getDocumentState(editor.document)
	if (!state.vspace) return
	const position=editor.selection.active
	if (position.line==state.vspace.line && position.character>=state.vspace.character) return
	state.vspace=undefined
	await undoVspace(editor)
	state.version=editor.document.version
}

async function undoVspace(editor:vscode.TextEditor) {
	// TODO restore selection fully if it's not inside vspace
	const savedLine=editor.selection.active.line
	const savedCharacter=editor.selection.active.character
	await vscode.commands.executeCommand('undo')
	const restoredPosition=new vscode.Position(savedLine,Math.min(savedCharacter,editor.document.lineAt(savedLine).text.length))
	editor.selection=new vscode.Selection(restoredPosition,restoredPosition)
}

async function doVspace(editor:vscode.TextEditor,insertion:string) {
	const position=editor.selection.active
	const state=getDocumentState(editor.document)
	await editor.edit(editBuilder=>{
		editBuilder.insert(position,insertion)
	},{undoStopBefore:false,undoStopAfter:false})
	state.version=editor.document.version
	state.vspace=position
}

let undoDocument:vscode.TextDocument|undefined
let undoDocumentText:string|undefined

async function undo() {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		const state=getDocumentState(editor.document)
		if (state.vspace) {
			await vscode.commands.executeCommand('undo')
			state.vspace=undefined
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
		await vscode.commands.executeCommand('undo')
	} finally {
		undoDocumentText=undefined
		undoDocument=undefined
		releaseUndoLock()
	}
}

function onDidChangeTextDocumentListener(event:vscode.TextDocumentChangeEvent) {
	if (!undoLock.isLocked()) return
	const document=event.document
	if (document!=event.document) return
	const state=getDocumentState(document)
	const redo:Array<[number,number,string]>=[]
	for (const change of event.contentChanges) {
		const oldText=undoDocumentText!.substr(change.rangeOffset,change.rangeLength)
		redo.push([change.rangeOffset,change.text.length,oldText])
	}
	state.redos.push(redo)
}

async function redo() {
	const releaseLock=await lock.acquire()
	try {
		const editor=vscode.window.activeTextEditor!
		const state=getDocumentState(editor.document)
		if (state.redos.length>0) {
			if (state.vspace) {
				await vscode.commands.executeCommand('undo')
				state.vspace=undefined
			}
			await doRecordedRedo(editor,state.redos.shift()!)
			state.version=editor.document.version
		} else {
			await vscode.commands.executeCommand('redo')
		}
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

export function getVerticalMoveInsertion(
	tabSize: number,
	character1: number,
	text1: string,
	character2: number,
	text2: string
): string|null {
	if (character2<text2.length) return null
	let indent=''
	const inSameTabSlot=(width1:number,width2:number):boolean=>{
		return Math.floor(width1/tabSize)==Math.floor(width2/tabSize)
	}
	const nextWidth=(width:number,char:string):number=>{
		if (char=='\t') {
			return (Math.floor(width/tabSize)+1)*tabSize
		} else {
			return width+1
		}
	}
	const nextWidthAddingToIndent=(width:number,char:string):number=>{
		while (
			char=='\t' &&
			indent.length>0 &&
			indent[indent.length-1]==' ' &&
			inSameTabSlot(width,width-1)
		) {
			indent=indent.slice(0,-1)
			width--
		}
		indent+=char
		return nextWidth(width,char)
	}
	let prevWidth1
	let width1=0
	let width2=0
	let i2=0
	for (let i1=0;i1<character1;i1++) {
		prevWidth1=width1
		width1=nextWidth(width1,text1[i1])
		while (width2<width1) {
			if (i2<text2.length) {
				width2=nextWidth(width2,text2[i2++])
			} else if (text1[i1]=='\t' && inSameTabSlot(prevWidth1,width2)) {
				width2=nextWidthAddingToIndent(width2,'\t')
			} else {
				width2=nextWidthAddingToIndent(width2,' ')
			}
		}
	}
	if (indent=='') return null
	return indent
}
