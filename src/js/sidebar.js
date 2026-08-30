// Drawing the list of open files, and closing them.

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

    show_tabs();
    save_session();
}
