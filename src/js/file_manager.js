const fs = require('fs');
const nodePath = require('path');
const { ipcRenderer } = require('electron');
var modelist = ace.require("ace/ext/modelist")

var open_file_data = []

function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target);
}


var refused_files = [];


// Null bytes, or a lot of control characters, mean this is not text. Reading
// such a file as utf-8 shows garbage, and saving it back would overwrite the
// original with that garbage.
function looks_binary(filePath) {
    const SAMPLE = 8000;
    let fd;

    try {
        fd = fs.openSync(filePath, 'r');
        const chunk = Buffer.alloc(SAMPLE);
        const read = fs.readSync(fd, chunk, 0, SAMPLE, 0);

        let control = 0;

        for (let i = 0; i < read; i++) {
            const byte = chunk[i];

            if (byte === 0) {
                return true;
            }

            // anything below space that is not tab, newline or carriage return
            if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
                control++;
            }
        }

        return read > 0 && (control / read) > 0.1;
    } catch (error) {
        console.log(error);
        return false;
    } finally {
        if (fd !== undefined) {
            try {
                fs.closeSync(fd);
            } catch (error) {
                console.log(error);
            }
        }
    }
}


// Say once what was skipped, rather than one popup per file.
function report_refused() {
    if (refused_files.length === 0) {
        return;
    }

    const names = refused_files.join(', ');
    refused_files = [];

    alert('Not opened, these look like binary files: ' + names);
}


// Enough to tell whether the file has been written since we last read it.
function stat_signature(filePath) {
    try {
        const info = fs.statSync(filePath);
        return info.mtimeMs + ':' + info.size;
    } catch (error) {
        return "";
    }
}


// Pull the file back off disk. Cursor and scroll are put back afterwards so a
// reload does not throw away where you were.
function reload_from_disk(entry) {
    let text;

    try {
        text = fs.readFileSync(entry.path, 'utf-8');
    } catch (error) {
        console.log(error);
        entry.missing = true;
        return false;
    }

    entry.data = text;
    entry.saved = text;
    entry.disk = stat_signature(entry.path);
    entry.diskChanged = false;
    entry.missing = false;

    if (entry.session) {
        const cursor = entry.session.selection.getCursor();
        const scroll = entry.session.getScrollTop();

        entry.session.setValue(text);
        entry.session.selection.moveToPosition(cursor);
        entry.session.setScrollTop(scroll);
    }

    return true;
}


// A file with no unsaved edits is reloaded quietly, since there is nothing to
// lose. One that has been edited here is only flagged, and left alone.
function check_disk_changes() {
    let touched = false;

    for (let i = 0; i < open_file_data.length; i++) {
        const entry = open_file_data[i];

        if (entry.untitled) {
            continue;
        }

        const now = stat_signature(entry.path);

        if (now === entry.disk) {
            if (entry.diskChanged || entry.missing) {
                entry.diskChanged = false;
                entry.missing = false;
                touched = true;
            }
            continue;
        }

        if (now === "") {
            if (!entry.missing) {
                entry.missing = true;
                entry.diskChanged = true;
                touched = true;
            }
            continue;
        }

        if (!is_dirty(entry)) {
            reload_from_disk(entry);
            touched = true;
        } else if (!entry.diskChanged) {
            entry.diskChanged = true;
            entry.missing = false;
            touched = true;
        }
    }

    if (touched) {
        show_files();
        refresh_status();
    }
}


// Reload whatever is on screen, asking first if it would discard edits.
function reload_current_file() {
    if (openPath === "") {
        return;
    }

    const entry = find_open_file(openPath);

    if (!entry) {
        return;
    }

    if (is_dirty(entry) && !confirm('Throw away the unsaved changes in ' + entry.name + ' and reload it from disk?')) {
        return;
    }

    if (reload_from_disk(entry)) {
        show_files();
        refresh_status();
    }
}


setInterval(check_disk_changes, 3000);
window.addEventListener('focus', check_disk_changes);


