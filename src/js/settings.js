// Theme, font size, keybindings and word wrap, remembered between runs.

var settingsPath = "";

var settings = {
    theme: 'ace/theme/tomorrow_night',
    fontSize: 15,
    keybindings: '',
    wordWrap: false
};


function load_settings() {
    return ipcRenderer.invoke('user-data-path').then((dir) => {
        if (!dir) {
            return;
        }

        settingsPath = nodePath.join(dir, 'settings.json');

        if (!fs.existsSync(settingsPath)) {
            return;
        }

        try {
            const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

            if (saved && typeof saved.theme === 'string' && saved.theme) {
                settings.theme = saved.theme;
            }

            if (saved && typeof saved.fontSize === 'number' && saved.fontSize > 0) {
                settings.fontSize = saved.fontSize;
            }

            if (saved && typeof saved.keybindings === 'string') {
                settings.keybindings = saved.keybindings;
            }

            if (saved && typeof saved.wordWrap === 'boolean') {
                settings.wordWrap = saved.wordWrap;
            }
        } catch (error) {
            console.log(error);
            return;
        }

        apply_settings();
    }).catch((error) => {
        console.log(error);
    });
}


// Push the remembered settings onto whatever is on screen. Safe to call before
// any file has been opened, since there is no editor until then.
function apply_settings() {
    keyboardPreset = settings.keybindings;
    wrapEnabled = settings.wordWrap;

    for (let i = 0; i < open_file_data.length; i++) {
        if (open_file_data[i].session) {
            open_file_data[i].session.setUseWrapMode(wrapEnabled);
        }
    }

    if (editorSplit) {
        editorSplit.setTheme(settings.theme);

        for (let i = 0; i < editorSplit.getSplits(); i++) {
            const pane = editorSplit.getEditor(i);

            pane.setFontSize(settings.fontSize);
            apply_keybindings(pane);
        }
    }

    sync_wrap_button();
}


// Theme and font size are changed through Ace's own settings panel, which does
// not tell us about it, so they are read back off the editor when saving.
function save_settings() {
    if (settingsPath === "") {
        return;
    }

    if (editor) {
        settings.theme = editor.getTheme() || settings.theme;

        const size = parseInt(editor.getFontSize(), 10);

        if (size > 0) {
            settings.fontSize = size;
        }
    }

    settings.keybindings = keyboardPreset;
    settings.wordWrap = wrapEnabled;

    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings));
    } catch (error) {
        console.log(error);
    }
}


load_settings();
