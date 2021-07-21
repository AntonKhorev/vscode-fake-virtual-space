import {strict as assert} from 'assert'
import * as vscode from 'vscode'

import {getColumnInsideWrappedLine,getCharacterInsideWrappedLine} from '../../utility'

suite("Extension Test Suite for word wrap settings",()=>{
	vscode.window.showInformationMessage('Start word wrap tests.')
	suite("getColumnInsideWrappedLine",()=>{
		test("returns 0 for empty line",()=>{
			const result=getColumnInsideWrappedLine(8,'none',
				'',
				0,0
			)
			assert.equal(result,0)
		})
		test("returns cursor column on nonwrapped line",()=>{
			const result=getColumnInsideWrappedLine(8,'none',
				'hello',
				0,3
			)
			assert.equal(result,3)
		})
		test("returns cursor-home column difference on wrapped line",()=>{
			const result=getColumnInsideWrappedLine(8,'none',
				'hello '+
				'world',
				6,10
			)
			assert.equal(result,4)
		})
		test("returns tab-size-adjusted cursor-home column difference on unwrapped line",()=>{
			const result=getColumnInsideWrappedLine(8,'none',
			       '[helll	lo	w]o	rld',
				0,12
			)
			assert.equal(result,18)
		})
		test("returns same-wrap-indent-adjusted cursor-home column difference on wrapped line",()=>{
			const result=getColumnInsideWrappedLine(8,'same',
				'   hello '+
				   'wo!rld',
				9,11
			)
			assert.equal(result,5)
		})
		test("returns indent-wrap-indent-adjusted cursor-home column difference on wrapped line",()=>{
			const result=getColumnInsideWrappedLine(8,'indent',
				'   hello '+
					'wo!rld',
				9,11
			)
			assert.equal(result,10)
		})
		test("returns deepIndent-wrap-indent-adjusted cursor-home column difference on wrapped line",()=>{
			const result=getColumnInsideWrappedLine(8,'deepIndent',
				'   hello '+
						'wo!rld',
				9,11
			)
			assert.equal(result,18)
		})
	})
	suite("getCharacterInsideWrappedLine",()=>{
		test("reaches 0 for empty line",()=>{
			const result=getCharacterInsideWrappedLine(8,'none',
				'',
				0,0,0
			)
			assert.deepEqual(result,[0,true])
		})
		test("reaches column on unwrapped line",()=>{
			const result=getCharacterInsideWrappedLine(8,'none',
				'get !here',
				0,9,4
			)
			assert.deepEqual(result,[4,true])
		})
		test("doesn't reach column on wrapped line",()=>{
			const result=getCharacterInsideWrappedLine(8,'none',
				'12345678901234567 '+
				'12345678901 '+
				'123456789012345',
				19,31,13
			)
			assert.deepEqual(result,[31,false])
		})
		test("reaches column on with same-wrap-indent on wrapped line",()=>{
			const result=getCharacterInsideWrappedLine(8,'same',
				'   hello '+
				   'wo!rld',
				9,15,5
			)
			assert.deepEqual(result,[11,true])
		})
	})
	suite("Integration Tests",()=>{
		test("moves cursor down through word wrap",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"123456789 123456789 123456789\nnext"})
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
		test("moves cursor down along word wrap indent",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"   456789 123456789 123456789\nnext"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				const homePosition=new vscode.Position(0,3)
				editor.selection=new vscode.Selection(homePosition,homePosition)
				assert.equal(editor.selection.active.line,0)
				assert.equal(editor.selection.active.character,3)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(editor.selection.active.line,0)
				assert.equal(editor.selection.active.character,20)
				await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineStart'})
				assert.equal(editor.selection.active.character,20) // stays after wrap point
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
	})
})