// Add one file to the list. Returns true if it was added.
function open_file_path(filePath, name) {
    try {
        if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
            console.log("not a file: " + filePath);
            return false;
        }
    } catch (error) {
        console.log(error);
        return false;
    }

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].path === filePath) {
            return false;
        }
    }

    if (looks_binary(filePath)) {
        console.log('refusing binary file: ' + filePath);
        refused_files.push(name || nodePath.basename(filePath));
        return false;
    }

    try {
        const text = fs.readFileSync(filePath, 'utf-8');
        open_file_data.push({
            name: name || nodePath.basename(filePath),
            path: filePath,
            data: text,
            saved: text,
            disk: stat_signature(filePath)
        });
    } catch (error) {
        console.log(error);
        return false;
    }

    return true;
}


function drop(ev) {
    ev.preventDefault();

    const files = ev.dataTransfer ? ev.dataTransfer.files : [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.path) {
            console.log("dropped item has no path, skipping");
            continue;
        }

        open_file_path(file.path, file.name);
    }

    show_files();
    report_refused();
}


// Whole window takes drops, otherwise Chromium just opens the file itself.
window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', drop);


// Native file picker, used by the header and Ctrl+O.
function open_files_dialog() {
    return ipcRenderer.invoke('open-files').then((paths) => {
        if (!paths || paths.length === 0) {
            return;
        }
        for (let i = 0; i < paths.length; i++) {
            open_file_path(paths[i]);
        }
        show_files();
        report_refused();
    });
}


// Find an open file by its path.
function find_open_file(path) {
    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].path === path) {
            return open_file_data[i];
        }
    }
    return null;
}


var untitledCount = 0;

// Start an empty buffer. It has no file on disk until it gets saved.
function new_file() {
    untitledCount++;
    const name = 'untitled-' + untitledCount;

    open_file_data.push({
        name: name,
        path: name,
        data: "",
        saved: "",
        untitled: true
    });

    show_files();
    open_in_editor(name);
}


// Write the file on screen back to disk.
function save_file() {
    if (openPath === "" || !editor) {
        return;
    }

    const entry = find_open_file(openPath);
    if (!entry) {
        return;
    }

    if (entry.untitled) {
        save_as();
        return;
    }

    if (entry.diskChanged && !confirm(entry.name + ' has changed on disk since you opened it. Overwrite what is there now?')) {
        return;
    }

    const text = file_text(entry);

    try {
        fs.writeFileSync(entry.path, text);
    } catch (error) {
        console.log(error);
        return;
    }

    entry.data = text;
    entry.saved = text;
    entry.disk = stat_signature(entry.path);
    entry.diskChanged = false;
    entry.missing = false;

    refresh_dirty_marks();
    refresh_status();
    editor.focus();
}


// Ask where to put it, write it there, then follow the file to its new name.
function save_as() {
    if (openPath === "" || !editor) {
        return;
    }

    const entry = find_open_file(openPath);
    if (!entry) {
        return;
    }

    const text = file_text(entry);

    return ipcRenderer.invoke('save-file-as', entry.name).then((filePath) => {
        if (!filePath) {
            return;
        }

        try {
            fs.writeFileSync(filePath, text);
        } catch (error) {
            console.log(error);
            return;
        }

        const oldPath = entry.path;

        // Saving on top of a file that is already open would leave two rows
        // pointing at the same place.
        for (let i = open_file_data.length - 1; i >= 0; i--) {
            if (open_file_data[i] !== entry && open_file_data[i].path === filePath) {
                open_file_data.splice(i, 1);
            }
        }

        entry.path = filePath;
        entry.name = nodePath.basename(filePath);
        entry.data = text;
        entry.saved = text;
        entry.untitled = false;
        entry.disk = stat_signature(filePath);
        entry.diskChanged = false;
        entry.missing = false;

        rename_open_path(oldPath, filePath);

        editor.session.setMode(modelist.getModeForPath(filePath).mode, () => {
            editor.renderer.updateFull(true);
        });

        show_files();
        refresh_dirty_marks();
    });
}


// Drop a file from the list and let the editor sort itself out.
function remove_open_file(path) {
    let removed = null;

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].path === path) {
            removed = open_file_data[i];
            open_file_data.splice(i, 1);
            break;
        }
    }

    forget_file(path);
    show_files();

    // Only once the editor has moved on, so it never holds a dead session.
    if (removed && removed.session) {
        removed.session.destroy();
        removed.session = null;
    }
}


