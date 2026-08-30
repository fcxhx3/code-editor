// The row of open files above the editor.

function show_tabs() {
    const bar = document.getElementById('tabs');

    if (!bar) {
        return;
    }

    let html = '';

    for (let i = 0; i < open_file_data.length; i++) {
        const entry = open_file_data[i];
        const active = (entry.path === openPath) ? ' active' : '';
        const mark = is_dirty(entry) ? `<span class="tab_dirty" title="Unsaved changes">*</span>` : ``;

        html += `<div class="tab${active}" data-path="${entry.path}" title="${entry.path}" onclick="show_to_editor(this)">`
             + mark
             + `<span class="tab_name">${entry.name}</span>`
             + `<span class="tab_close" data-path="${entry.path}" onclick="close_file(event, this)" title="Close">x</span>`
             + `</div>`;
    }

    bar.innerHTML = html;

    scroll_active_tab_into_view();
}


// With more tabs than fit, the one you are looking at should still be on screen.
function scroll_active_tab_into_view() {
    const bar = document.getElementById('tabs');

    if (!bar) {
        return;
    }

    const active = bar.querySelector('.tab.active');

    if (!active) {
        return;
    }

    const left = active.offsetLeft;
    const right = left + active.offsetWidth;

    if (left < bar.scrollLeft) {
        bar.scrollLeft = left;
    } else if (right > bar.scrollLeft + bar.clientWidth) {
        bar.scrollLeft = right - bar.clientWidth;
    }
}
