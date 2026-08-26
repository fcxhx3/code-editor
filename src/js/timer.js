// Session start. Reset this to restart the timer.
var timerStartedAt = Date.now();


function padTime(n) {
    return n < 10 ? "0" + n : String(n);
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
