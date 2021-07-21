import * as path from 'path'

import { runTests } from 'vscode-test'

async function main() {
	try {
		const extensionDevelopmentPath=path.resolve(__dirname,'../../')
		{
			const extensionTestsPath=path.resolve(__dirname,'./suite/index')
			await runTests({
				extensionDevelopmentPath,
				extensionTestsPath
			})
		}
		{
			const extensionTestsPath=path.resolve(__dirname,'./suite-wrap/index')
			const extensionTestsWorkspace=path.resolve(extensionDevelopmentPath,'./src/test/suite-wrap/workspace')
			await runTests({
				extensionDevelopmentPath,
				extensionTestsPath,
				launchArgs: [extensionTestsWorkspace]
			})
		}
	} catch (err) {
		console.error('Failed to run tests')
		process.exit(1)
	}
}

main()
