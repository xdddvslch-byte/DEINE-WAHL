const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function openTrainer() {
  const window = new BrowserWindow({
    title: 'DEINE WAHL',
    width: 1160,
    height: 800,
    backgroundColor: '#05070a',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(openTrainer);
app.on('window-all-closed', () => app.quit());
