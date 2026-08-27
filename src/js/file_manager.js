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

    try {
        const text = fs.readFileSync(filePath, 'utf-8');
        open_file_data.push({
            name: name || nodePath.basename(filePath),
            path: filePath,
            data: text,
            saved: text
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

    const text = editor.getValue();

    try {
        fs.writeFileSync(entry.path, text);
    } catch (error) {
        console.log(error);
        return;
    }

    entry.data = text;
    entry.saved = text;
    refresh_dirty_marks();
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

    const text = editor.getValue();

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
    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].path === path) {
            open_file_data.splice(i, 1);
            break;
        }
    }

    forget_file(path);
    show_files();
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


function show_files() {
    let file_manager = `<div id="file_manager_title" onclick="open_files_dialog()" title="Click to open files (Ctrl+O)">Open Files</div>`;

    for (let i = 0; i < open_file_data.length; i++) {
        const path = open_file_data[i].path;
        const mark = is_dirty(open_file_data[i]) ? `<span class="dirty_marker" title="Unsaved changes">*</span>` : ``;
        file_manager += `<div class="open_file" data-path="${path}" onclick="show_to_editor(this)">`
            + `<span class="close_file" data-path="${path}" onclick="close_file(event, this)" title="Close">x</span>`
            + mark
            + `${open_file_data[i].name}</div>`
    }

    document.getElementById('file_manager').innerHTML = file_manager;
}
