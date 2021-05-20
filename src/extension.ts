import * as vscode from 'vscode'

const documentVersionsAfterFiddle:Map<vscode.TextDocument,number>=new Map()

export function activate(context: vscode.ExtensionContext) {
	vscode.workspace.onDidCloseTextDocument(document=>{
		documentVersionsAfterFiddle.delete(document)
	})
	context.subscriptions.push(
		vscode.commands.registerCommand('fakeVirtualSpace.cursorUp',cursorUp),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorDown',cursorDown),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorRight',cursorRight)
	)
}

export function deactivate() {
	// TODO do undos if necessary
}

async function cursorRight() {
	const editor=vscode.window.activeTextEditor!
	const selectionBefore=editor.selection
	const textBefore=editor.document.lineAt(selectionBefore.active).text
	if (selectionBefore.active.character<textBefore.length) {
		await vscode.commands.executeCommand('cursorRight')
		return
	}
	await undoFiddleIfNecessary(editor)
	const selectionAfter=editor.selection
	const nSpacesRequired=selectionBefore.active.character+1-selectionAfter.active.character
	if (nSpacesRequired>0) {
		await editor.edit(editBuilder=>{
			editBuilder.insert(selectionAfter.active,' '.repeat(nSpacesRequired))
		})
		rememberFiddle(editor)
	}
}

function cursorUp() {
	cursorVerticalMove('cursorUp')
}

function cursorDown() {
	cursorVerticalMove('cursorDown')
}

async function cursorVerticalMove(moveCommand:string) {
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
	await undoFiddleIfNecessary(editor,()=>{
		editor.selection=selectionAfter
	})
	if (insertion!=null) {
		await editor.edit(editBuilder=>{
			editBuilder.insert(selectionAfter.active,insertion)
		})
		rememberFiddle(editor)
	}
}

async function undoFiddleIfNecessary(editor:vscode.TextEditor,doAfterUndo=()=>{}) {
	const versionForUndo=documentVersionsAfterFiddle.get(editor.document)
	documentVersionsAfterFiddle.delete(editor.document)
	if (versionForUndo===editor.document.version) {
		await vscode.commands.executeCommand('undo')
		doAfterUndo()
	}
}

function rememberFiddle(editor:vscode.TextEditor) {
	documentVersionsAfterFiddle.set(editor.document,editor.document.version)
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
