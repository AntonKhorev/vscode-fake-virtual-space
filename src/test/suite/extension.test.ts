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
		test("returns required spaces on unindented strings",()=>{
			const result=myExtension.getVerticalMoveInsertion(8,
				6,"was he!re",
				1,"!"
			)
			assert.equal(result,
				   "     "
			)
		})
	})
})