// Check before throwing away unsaved work.
function confirm_close(path) {
    const entry = find_open_file(path);

    if (entry && is_dirty(entry)) {
        return confirm(entry.name + ' has unsaved changes. Close it anyway?');
    }

    return true;
}


// Close one file. The x on each row calls this.
function close_file(ev, el) {
    ev.stopPropagation();

    const path = el.dataset.path;

    if (!confirm_close(path)) {
        return;
    }

    remove_open_file(path);
}


// Close whatever is on screen. The File menu uses this.
function close_current_file() {
    if (openPath === "") {
        return;
    }

    if (!confirm_close(openPath)) {
        return;
    }

    remove_open_file(openPath);
}


var open_folder_data = [];

// Which files were open last time, so they can be put back.
var sessionPath = "";
var restoringSession = false;


function save_session() {
    if (sessionPath === "" || restoringSession) {
        return;
    }

    const paths = [];

    for (let i = 0; i < open_file_data.length; i++) {
        if (!open_file_data[i].untitled) {
            paths.push(open_file_data[i].path);
        }
    }

    try {
        fs.writeFileSync(sessionPath, JSON.stringify({files: paths, active: openPath}));
    } catch (error) {
        console.log(error);
    }
}


// Anything that has since been deleted, moved or turned binary is skipped
// quietly rather than complained about on startup.
function load_session() {
    return ipcRenderer.invoke('user-data-path').then((dir) => {
        if (!dir) {
            return;
        }

        sessionPath = nodePath.join(dir, 'session.json');

        if (!fs.existsSync(sessionPath)) {
            return;
        }

        let saved;

        try {
            saved = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
        } catch (error) {
            console.log(error);
            return;
        }

        if (!saved || !saved.files || saved.files.length === 0) {
            return;
        }

        restoringSession = true;

        let opened = 0;

        for (let i = 0; i < saved.files.length; i++) {
            if (open_file_path(saved.files[i])) {
                opened++;
            }
        }

        refused_files = [];
        restoringSession = false;

        if (opened === 0) {
            return;
        }

        show_files();

        const wanted = (saved.active && find_open_file(saved.active)) ? saved.active : open_file_data[0].path;
        open_in_editor(wanted);
    }).catch((error) => {
        console.log(error);
    });
}


// Ask for a folder and add it to the tree.
function open_folders_dialog() {
    return ipcRenderer.invoke('open-folder').then((paths) => {
        if (!paths || paths.length === 0) {
            return;
        }

        for (let i = 0; i < paths.length; i++) {
            add_folder(paths[i]);
        }

        show_folders();
    });
}


function add_folder(folderPath) {
    for (let i = 0; i < open_folder_data.length; i++) {
        if (open_folder_data[i].path === folderPath) {
            return false;
        }
    }

    open_folder_data.push({
        path: folderPath,
        name: nodePath.basename(folderPath) || folderPath,
        isFolder: true,
        expanded: false,
        children: null
    });

    return true;
}


// Folders first, then files, both alphabetical.
function read_folder(folderPath) {
    let entries;

    try {
        entries = fs.readdirSync(folderPath, {withFileTypes: true});
    } catch (error) {
        console.log(error);
        return [];
    }

    const folders = [];
    const files = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const full = nodePath.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            folders.push({path: full, name: entry.name, isFolder: true, expanded: false, children: null});
        } else if (entry.isFile()) {
            files.push({path: full, name: entry.name, isFolder: false});
        }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return folders.concat(files);
}


function find_folder_node(path, nodes) {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].path === path) {
            return nodes[i];
        }

        if (nodes[i].children) {
            const hit = find_folder_node(path, nodes[i].children);
            if (hit) {
                return hit;
            }
        }
    }

    return null;
}


// Children are read the first time a folder is opened, not before.
function toggle_folder(el) {
    const node = find_folder_node(el.dataset.path, open_folder_data);
    if (!node) {
        return;
    }

    node.expanded = !node.expanded;

    if (node.expanded && node.children === null) {
        node.children = read_folder(node.path);
    }

    show_folders();
}


function remove_folder(ev, el) {
    ev.stopPropagation();

    for (let i = 0; i < open_folder_data.length; i++) {
        if (open_folder_data[i].path === el.dataset.path) {
            open_folder_data.splice(i, 1);
            break;
        }
    }

    show_folders();
}


