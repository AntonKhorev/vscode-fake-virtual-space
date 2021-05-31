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

- Multiple cursors don't cause fake virtual space to appear.
- When inside fake vspace, adding another cursor causes existing cursor to disappear.
- Does not clean up fake vspace when find/replace popup causes selection change.
- Clicking on empty space outside existing fake vspace won't create more fake vspace. Could be fixable if there's a mouse click event with readable click row/column.
- Document is shown as unsaved when fake vspace exists and vspace is not cleaned up on save. This is intended because the best solution seems to be to warn the user about saved fake space. Removing it properly is tricky if undo/redo stack is to be maintained because of reasons 1 and 2 described below.
- Fake vspace state may get lost when saving untitled documents. Could be fixable if could store document metadata that persisted through saves with *untitled:* to *file:* uri changes.
- Move/copy line up/down burns in fake vspace. It's easy to fix by introducing more keybindings but I'm not sure if it's worth it.

Some of these issues are difficult to fix because:

1. There's [no undo stack api](https://stackoverflow.com/questions/57900097/where-to-find-vscode-undo-stack-documentation), the stack can only be manipulated by running *undo/redo* commands. Undos are used to alter/clean up fake vspace in order not to clog the stack with these changes.
2. *Undo/redo* commands are going to work as intended only if the document text has focus yet it's impossible to check if it's the case from inside of the command/event handler code. It's possible to check from [keybindings *when clauses*](https://code.visualstudio.com/api/references/when-clause-contexts#available-contexts) though.
