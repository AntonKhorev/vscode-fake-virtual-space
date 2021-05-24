import {strict as assert} from 'assert'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode'
import * as myExtension from '../../extension'

suite("Extension Test Suite",()=>{
	vscode.window.showInformationMessage('Start all tests.');
	suite("getVerticalMoveInsertion",()=>{
		test("returns null when moved to a position not at eol",()=>{
			const result=myExtension.getVerticalMoveInsertion(8,
				5,"was h!ere",
				7,"came so!mewhere for some reason"
			)
			assert.equal(result,null)
		})
		test("returns required spaces on unindented lines",()=>{
			const result=myExtension.getVerticalMoveInsertion(8,
				6,"was he!re",
				1,"!"
			)
			assert.equal(result,
				   "     "
			)
		})
		test("returns required tabs+spaces for a blank line after tab-indented line",()=>{
			const result=myExtension.getVerticalMoveInsertion(8,
				3,"\t[1!,2,3]",
				0,""
			)
			assert.equal(result,
				  "\t  "
			)
		})
		test("returns required tabs+spaces for a short line after tab-indented line",()=>{
			const result=myExtension.getVerticalMoveInsertion(4,
				3,"\t[1!,2,3]",
				1,"!"
			)
			assert.equal(result,
				  "\t  "
			)
		})
		test("returns required spaces for a longer line after tab-indented line",()=>{
			const result=myExtension.getVerticalMoveInsertion(4,
				3,"\t[1!,2,3]",
				4,"!!!!"
			)
			assert.equal(result,
				"  "
			)
		})
		test("returns only tabs for an empty line after undindented line with tab at end",()=>{
			const result=myExtension.getVerticalMoveInsertion(8,
				4,"xyz\t",
				0,""
			)
			assert.equal(result,
				"\t"
			)
		})
	})
	suite("Integration Tests",()=>{
		test("does horizontal movement vspace expansion",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"begin("})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"begin(")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"begin( ")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"begin(  ")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("does horizontal movement vspace shrinking after expansion",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"begin("})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"begin(  ")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorLeft")
				assert.equal(document.getText(),"begin( ")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorLeft")
				assert.equal(document.getText(),"begin(")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorLeft")
				assert.equal(document.getText(),"begin(")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("cleans up horizontal movement vspace by vertical movement",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"1(\n2("})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"1(\n2(")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"1( \n2(")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"1(  \n2(")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(document.getText(),"1(\n2(  ")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("keeps tabs produced by vertical movement when doing horizontal movement",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"\t\t\tx\n"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				assert.equal(document.getText(),
					"\t\t\tx\n"
				)
				await vscode.commands.executeCommand("cursorEnd")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(document.getText(),
					"\t\t\tx\n"+
					"\t\t\t "
				)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),
					"\t\t\tx\n"+
					"\t\t\t  "
				)
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("does undo past vspace addition",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"abc\n"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"abc\n")
				const position=editor.selection.active;
				await editor.edit(editBuilder=>{
					editBuilder.insert(position,'def')
				})
				assert.equal(document.getText(),"abcdef\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"abcdef \n")
				await vscode.commands.executeCommand("fakeVirtualSpace.undo")
				assert.equal(document.getText(),"abc\n")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("maintains redo stack",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"abc\n"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"abc\n")
				const position=editor.selection.active;
				await editor.edit(editBuilder=>{
					editBuilder.insert(position,'def')
				})
				assert.equal(document.getText(),"abcdef\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.undo")
				assert.equal(document.getText(),"abc\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(document.getText(),"abc\n   ")
				await vscode.commands.executeCommand("fakeVirtualSpace.redo")
				assert.equal(document.getText(),"abcdef\n")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
	})
})
