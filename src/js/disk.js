// Watching the files that are open for changes made outside the editor.

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
