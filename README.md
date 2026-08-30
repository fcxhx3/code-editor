# Code Editor

A small desktop code editor built with Electron and the Ace editor.

## Features

- Syntax highlighting for over 170 languages, picked from the file extension
- Autocomplete, including as you type
- Snippets (type `for` and press Tab)
- Open files by dragging them onto the window, or with Ctrl+O
- A session timer in the sidebar

## Shortcuts

| Key | Action |
| --- | --- |
| Ctrl+N | New file |
| Ctrl+O | Open files |
| Ctrl+Shift+O | Open a folder |
| Ctrl+S | Save the current file |
| Ctrl+Shift+S | Save as |
| Ctrl+W | Close the current file |
| Ctrl+F | Find |
| Ctrl+H | Replace |
| Ctrl+G | Go to line |
| Shift+Alt+F | Reformat the file |
| Alt+E | Jump to the next problem |
| Shift+Alt+E | Jump to the previous problem |
| Alt+Z | Toggle word wrap |

## Running it

```
npm install
npm start
```

## Building

```
npm run make
```

## To do

### Editing
- [x] Close a file
- [x] Mark files with unsaved changes, and warn before quitting
- [x] Save As
- [x] New file
- [x] Word wrap toggle

### Search
- [x] Find and replace
- [x] Jump to line

### Files
- [x] Folder support
- [x] Show the parent folder when two open files share a name
- [x] Refuse binary files
- [x] Notice when a file changes on disk
- [x] Reopen the last session's files on start

### Editor extras
- [x] Line and column indicator, plus language and per file time
- [x] Settings panel for theme and font size
- [x] Reformat code
- [x] Inline syntax error markers, with jump to next problem

### Timer
- [x] Reset and pause controls
- [x] Keep the total across restarts
- [x] Track time per file

### Tidy up
- [x] Rename nerd_text
- [x] Finish or delete the commented out folder stub in index.html
