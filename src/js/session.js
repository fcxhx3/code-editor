// Remembering which files were open, so they come back next time.

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


load_session();
