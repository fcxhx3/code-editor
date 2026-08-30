// Opening, saving and closing files, and the list of what is open.

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
