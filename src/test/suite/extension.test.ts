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
})
