// The folder tree in the sidebar.

var open_folder_data = [];

// Ask for a folder and add it to the tree.
function open_folders_dialog() {
    return ipcRenderer.invoke('open-folder').then((paths) => {
        if (!paths || paths.length === 0) {
            return;
        }

        for (let i = 0; i < paths.length; i++) {
            add_folder(paths[i]);
        }

        show_folders();
    });
}


function add_folder(folderPath) {
    for (let i = 0; i < open_folder_data.length; i++) {
        if (open_folder_data[i].path === folderPath) {
            return false;
        }
    }

    open_folder_data.push({
        path: folderPath,
        name: nodePath.basename(folderPath) || folderPath,
        isFolder: true,
        expanded: false,
        children: null
    });

    return true;
}


// Folders first, then files, both alphabetical.
function read_folder(folderPath) {
    let entries;

    try {
        entries = fs.readdirSync(folderPath, {withFileTypes: true});
    } catch (error) {
        console.log(error);
        return [];
    }

    const folders = [];
    const files = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const full = nodePath.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            folders.push({path: full, name: entry.name, isFolder: true, expanded: false, children: null});
        } else if (entry.isFile()) {
            files.push({path: full, name: entry.name, isFolder: false});
        }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return folders.concat(files);
}


function find_folder_node(path, nodes) {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].path === path) {
            return nodes[i];
        }

        if (nodes[i].children) {
            const hit = find_folder_node(path, nodes[i].children);
            if (hit) {
                return hit;
            }
        }
    }

    return null;
}


// Children are read the first time a folder is opened, not before.
function toggle_folder(el) {
    const node = find_folder_node(el.dataset.path, open_folder_data);
    if (!node) {
        return;
    }

    node.expanded = !node.expanded;

    if (node.expanded && node.children === null) {
        node.children = read_folder(node.path);
    }

    show_folders();
}


function remove_folder(ev, el) {
    ev.stopPropagation();

    for (let i = 0; i < open_folder_data.length; i++) {
        if (open_folder_data[i].path === el.dataset.path) {
            open_folder_data.splice(i, 1);
            break;
        }
    }

    show_folders();
}


function open_from_tree(el) {
    const path = el.dataset.path;

    open_file_path(path);
    show_files();

    if (refused_files.length > 0) {
        report_refused();
        return;
    }

    open_in_editor(path);
}


function render_folder_nodes(nodes, depth) {
    let html = '';

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const indent = 0.6 + depth * 0.8;

        if (node.isFolder) {
            const arrow = node.expanded ? 'v' : '>';
            const close = depth === 0
                ? `<span class="close_file" data-path="${node.path}" onclick="remove_folder(event, this)" title="Remove">x</span>`
                : ``;

            html += `<div class="open_folder" style="padding-left:${indent}vw" data-path="${node.path}" onclick="toggle_folder(this)">`
                 + close + `${arrow} ${node.name}</div>`;

            if (node.expanded && node.children) {
                html += render_folder_nodes(node.children, depth + 1);
            }
        } else {
            html += `<div class="open_file tree_row" style="padding-left:${indent}vw" data-path="${node.path}" onclick="open_from_tree(this)">${node.name}</div>`;
        }
    }

    return html;
}


function show_folders() {
    let html = `<div id="folder_manager_title" onclick="open_folders_dialog()" title="Click to open a folder">Folders</div>`;
    html += render_folder_nodes(open_folder_data, 0);
    document.getElementById('folder_manager').innerHTML = html;
}
