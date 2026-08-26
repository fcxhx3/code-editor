const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

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
