// Session start. Reset this to restart the timer.
var timerStartedAt = Date.now();

// Seconds each file has had the editor's attention, keyed by path. A file
// keeps its total after being closed, so reopening carries on where it left off.
var fileSeconds = {};
var activePath = "";
var activeSince = 0;


function padTime(n) {
    return n < 10 ? "0" + n : String(n);
}


// Called whenever the editor switches files. Pass an empty string when nothing
// is on screen.
function set_active_file(path) {
    bank_file_time();

    activePath = path || "";
    activeSince = (activePath === "") ? 0 : Date.now();
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


function updateTimer() {
    // Read elapsed time off the clock so late ticks cannot make it drift.
    const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);

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
}


// Aim each tick just past the next whole second.
function scheduleNextTick() {
    const elapsed = Date.now() - timerStartedAt;
    const msIntoSecond = ((elapsed % 1000) + 1000) % 1000;

    setTimeout(() => {
        updateTimer();
        scheduleNextTick();
    }, 1000 - msIntoSecond + 5);
}


updateTimer();
scheduleNextTick();
