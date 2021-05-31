import {strict as assert} from 'assert'
import * as fs from 'fs'

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
	suite("combineCoincidingSelections",()=>{
		test("keeps single selection",()=>{
			const selection=new vscode.Selection(new vscode.Position(10,3),new vscode.Position(12,5))
			const result=myExtension.combineCoincidingSelections([selection])
			assert.deepEqual(result,[selection])
		})
		test("keeps double nonoverlapping nonempty selections",()=>{
			const selection1=new vscode.Selection(new vscode.Position(10,3),new vscode.Position(12,5))
			const selection2=new vscode.Selection(new vscode.Position(42,0),new vscode.Position(42,7))
			const result=myExtension.combineCoincidingSelections([selection1,selection2])
			assert.deepEqual(result,[selection1,selection2])
		})
		test("keeps double nonoverlapping empty selections",()=>{
			const selection1=new vscode.Selection(new vscode.Position(4,6),new vscode.Position(4,6))
			const selection2=new vscode.Selection(new vscode.Position(5,1),new vscode.Position(5,1))
			const result=myExtension.combineCoincidingSelections([selection1,selection2])
			assert.deepEqual(result,[selection1,selection2])
		})
		test("joins double coinciding empty selections",()=>{
			const selection1=new vscode.Selection(new vscode.Position(4,6),new vscode.Position(4,6))
			const selection2=new vscode.Selection(new vscode.Position(4,6),new vscode.Position(4,6))
			const result=myExtension.combineCoincidingSelections([selection1,selection2])
			assert.deepEqual(result,[selection1])
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
		test("keeps typed text when cleaning up virtual space",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"begin(\n"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"begin(\n")
				await vscode.commands.executeCommand("type",{"text":"1"})
				assert.equal(document.getText(),"begin(1\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"begin(1 \n")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(document.getText(),
					"begin(1\n"+
					"        "
				)
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("moves cursor horizontally out of vspace",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"12345"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(editor.selection.active.character,5)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(editor.selection.active.character,6)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorLeft")
				assert.equal(editor.selection.active.character,5)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorLeft")
				assert.equal(editor.selection.active.character,4)
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("horizontal movement first collapses the selection then moves into vspace",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"12345"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				editor.selection=new vscode.Selection(0,0,0,5)
				assert.equal(document.getText(),"12345")
				assert.equal(editor.selection.anchor.character,0)
				assert.equal(editor.selection.active.character,5)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"12345")
				assert.equal(editor.selection.anchor.character,5)
				assert.equal(editor.selection.active.character,5)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"12345 ")
				assert.equal(editor.selection.anchor.character,6)
				assert.equal(editor.selection.active.character,6)
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		/* behaves differently when run as a test
		test("removes fake vspace on home",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"x"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"x")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assert.equal(document.getText(),"x ")
				await vscode.commands.executeCommand("cursorHome")
				assert.equal(document.getText(),"x")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		*/
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
		test("does multiple undos followed by multiple redos",async()=>{
			const document=await vscode.workspace.openTextDocument({content:""})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorEnd") // activate
				assert.equal(document.getText(),"")
				await editor.edit(editBuilder=>{
					editBuilder.insert(new vscode.Position(0,0),'abc')
				})
				assert.equal(document.getText(),"abc")
				await editor.edit(editBuilder=>{
					editBuilder.insert(new vscode.Position(0,3),'def')
				})
				assert.equal(document.getText(),"abcdef")
				await vscode.commands.executeCommand("fakeVirtualSpace.undo")
				assert.equal(document.getText(),"abc")
				await vscode.commands.executeCommand("fakeVirtualSpace.undo")
				assert.equal(document.getText(),"")
				await vscode.commands.executeCommand("fakeVirtualSpace.redo")
				assert.equal(document.getText(),"abc")
				await vscode.commands.executeCommand("fakeVirtualSpace.redo")
				assert.equal(document.getText(),"abcdef")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		test("maintains single-operation redo stack with virtual space edits",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"abc\n"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				await vscode.commands.executeCommand("cursorEnd")
				assert.equal(document.getText(),"abc\n")
				const position=editor.selection.active
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
		test("maintains multiple-operation redo stack with virtual space edits",async()=>{
			const document=await vscode.workspace.openTextDocument({content:"abc\n"})
			const editor=await vscode.window.showTextDocument(document)
			try {
				assert.equal(document.getText(),"abc\n")
				await vscode.commands.executeCommand("cursorEnd")
				await editor.edit(editBuilder=>{
					editBuilder.insert(editor.selection.active,'def')
				})
				assert.equal(document.getText(),"abcdef\n")
				await vscode.commands.executeCommand("cursorEnd")
				await editor.edit(editBuilder=>{
					editBuilder.insert(editor.selection.active,'ghi')
				})
				assert.equal(document.getText(),"abcdefghi\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.undo")
				assert.equal(document.getText(),"abcdef\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.undo")
				assert.equal(document.getText(),"abc\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assert.equal(document.getText(),"abc\n   ")
				await vscode.commands.executeCommand("fakeVirtualSpace.redo")
				assert.equal(document.getText(),"abcdef\n")
				await vscode.commands.executeCommand("fakeVirtualSpace.redo")
				assert.equal(document.getText(),"abcdefghi\n")
			} finally {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			}
		})
		/* making these work is too much trouble
		test("cleans up vspace on save",async()=>{
			const filename=`${__dirname}/vspace-save-cleanup-test.txt`
			fs.writeFileSync(filename,"")
			try {
				const document=await vscode.workspace.openTextDocument(filename)
				const editor=await vscode.window.showTextDocument(document)
				try {
					assert.equal(document.getText(),"")
					await editor.edit(editBuilder=>{
						editBuilder.insert(editor.selection.active,'123')
					})
					await vscode.commands.executeCommand("cursorEnd")
					assert.equal(document.getText(),"123")
					await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
					assert.equal(document.getText(),"123 ")
					await document.save()
					const text=String(fs.readFileSync(filename))
					assert.equal(text,"123")
				} finally {
					await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
				}
			} finally {
				fs.unlinkSync(filename)
			}
		})
		test("restores vspace after save",async()=>{
			const filename=`${__dirname}/vspace-save-restore-test.txt`
			fs.writeFileSync(filename,"")
			try {
				const document=await vscode.workspace.openTextDocument(filename)
				const editor=await vscode.window.showTextDocument(document)
				try {
					assert.equal(document.getText(),"")
					await editor.edit(editBuilder=>{
						editBuilder.insert(editor.selection.active,'123')
					})
					await vscode.commands.executeCommand("cursorEnd")
					assert.equal(document.getText(),"123")
					await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
					assert.equal(document.getText(),"123 ")
					await document.save()
					assert.equal(document.getText(),"123 ")
				} finally {
					await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
				}
			} finally {
				fs.unlinkSync(filename)
			}
		})
		test("maintains redo after save",async()=>{
			const filename=`${__dirname}/vspace-save-redo-test.txt`
			fs.writeFileSync(filename,"")
			try {
				const document=await vscode.workspace.openTextDocument(filename)
				const editor=await vscode.window.showTextDocument(document)
				try {
					assert.equal(document.getText(),"")
					await editor.edit(editBuilder=>{
						editBuilder.insert(editor.selection.active,'123')
					})
					assert.equal(document.getText(),"123")
					await vscode.commands.executeCommand("cursorEnd")
					await editor.edit(editBuilder=>{
						editBuilder.insert(editor.selection.active,'456')
					})
					assert.equal(document.getText(),"123456")
					await vscode.commands.executeCommand("fakeVirtualSpace.undo")
					assert.equal(document.getText(),"123")
					await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
					assert.equal(document.getText(),"123 ")
					await document.save()
					assert.equal(document.getText(),"123 ")
					await vscode.commands.executeCommand("fakeVirtualSpace.redo")
					assert.equal(document.getText(),"123456")
				} finally {
					await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
				}
			} finally {
				fs.unlinkSync(filename)
			}
		})
		*/
	})
})