function open_from_tree(el) {
    const path = el.dataset.path;

    open_file_path(path);
    show_files();

    if (refused_files.length > 0) {
        report_refused();
        return;
    }

    open_in_editor(path);
}


function render_folder_nodes(nodes, depth) {
    let html = '';

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const indent = 0.6 + depth * 0.8;

        if (node.isFolder) {
            const arrow = node.expanded ? 'v' : '>';
            const close = depth === 0
                ? `<span class="close_file" data-path="${node.path}" onclick="remove_folder(event, this)" title="Remove">x</span>`
                : ``;

            html += `<div class="open_folder" style="padding-left:${indent}vw" data-path="${node.path}" onclick="toggle_folder(this)">`
                 + close + `${arrow} ${node.name}</div>`;

            if (node.expanded && node.children) {
                html += render_folder_nodes(node.children, depth + 1);
            }
        } else {
            html += `<div class="open_file tree_row" style="padding-left:${indent}vw" data-path="${node.path}" onclick="open_from_tree(this)">${node.name}</div>`;
        }
    }

    return html;
}


function show_folders() {
    let html = `<div id="folder_manager_title" onclick="open_folders_dialog()" title="Click to open a folder">Folders</div>`;
    html += render_folder_nodes(open_folder_data, 0);
    document.getElementById('folder_manager').innerHTML = html;
}


// Two files can easily share a name once folders are involved, so show the
// containing folder on the ones that clash.
function file_row_label(entry) {
    if (entry.untitled) {
        return entry.name;
    }

    let sameName = 0;

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].name === entry.name) {
            sameName++;
        }
    }

    if (sameName < 2) {
        return entry.name;
    }

    const parent = nodePath.basename(nodePath.dirname(entry.path));

    return `${entry.name}<span class="file_parent">${parent}</span>`;
}


// Rundown of where the session went, longest first.
function show_time_summary() {
    const nl = String.fromCharCode(10);

    if (open_file_data.length === 0) {
        alert('Nothing open yet, so no time to report.');
        return;
    }

    const rows = [];

    for (let i = 0; i < open_file_data.length; i++) {
        rows.push({
            name: open_file_data[i].name,
            seconds: file_time(open_file_data[i].path)
        });
    }

    rows.sort((a, b) => b.seconds - a.seconds);

    let total = 0;
    let text = 'Time per file' + nl + nl;

    for (let i = 0; i < rows.length; i++) {
        total += rows[i].seconds;
        text += rows[i].name + '  ' + spell_duration(rows[i].seconds) + nl;
    }

    text += nl + 'Across all open files: ' + spell_duration(total);

    alert(text);
}


function spell_duration(seconds) {
    const minutes = Math.floor(seconds / 60);

    if (minutes < 1) {
        return seconds + 's';
    }

    if (minutes < 60) {
        return minutes + 'm ' + padTime(seconds % 60) + 's';
    }

    return Math.floor(minutes / 60) + 'h ' + padTime(minutes % 60) + 'm';
}


function show_files() {
    let file_manager = `<div id="file_manager_title" onclick="open_files_dialog()" title="Click to open files (Ctrl+O)">Open Files</div>`;

    for (let i = 0; i < open_file_data.length; i++) {
        const path = open_file_data[i].path;
        const entry = open_file_data[i];
        let mark = ``;

        if (entry.missing) {
            mark += `<span class="disk_marker" title="No longer on disk">!</span>`;
        } else if (entry.diskChanged) {
            mark += `<span class="disk_marker" title="Changed on disk">!</span>`;
        }

        if (is_dirty(entry)) {
            mark += `<span class="dirty_marker" title="Unsaved changes">*</span>`;
        }
        file_manager += `<div class="open_file" data-path="${path}" title="${path}" onclick="show_to_editor(this)">`
            + `<span class="close_file" data-path="${path}" onclick="close_file(event, this)" title="Close">x</span>`
            + `<span class="file_time" title="Time spent in this file">${file_time_label(path)}</span>`
            + mark
            + file_row_label(open_file_data[i]) + `</div>`
    }

    document.getElementById('file_manager').innerHTML = file_manager;

    save_session();
}


load_session();
