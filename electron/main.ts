// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { pluginManager } from './plugin_manager';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  await pluginManager.loadAllPlugins();

  // 👇 关键：await 启用插件
  for (const manifest of pluginManager.getAllManifests()) {
    if (manifest.enabled) {
      await pluginManager.enablePlugin(manifest.id); // ← 加了 await
    }
  }

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

// IPC: 调用插件方法
ipcMain.handle('PLUGIN:invoke', async (_e, pluginId: string, method: string, ...args: any[]) => {
  const plugin = pluginManager.getActivePlugin(pluginId);
  if (!plugin?.mainModule?.ipcMethods) {
    throw new Error(`Plugin ${pluginId} not active or has no ipcMethods`);
  }

  const handler = plugin.mainModule.ipcMethods[method];
  if (!handler) {
    throw new Error(`Method ${method} not found in plugin ${pluginId}`);
  }

  try {
    const result = await handler(...args);
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 获取插件列表 & 渲染器路径
ipcMain.handle('PLUGIN:list', () => pluginManager.getAllManifests());
ipcMain.handle('PLUGIN:get-renderer-path', (_e, id: string) => {
  return pluginManager.getRendererPath(id);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
