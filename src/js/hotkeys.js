// Capture phase, Ace eats these keys otherwise.
document.addEventListener('keydown', keydown, true);

function keydown (evt) {

    if (!evt) evt = event;

    if (evt.ctrlKey && (evt.key === 's' || evt.key === 'S')) {
        evt.preventDefault();

        if (openPath !== "") {
            const text = editor.getValue();
            fs.writeFileSync(openPath, text);

            const entry = find_open_file(openPath);
            if (entry) {
                entry.data = text;
                entry.saved = text;
            }

            refresh_dirty_marks();
        }
    }

    if (evt.ctrlKey && (evt.key === 'o' || evt.key === 'O')) {
        evt.preventDefault();

        open_files_dialog();
    }

}
