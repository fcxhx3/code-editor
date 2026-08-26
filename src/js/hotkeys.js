// Capture phase, Ace eats these keys otherwise.
document.addEventListener('keydown', keydown, true);

function keydown (evt) {

    if (!evt) evt = event;

    if (evt.ctrlKey && (evt.key === 's' || evt.key === 'S')) {
        evt.preventDefault();

        if (evt.shiftKey) {
            save_as();
        } else {
            save_file();
        }
    }

    if (evt.ctrlKey && (evt.key === 'n' || evt.key === 'N')) {
        evt.preventDefault();
        new_file();
    }

    if (evt.altKey && (evt.key === 'z' || evt.key === 'Z')) {
        evt.preventDefault();
        toggle_word_wrap();
    }

    if (evt.ctrlKey && (evt.key === 'o' || evt.key === 'O')) {
        evt.preventDefault();

        open_files_dialog();
    }

}
