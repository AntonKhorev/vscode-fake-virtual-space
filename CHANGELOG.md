# Change Log

All notable changes to the "vscode-fake-virtual-space" extension will be documented in this file.

## 0.0.8

- Disable fake vspace for multiple cursors because it worked only for the first one
- Collapse the selection on horizontal movement attempt when the cursor is at the end of the line

## 0.0.7

- Removed some autocomplete/hint restrictions from keybindings
- Fix for selection change when the cursor stays on the same line
- Attempt selection change cleanups only on keyboard/mouse-caused changes

## 0.0.6

- Bug fixes related to undo/redo
- Don't clean up fake virtual space on save, warn the user instead

## 0.0.5

- Clean up fake virtual space on save

## 0.0.4

- Bug fixes related to undo/redo

## 0.0.3

- Some support for redos

## 0.0.2

- Less flickering when moving the cursor horizontally inside fake vspace
- When clicked inside fake virtual space, trims it up to the click position instead of removing it completely

## 0.0.1

- Test version
