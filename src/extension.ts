// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('fakeVirtualSpace.cursorUp',cursorUp),
		vscode.commands.registerCommand('fakeVirtualSpace.cursorDown',cursorDown)
	)
}

// this method is called when your extension is deactivated
export function deactivate() {}

function cursorUp() {
	cursorVerticalMove('cursorUp')
}

function cursorDown() {
	cursorVerticalMove('cursorDown')
}

async function cursorVerticalMove(moveCommand:string) {
	const editor=vscode.window.activeTextEditor!
	const positionBefore=editor.selection.start
	await vscode.commands.executeCommand(moveCommand)
	const positionAfter=editor.selection.start
	const insertion=getVerticalMoveInsertion(
		Number(editor.options.tabSize),
		positionBefore.character,
		editor.document.lineAt(positionBefore).text,
		positionAfter.character,
		editor.document.lineAt(positionAfter).text
	)
	if (insertion!=null) {
		editor.edit(editBuilder=>{
			editBuilder.insert(positionAfter,insertion)
		})
	}
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
