import {strict as assert} from 'assert'
import * as vscode from 'vscode'

suite("Extension Test Suite for word wrap settings",()=>{
	vscode.window.showInformationMessage('Start word wrap tests.')
	suite("Integration Tests",()=>{
		test("moves cursor down along word wrap indent",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"...456789 123456789 123456789\nnext"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				const homePosition=new vscode.Position(0,0)
				editor.selection=new vscode.Selection(homePosition,homePosition)
				assert.equal(editor.selection.active.line,0)
				assert.equal(editor.selection.active.character,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(editor.selection.active.line,0)
				assert.equal(editor.selection.active.character,20)
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
	})
})
