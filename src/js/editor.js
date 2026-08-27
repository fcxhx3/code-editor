var editorIsLoaded = false;

var openPath = "";
var recentlyOpen = [];
var editor;


// A file is dirty when its text no longer matches what is on disk. The file on
// screen lives in Ace, the rest live in open_file_data.
function is_dirty(entry) {
    if (!entry) {
        return false;
    }
    const current = (entry.path === openPath && editor) ? editor.getValue() : entry.data;
    return current !== entry.saved;
}


// Names of every file with unsaved changes. The main process calls this on quit.
function unsaved_file_names() {
    const names = [];
    for (let i = 0; i < open_file_data.length; i++) {
        if (is_dirty(open_file_data[i])) {
            names.push(open_file_data[i].name);
        }
    }
    return names;
}


// Redraw the sidebar only when the set of dirty files actually changes.
var lastDirtyKey = "";

function refresh_dirty_marks() {
    let key = "";
    for (let i = 0; i < open_file_data.length; i++) {
        if (is_dirty(open_file_data[i])) {
            key += open_file_data[i].path + "|";
        }
    }
    if (key !== lastDirtyKey) {
        lastDirtyKey = key;
        show_files();
    }
}


var wrapEnabled = false;


// Saved under a new name, so move the bookkeeping across with it.
function rename_open_path(oldPath, newPath) {
    for (let i = 0; i < recentlyOpen.length; i++) {
        if (recentlyOpen[i].path === oldPath) {
            recentlyOpen[i].path = newPath;
            break;
        }
    }

    if (openPath === oldPath) {
        openPath = newPath;
    }

    move_file_time(oldPath, newPath);
}


// Ace's own search box. Guarded because there is no editor until a file opens.
function open_find() {
    if (!editor) {
        return;
    }

    editor.execCommand('find');
}


// ext-prompt hangs gotoLine off the exported prompt function rather than
// registering an editor command, and Ace's built-in gotoline uses window.prompt,
// which Electron does not support.
function open_goto_line() {
    if (!editor) {
        return;
    }

    const prompt = ace.require('ace/ext/prompt').prompt;

    if (prompt && prompt.gotoLine) {
        prompt.gotoLine(editor);
    }
}


function open_replace() {
    if (!editor) {
        return;
    }

    editor.execCommand('replace');
}


// The settings panel can change wrap too, so the button label is driven off
// the session rather than off our own variable.
function sync_wrap_button() {
    if (editor) {
        wrapEnabled = editor.session.getUseWrapMode();
    }

    const button = document.getElementById('wrap_button');
    if (button) {
        button.innerText = wrapEnabled ? 'Word Wrap: on' : 'Word Wrap: off';
    }
}


function toggle_word_wrap() {
    wrapEnabled = !wrapEnabled;

    if (editor) {
        editor.session.setUseWrapMode(wrapEnabled);
        editor.focus();
    }

    sync_wrap_button();
}


// Ace's own settings panel: theme, font size, tab width and the rest.
function open_settings() {
    if (!editor) {
        return;
    }

    const settings = ace.require('ace/ext/settings_menu');

    if (settings && settings.init) {
        settings.init(editor);
        editor.showSettingsMenu();
    }
}


function findRecent(path) {
    for (let i = 0; i < recentlyOpen.length; i++) {
        if (recentlyOpen[i].path === path) {
            return recentlyOpen[i];
        }
    }
    return null;
}


// Save cursor, scroll and text of the file we are leaving.
function saveCurrentState() {
    if (!editor || openPath === "") {
        return;
    }

    let entry = findRecent(openPath);
    if (!entry) {
        entry = {path: openPath, cursor: null, scrollTop: 0};
        recentlyOpen.push(entry);
    }
    entry.cursor = editor.getCursorPosition();
    entry.scrollTop = editor.session.getScrollTop();

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].path === openPath) {
            open_file_data[i].data = editor.getValue();
            break;
        }
    }
}


