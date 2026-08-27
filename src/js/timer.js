// Session time is kept as a banked total plus however long the current run has
// been going. Deriving it that way is what lets the clock be paused.
var timerBanked = 0;
var timerRunning = true;
var timerStartedAt = Date.now();

// Seconds each file has had the editor's attention, keyed by path. A file
// keeps its total after being closed, so reopening carries on where it left off.
var fileSeconds = {};
var activePath = "";
var activeSince = 0;

// Where the totals are written so they survive a restart.
var timeStatePath = "";
var ticksSinceSave = 0;


function padTime(n) {
    return n < 10 ? "0" + n : String(n);
}


function elapsed_seconds() {
    if (!timerRunning) {
        return timerBanked;
    }

    return timerBanked + Math.floor((Date.now() - timerStartedAt) / 1000);
}


// Called whenever the editor switches files. Pass an empty string when nothing
// is on screen.
function set_active_file(path) {
    bank_file_time();

    activePath = path || "";
    activeSince = (activePath === "" || !timerRunning) ? 0 : Date.now();
}


// Move whole seconds off the running clock and into the file's total. The
// leftover milliseconds stay on the clock so nothing is lost between ticks.
function bank_file_time() {
    if (activePath === "" || activeSince === 0) {
        return;
    }

    const seconds = Math.floor((Date.now() - activeSince) / 1000);

    if (seconds > 0) {
        fileSeconds[activePath] = (fileSeconds[activePath] || 0) + seconds;
        activeSince += seconds * 1000;
    }
}


// Banked total plus whatever the file has run up since the last tick.
function file_time(path) {
    let total = fileSeconds[path] || 0;

    if (path === activePath && activeSince !== 0) {
        total += Math.floor((Date.now() - activeSince) / 1000);
    }

    return total;
}


// Short enough to sit at the end of a sidebar row.
function file_time_label(path) {
    const total = file_time(path);

    if (total < 60) {
        return total + "s";
    }

    const minutes = Math.floor(total / 60);

    if (minutes < 60) {
        return minutes + "m";
    }

    return Math.floor(minutes / 60) + "h" + padTime(minutes % 60);
}


// Save As gives a file a new path, so its total has to follow.
function move_file_time(oldPath, newPath) {
    if (!fileSeconds[oldPath]) {
        return;
    }

    fileSeconds[newPath] = (fileSeconds[newPath] || 0) + fileSeconds[oldPath];
    delete fileSeconds[oldPath];

    if (activePath === oldPath) {
        activePath = newPath;
    }
}


// Write the times straight into the spans rather than rebuilding the sidebar,
// otherwise hovering a row would flicker once a second.
function refresh_file_times() {
    const rows = document.querySelectorAll('#file_manager .open_file');

    for (let i = 0; i < rows.length; i++) {
        const span = rows[i].querySelector('.file_time');

        if (span) {
            span.innerText = file_time_label(rows[i].dataset.path);
        }
    }
}


function pause_timer() {
    if (!timerRunning) {
        return;
    }

    bank_file_time();
    timerBanked = elapsed_seconds();
    timerRunning = false;
    activeSince = 0;

    save_time_state();
    redraw_timer();
}


function resume_timer() {
    if (timerRunning) {
        return;
    }

    timerRunning = true;
    timerStartedAt = Date.now();

    if (activePath !== "") {
        activeSince = Date.now();
    }

    redraw_timer();
}


function toggle_timer() {
    if (timerRunning) {
        pause_timer();
    } else {
        resume_timer();
    }
}


function reset_timer() {
    if (!confirm('Reset the clock and every per file total back to zero?')) {
        return;
    }

    timerBanked = 0;
    timerStartedAt = Date.now();
    fileSeconds = {};
    activeSince = (activePath === "" || !timerRunning) ? 0 : Date.now();

    save_time_state();
    redraw_timer();
    refresh_file_times();
}


function redraw_timer() {
    updateTimer.lastText = null;
    updateTimer();
}


// Totals live in the user data folder, so they are not tied to the checkout.
function load_time_state() {
    return ipcRenderer.invoke('user-data-path').then((dir) => {
        if (!dir) {
            return;
        }

        timeStatePath = nodePath.join(dir, 'timer-state.json');

        if (!fs.existsSync(timeStatePath)) {
            return;
        }

        try {
            const saved = JSON.parse(fs.readFileSync(timeStatePath, 'utf-8'));

            if (saved && typeof saved.totalSeconds === 'number' && saved.totalSeconds >= 0) {
                timerBanked = saved.totalSeconds;
                timerStartedAt = Date.now();
            }

            if (saved && saved.files && typeof saved.files === 'object') {
                fileSeconds = saved.files;
            }
        } catch (error) {
            console.log(error);
        }

        redraw_timer();
        refresh_file_times();
    }).catch((error) => {
        console.log(error);
    });
}


function save_time_state() {
    if (timeStatePath === "") {
        return;
    }

    bank_file_time();

    try {
        fs.writeFileSync(timeStatePath, JSON.stringify({
            totalSeconds: elapsed_seconds(),
            files: fileSeconds
        }));
    } catch (error) {
        console.log(error);
    }
}


function updateTimer() {
    const elapsed = elapsed_seconds();

    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    const text = `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;

    if (text !== updateTimer.lastText) {
        updateTimer.lastText = text;
        document.getElementById('sidebar_timer').innerHTML = `<center>${text}</center>`;

        bank_file_time();
        refresh_file_times();
    }

    const bar = document.getElementById('sidebar_timer');
    if (bar) {
        bar.className = timerRunning ? '' : 'timer_paused';
        bar.title = timerRunning ? 'Click to pause' : 'Paused, click to start again';
    }

    ticksSinceSave++;
    if (ticksSinceSave >= 15) {
        ticksSinceSave = 0;
        save_time_state();
    }
}


// Aim each tick just past the next whole second.
function scheduleNextTick() {
    const now = Date.now();
    const msIntoSecond = timerRunning ? (((now - timerStartedAt) % 1000) + 1000) % 1000 : 0;

    setTimeout(() => {
        updateTimer();
        scheduleNextTick();
    }, 1000 - msIntoSecond + 5);
}


updateTimer();
scheduleNextTick();
load_time_state();
