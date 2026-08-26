// Capture phase, Ace eats these keys otherwise.
document.addEventListener('keydown', keydown, true);

function keydown (evt) {

    if (!evt) evt = event;

    if (evt.ctrlKey && (evt.key === 's' || evt.key === 'S')) {
        evt.preventDefault();

        if (openPath !== "") {
            fs.writeFileSync(openPath, editor.getValue());

            for (let i = 0; i < open_file_data.length; i++) {
                if (open_file_data[i].path === openPath) {
                    open_file_data[i].data = editor.getValue();
                    break;
                }
            }
        }
    }

    if (evt.ctrlKey && (evt.key === 'o' || evt.key === 'O')) {
        evt.preventDefault();

        open_files_dialog();
    }

}
