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
	characterBefore: number,
	textBefore: string,
	characterAfter: number,
	textAfter: string
): string|null {
	if (characterAfter<textAfter.length) return null
	const diff=characterBefore-characterAfter
	if (diff<=0) return null
	return ' '.repeat(diff)
}
