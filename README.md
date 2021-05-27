# vscode-fake-virtual-space README

[VS Code](https://code.visualstudio.com/) plugin implemening what should be *virtual space* with *real space*.

Actual *virtual space* is [not implemented](https://github.com/microsoft/vscode/issues/13960) in VS Code.

Borrows some ideas from [implicit-indent plugin](https://github.com/jemc/vscode-implicit-indent).

## Description

The goal is to make the cursor to move in a certain direction no matter how long the lines of the file are.

- When `right` key is pressed, we want the cursor to move *right*, not right until the end of line and then jump left to the first column.
- When `down` key is pressed, we want the cursor to move *down*, not down if the next line is long enough otherwise jump left, or jump right to compensate for previous left jump.

It is achievable if the editor could display the cursor beyond the end-of-line (but it can't). That was a common feature of code editors back in the day up to early 2000s, then it started to disappear. For example, the ["heavy" Visual Studio](https://visualstudio.microsoft.com/vs/), being an older IDE has virtual space option, but newer Visual Studio Code doesn't.

To force this behavior, we have to pad lines with spaces if they aren't long enough. Also we have to clean up these spaces once they are not needed. While doing this, we need not to distort the undo stack too much.

## Known issues

- Drops the first character entered into the search box when inside fake vspace, then forgets to clean up fake vspace. This problem will exist for every input box displayed inside the editor if entering anything there may cause changes to the selection inside the editor. Could be fixable if there's a way of executing *undo* other than `vscode.commands.executeCommand('undo')` to direct it at the text (apparently, there's [no undo stack api](https://stackoverflow.com/questions/57900097/where-to-find-vscode-undo-stack-documentation)) or if it's possible to see whether the text has focus. Related to [editorTextFocus context](https://code.visualstudio.com/api/references/when-clause-contexts#available-contexts).
- Multiple selections are likely to work incorrectly inside fake virtual space.
- Clicking on empty space outside existing fake virtual space won't create more fake virtual space. Could be fixable if there's a mouse click event with readable click row/column.
- Document is shown as unsaved when fake virtual space exists and virtual space is not cleaned up on save. This is intended because the best solution seems to be to warn the user about saved fake space. Removing it properly is tricky if undo/redo stack is to be maintained. Normally fake space cleanup is done by executing *undo* command but it's safe to do only when the document text has focus and there's no way to check if it's the case.
- Fake virtual space state may get lost when saving untitled documents. Could be fixable if could store document metadata that persisted through saves with *untitled:* to *file:* uri changes.
