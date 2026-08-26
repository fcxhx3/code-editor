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
