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
		const testCursor=async(
			title:string,
			content:string,
			startLine:number,
			startCharacter:number,
			testBody:(
				assertCursor:(line:number,character:number)=>void
			)=>void
		)=>{
			test(title,async()=>{
				const document=await vscode.workspace.openTextDocument({content})
				const editor=await vscode.window.showTextDocument(document)
				const assertCursor=(line:number,character:number)=>assert.deepEqual(
					editor.selection.active,new vscode.Position(line,character)
				)
				try {
					const startPosition=new vscode.Position(startLine,startCharacter)
					editor.selection=new vscode.Selection(startPosition,startPosition)
					await testBody(assertCursor)
				} finally {
					await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
				}
			})
		}
		testCursor("creates vspace and moves up twice, cleaning vspace on first move",
			"\n",0,0,
			async(assertCursor)=>{
				assertCursor(0,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assertCursor(0,1)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorUp")
				assertCursor(0,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorUp")
				assertCursor(0,0)
			}
		)
		testCursor("creates vspace and moves up twice, cleaning vspace on second move",
			"\n\n",1,0,
			async(assertCursor)=>{
				assertCursor(1,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorRight")
				assertCursor(1,1)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorUp")
				assertCursor(0,1)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorUp")
				assertCursor(0,0)
			}
		)
		testCursor("moves cursor down from empty line to next line",
			"\nnext\n",0,0,
			async(assertCursor)=>{
				assertCursor(0,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assertCursor(1,0)
			}
		)
		testCursor("moves cursor up to first empty line adding vspace",
			"\nnext\n",1,4,
			async(assertCursor)=>{
				assertCursor(1,4)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorUp")
				assertCursor(0,4)
			}
		)
		testCursor("moves cursor down-up-end-down to next shorter line",
			"asdfg\nas\n",0,0,
			async(assertCursor)=>{
				assertCursor(0,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assertCursor(1,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorUp")
				assertCursor(0,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorEnd")
				assertCursor(0,5)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assertCursor(1,5)
			}
		)
		testCursor("moves cursor down through word wrap",
			"123456789 123456789 123456789\nnext",0,0,
			async(assertCursor)=>{
				assertCursor(0,0)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assertCursor(0,20)
			}
		)
		testCursor("moves cursor down along word wrap indent",
			"   456789 123456789 123456789\nnext",0,3,
			async(assertCursor)=>{
				assertCursor(0,3)
				await vscode.commands.executeCommand("fakeVirtualSpace.cursorDown")
				assertCursor(0,20)
				await vscode.commands.executeCommand('cursorMove',{to:'wrappedLineStart'})
				assertCursor(0,20) // stays after wrap point
			}
		)
	})
})
