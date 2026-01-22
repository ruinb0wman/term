// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { usePluginManager } from './plugin_manager';

let mainWindow: BrowserWindow | null = null;
const pluginManager = usePluginManager();

async function createWindow() {
  await pluginManager.loadAllPlugins();
  await pluginManager.enableAllPlugins();

  // 使用 fileURLToPath 替代 __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.mjs'),
      contextIsolation: true,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

pluginManager.enablePluginIPC()

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