function show_to_editor(item) {
    open_in_editor(item.dataset.path);
}


function open_in_editor(path) {
    if (!editorIsLoaded) {
        loadEditor();
        editorIsLoaded = true;
    } else {
        saveCurrentState();
    }

    const previous = findRecent(path);

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].path === path) {
            editor.setValue(open_file_data[i].data, -1);
            break;
        }
    }

    // Mode loads async, repaint when it lands or the first file gets no colours.
    editor.session.setMode(modelist.getModeForPath(path).mode, () => {
        editor.renderer.updateFull(true);
    });

    // Ace caches its size, refresh it or scrolling stays dead.
    editor.resize(true);

    if (previous) {
        if (previous.cursor) {
            editor.moveCursorToPosition(previous.cursor);
            editor.clearSelection();
        }
        // Ace scrolls its own viewport, not the div.
        editor.session.setScrollTop(previous.scrollTop);
    } else {
        recentlyOpen.push({path: path, cursor: {row: 0, column: 0}, scrollTop: 0});
    }

    editor.focus();
    openPath = path;
    set_active_file(path);
    refresh_status();
}


// Forget a file we just closed, and move on if it was the one on screen.
function forget_file(path) {
    for (let i = 0; i < recentlyOpen.length; i++) {
        if (recentlyOpen[i].path === path) {
            recentlyOpen.splice(i, 1);
            break;
        }
    }

    if (openPath !== path) {
        return;
    }

    openPath = "";

    if (open_file_data.length > 0) {
        open_in_editor(open_file_data[0].path);
        return;
    }

    showEmptyState();
}


// Nothing left open, so tear Ace down and put the hint back.
function showEmptyState() {
    if (editor) {
        editor.destroy();
        editor = null;
    }
    editorIsLoaded = false;
    openPath = "";
    set_active_file("");

    refresh_status();

    const container = document.getElementById('editor');
    container.className = "";
    container.removeAttribute('style');
    container.innerHTML = '<center><div id="empty_hint">Drop files here or press Ctrl+O</div></center>';
}


// Ace's own status bar counts rows and columns from zero, which matches neither
// the gutter nor what anyone expects, so the readout is built here instead.
function refresh_cursor_status() {
    const host = document.getElementById('status_ace');

    if (!host) {
        return;
    }

    if (!editor || openPath === "") {
        host.innerText = "";
        return;
    }

    const pos = editor.getCursorPosition();
    let text = 'Ln ' + (pos.row + 1) + ', Col ' + (pos.column + 1);

    const selected = editor.getSelectedText();

    if (selected.length > 0) {
        text += ' (' + selected.length + ' selected)';
    }

    host.innerText = text;
}


// The right hand end of the status bar, which Ace does not manage.
function refresh_status() {
    const lang = document.getElementById('status_lang');
    const time = document.getElementById('status_time');

    if (!lang || !time) {
        return;
    }

    if (!editor || openPath === "") {
        lang.innerText = "";
        time.innerText = "";
        refresh_cursor_status();
        return;
    }

    lang.innerText = editor.session.getMode().$id.replace('ace/mode/', '');
    time.innerText = file_time_label(openPath);

    refresh_cursor_status();
}


function loadEditor() {
    ace.require("ace/ext/language_tools");
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/tomorrow_night");
    editor.session.setMode("ace/mode/javascript");
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true,
    });
    editor.setFontSize(15)

    editor.selection.on('changeCursor', refresh_cursor_status);
    editor.selection.on('changeSelection', refresh_cursor_status);
    editor.session.setUseWrapMode(wrapEnabled);

    // The settings panel can change wrap behind our back.
    editor.session.on('changeWrapMode', sync_wrap_button);

    // Show and clear the unsaved marker as you type.
    editor.on('change', refresh_dirty_marks);

    // Resize with the window.
    window.addEventListener('resize', () => editor.resize(true));

    console.log("Editor Loaded!");
}
