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
| Ctrl+S | Save the current file |
| Ctrl+Shift+S | Save as |
| Ctrl+W | Close the current file |
| Ctrl+F | Find |
| Ctrl+H | Replace |
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
- [ ] Jump to line (ext-prompt.js)

### Files
- [ ] Folder support. The open_folder stub and its CSS are already written
- [ ] Show the parent folder when two open files share a name
- [ ] Refuse binary files. They load as garbled text, and saving one back would corrupt it
- [ ] Notice when a file changes on disk
- [ ] Reopen the last session's files on start

### Editor extras
- [ ] Line and column indicator (ext-statusbar.js)
- [ ] Settings panel for theme and font size (ext-settings_menu.js, ext-themelist.js)
- [ ] Reformat code (ext-beautify.js)
- [ ] Inline syntax error markers (ext-error_marker.js)

### Timer
- [ ] Reset and pause controls
- [ ] Keep the total across restarts
- [ ] Track time per file

### Tidy up
- [ ] Rename nerd_text, it no longer matches the text it holds
- [ ] Finish or delete the commented out folder stub in index.html

## License

MIT
