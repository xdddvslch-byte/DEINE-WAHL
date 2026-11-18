const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

function openTrainer() {
  const window = new BrowserWindow({
    title: 'DEINE WAHL',
    width: 1160,
    height: 800,
    backgroundColor: '#05070a',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  // Нові вікна в застосунку не відкриваються. Посилання на чинну редакцію закону — у системному браузері.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/zakon\.rada\.gov\.ua\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(openTrainer);
app.on('window-all-closed', () => app.quit());
