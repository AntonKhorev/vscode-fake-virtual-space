# vscode-fake-virtual-space README

[VS Code](https://code.visualstudio.com/) plugin implemening what should be *virtual space* with *real space*.

Actual *virtual space* is [not implemented](https://github.com/microsoft/vscode/issues/13960) in VS Code.

Borrows some ideas from [implicit-indent plugin](https://github.com/jemc/vscode-implicit-indent).

## Description

The goal is to make the cursor to move in a certain direction no matter how long the lines of the file are.

- When `right` key is pressed, we want the cursor to move *right*, not right until the end of line and then jump left to the first column.
- When `down` key is pressed, we want the cursor to move *down*, not down if the next line is long enough otherwise jump left, or jump right to compensate for previous left jump.

It is achievable if the editor could display the cursor beyond the end-of-line (but it can't). That was a common feature of code editors back in the day up to early 2000s, then it started to disappear. For example, the ["heavy" Visual Studio](https://visualstudio.microsoft.com/vs/), being an older IDE has virtual space option, but newer Visual Studio Code doesn't.

To force this behavior, we have to pad lines with spaces if they aren't long enough when the cursor is moved into the purported virtual space. Also we have to clean up these spaces once they are not needed. While doing this, we must not distort the undo stack too much. This is achieved by using only the top position of the undo stack for padding spaces making it possible to remove them with a single undo. In addition to that we need to maintain our own redo stack to be able to perform redos without the interference of padding spaces.

## Configuration

This plugin adds the following movement commands and binds them to the arrow keys and to the *end* key:

- `fakeVirtualSpace.cursorUp`
- `fakeVirtualSpace.cursorDown`
- `fakeVirtualSpace.cursorLeft`
- `fakeVirtualSpace.cursorRight`
- `fakeVirtualSpace.cursorEnd`

It also adds the undo/redo commands and binds them to *Ctrl+Z/Y*:

- `fakeVirtualSpace.undo`
- `fakeVirtualSpace.redo`

## Known issues

- Multiple cursors don't cause fake virtual space to appear.
- Fake vspace is not cleaned up when the *find/replace* popup causes selection changes. This is difficult to fix because cleaning up is done with the *undo* command and the popup is going to receive this command when in focus. See reason 2 below.
- Clicking on empty space outside existing fake vspace won't create more fake vspace. See reason 3 below.
- Document is shown as unsaved when fake vspace exists and vspace is not cleaned up on save. This is intended because the best solution seems to be to warn the user about saved fake space. Removing it properly is tricky if undo/redo stack is to be maintained because of reasons 1 and 2 described below.
- Fake vspace state may get lost when saving untitled documents. Could be fixable if could store document metadata that persisted through saves with *untitled:* to *file:* uri changes.
- Move/copy line up/down burns in fake vspace. It's easy to fix by introducing more keybindings but I'm not sure if it's worth it.
- If word wrap is on, handling fake vspace requires more cursor movements to probe its actual location. See reasons 4 and 5 below, basically the current column is inaccessible directly.

Some of these issues are difficult to fix because:

1. There's [no undo stack api](https://stackoverflow.com/questions/57900097/where-to-find-vscode-undo-stack-documentation), the stack can only be manipulated by running *undo/redo* commands. Undos are used to alter/clean up fake vspace in order not to clog the stack with these changes.
2. *Undo/redo* commands are going to work as intended only if the document text has focus yet it's impossible to check if it's the case from inside of the command/event handler code. It's possible to check from [keybindings *when clauses*](https://code.visualstudio.com/api/references/when-clause-contexts#available-contexts) though.
3. [No mouse pointer events are provided by the api](https://github.com/Microsoft/vscode/issues/47239). It's only possible to know that the cursor has moved to some (line,character)-position that is always inside the existing text, not (x,y)-position that exist independently of the text.
4. [No wrapping information is provided by the api](https://github.com/microsoft/vscode/issues/23045#issuecomment-289383977).
5. The on-screen cursor location is not fully specified by `editor.selection` when word wrap is on. A line break caused by word wrap is going to have two on-screen locations with the same character coordinate, right before the break and right after the break. What's worse, `cursorUndo` command is not guaranteed to restore the exact on-screen location in this case.