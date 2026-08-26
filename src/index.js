const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

// The menu owns the keyboard shortcuts now, so every command has exactly one
// place it can fire from and the shortcut is written next to it.
const buildMenu = (mainWindow) => {
  const call = (code) => () => mainWindow.webContents.executeJavaScript(code);

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: call('new_file()') },
        { label: 'Open Files', accelerator: 'CmdOrCtrl+O', click: call('open_files_dialog()') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: call('save_file()') },
        { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: call('save_as()') },
        { type: 'separator' },
        { label: 'Close File', accelerator: 'CmdOrCtrl+W', click: call('close_current_file()') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Word Wrap', accelerator: 'Alt+Z', click: call('toggle_word_wrap()') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};


const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  buildMenu(mainWindow);

  // Ask before throwing away unsaved work. The renderer knows which files are
  // dirty, so the answer has to come back from there before the window closes.
  let allowClose = false;

  mainWindow.on('close', (event) => {
    if (allowClose) {
      return;
    }

    event.preventDefault();

    const quit = () => {
      allowClose = true;
      mainWindow.close();
    };

    mainWindow.webContents.executeJavaScript('unsaved_file_names()').then((names) => {
      if (!names || names.length === 0) {
        quit();
        return;
      }

      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Quit anyway', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Unsaved changes',
        message: 'These files have unsaved changes:',
        detail: names.join(String.fromCharCode(10))
      });

      if (choice === 0) {
        quit();
      }
    }).catch(() => {
      // If the renderer cannot answer, do not trap the user in the window.
      quit();
    });
  });
};

// Where should this buffer be written to.
ipcMain.handle('save-file-as', async (event, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showSaveDialog(win, {
    title: 'Save as',
    defaultPath: suggestedName || 'untitled.txt'
  });

  return result.canceled ? null : result.filePath;
});

// File picker for the renderer.
ipcMain.handle('open-files', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showOpenDialog(win, {
    title: 'Open files',
    properties: ['openFile', 'multiSelections'],
  });

  return result.canceled ? [] : result.filePaths;
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
