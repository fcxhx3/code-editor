var editorIsLoaded = false;
var editorSplit = null;

var openPath = "";
var editor;


// Every open file owns an Ace session holding its text, undo history, cursor
// and scroll position. Once a session exists it is the live copy, and
// entry.data is only the text the file was opened with.
function file_text(entry) {
    if (!entry) {
        return "";
    }

    return entry.session ? entry.session.getValue() : entry.data;
}


// Built on demand, since a file in the list may never be looked at.
function session_for(entry) {
    if (entry.session) {
        return entry.session;
    }

    const session = ace.createEditSession(entry.data);

    session.setMode(modelist.getModeForPath(entry.path).mode, () => {
        if (editor && editor.session === session) {
            editor.renderer.updateFull(true);
        }
    });

    session.setUseWrapMode(wrapEnabled);

    session.on('change', refresh_dirty_marks);
    session.on('changeAnnotation', refresh_status);
    session.on('changeWrapMode', sync_wrap_button);
    session.selection.on('changeCursor', refresh_cursor_status);
    session.selection.on('changeSelection', refresh_cursor_status);

    entry.session = session;

    return session;
}


// A file is dirty when its text no longer matches what is on disk.
function is_dirty(entry) {
    if (!entry) {
        return false;
    }

    return file_text(entry) !== entry.saved;
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

// Empty means Ace's own bindings. The rest are loaded from basePath on demand,
// so the keybinding files need no script tags.
var keyboardPreset = "";


function set_keybindings(name) {
    keyboardPreset = name || "";

    if (editorSplit) {
        for (let i = 0; i < editorSplit.getSplits(); i++) {
            apply_keybindings(editorSplit.getEditor(i));
        }
    } else {
        apply_keybindings(editor);
    }

    if (editor) {
        editor.focus();
    }
}


function apply_keybindings(pane) {
    if (!pane) {
        return;
    }

    pane.setKeyboardHandler(keyboardPreset ? 'ace/keyboard/' + keyboardPreset : null);
}


// Saved under a new name, so move the bookkeeping across with it.
function rename_open_path(oldPath, newPath) {
    const entry = find_open_file(newPath) || find_open_file(oldPath);

    if (entry && entry.session) {
        entry.session.setMode(modelist.getModeForPath(newPath).mode, () => {
            if (editor && editor.session === entry.session) {
                editor.renderer.updateFull(true);
            }
        });
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
// ext-beautify registers a command but never attaches it to the editor, so
// execCommand('beautify') quietly does nothing. Call the module instead.
// Unlike the prompt and beautify extensions, error_marker does attach its
// commands to the editor, so execCommand is the right way in here.
function next_problem() {
    if (!editor) {
        return;
    }

    editor.execCommand('goToNextError');
}


function previous_problem() {
    if (!editor) {
        return;
    }

    editor.execCommand('goToPreviousError');
}


function count_label(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
}


function reformat_code() {
    if (!editor) {
        return;
    }

    const beautify = ace.require('ace/ext/beautify');

    if (!beautify || typeof beautify.beautify !== 'function') {
        return;
    }

    beautify.beautify(editor.session);
    editor.focus();
}


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

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].session) {
            open_file_data[i].session.setUseWrapMode(wrapEnabled);
        }
    }

    if (editor) {
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


function show_to_editor(item) {
    open_in_editor(item.dataset.path);
}


// Handing Ace a different session swaps the text, undo history, cursor and
// scroll in one move. Nothing needs saving off first, and undo can no longer
// reach past the start of the file you are looking at.
function open_in_editor(path) {
    if (!editorIsLoaded) {
        loadEditor();
        editorIsLoaded = true;
    }

    const entry = find_open_file(path);

    if (!entry) {
        return;
    }

    editor.setSession(session_for(entry));

    // Ace caches its size, refresh it or scrolling stays dead.
    editor.resize(true);

    editor.focus();
    openPath = path;
    set_active_file(path);
    refresh_status();
    show_tabs();
    save_session();
}


// Forget a file we just closed, and move on if it was the one on screen.
function forget_file(path) {
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
    if (editorSplit) {
        editorSplit.setSplits(1);
        editorSplit.getEditor(0).destroy();
        editorSplit = null;
    }

    editor = null;
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

        const idle = document.getElementById('status_disk');
        if (idle) {
            idle.innerText = "";
        }

        const idleProblems = document.getElementById('status_problems');
        if (idleProblems) {
            idleProblems.innerText = "";
        }

        refresh_cursor_status();
        return;
    }

    lang.innerText = editor.session.getMode().$id.replace('ace/mode/', '');
    time.innerText = file_time_label(openPath);

    const problems = document.getElementById('status_problems');

    if (problems) {
        const notes = editor.session.getAnnotations();
        let errors = 0;
        let warnings = 0;

        for (let i = 0; i < notes.length; i++) {
            if (notes[i].type === 'error') {
                errors++;
            } else if (notes[i].type === 'warning') {
                warnings++;
            }
        }

        const parts = [];

        if (errors > 0) {
            parts.push(count_label(errors, 'error'));
        }

        if (warnings > 0) {
            parts.push(count_label(warnings, 'warning'));
        }

        problems.innerText = parts.join(', ');
        problems.className = errors > 0 ? 'has_errors' : '';
    }

    const disk = document.getElementById('status_disk');

    if (disk) {
        const entry = find_open_file(openPath);

        if (entry && entry.missing) {
            disk.innerText = 'gone from disk';
        } else if (entry && entry.diskChanged) {
            disk.innerText = 'changed on disk';
        } else {
            disk.innerText = '';
        }
    }

    refresh_cursor_status();
}


// Everything a pane needs, applied to the second one as well when it appears.
function configure_pane(pane) {
    pane.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true,
    });

    pane.setFontSize(15);
    apply_keybindings(pane);
}


// A second pane onto another file. Ace calls these splits.
function toggle_split() {
    if (!editorSplit) {
        return;
    }

    if (editorSplit.getSplits() > 1) {
        editorSplit.setSplits(1);
        editor = editorSplit.getEditor(0);
    } else {
        editorSplit.setSplits(2);

        const second = editorSplit.getEditor(1);
        configure_pane(second);

        // Put a different file in the new pane if there is one to show.
        let other = null;

        for (let i = 0; i < open_file_data.length; i++) {
            if (open_file_data[i].path !== openPath) {
                other = open_file_data[i];
                break;
            }
        }

        if (!other) {
            other = find_open_file(openPath);
        }

        if (other) {
            second.setSession(session_for(other));
        }
    }

    editorSplit.resize(true);
    refresh_status();
}


function loadEditor() {
    ace.require("ace/ext/language_tools");

    const Split = ace.require('ace/split').Split;

    editorSplit = new Split(document.getElementById('editor'), 'ace/theme/tomorrow_night', 1);
    editor = editorSplit.getEditor(0);
    configure_pane(editor);

    // Follow whichever pane the caret is in, so the toolbar and the status bar
    // always describe what is actually being typed into.
    editorSplit.on('focus', (pane) => {
        editor = pane;
        refresh_status();
    });

    // Resize with the window.
    window.addEventListener('resize', () => editorSplit.resize(true));

    console.log("Editor Loaded!");
}
