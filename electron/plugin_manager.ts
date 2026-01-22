// electron/plugin_manager.ts
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { pathToFileURL } from 'url';
import { ipcMain } from 'electron';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  main?: string;
  renderer?: string;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  basePath: string;
  mainModule?: any;
  isActive: boolean;
}

// 私有状态（闭包）
const pluginsDir = path.join(app.getAppPath(), 'plugins');
const plugins = new Map<string, LoadedPlugin>();

export function usePluginManager() {
  // 内部工具函数
  function readPluginManifest(pluginPath: string): PluginManifest | null {
    const manifestPath = path.join(pluginPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest;
    } catch (e) {
      console.error(`Failed to parse manifest in ${pluginPath}`, e);
      return null;
    }
  }

  async function loadPluginMainModule(plugin: LoadedPlugin) {
    if (!plugin.manifest.main) return plugin;

    const mainPath = path.resolve(plugin.basePath, plugin.manifest.main);
    try {
      const url = pathToFileURL(mainPath).href;
      const imported = await import(url);
      const mainModule = imported.default || imported;

      if (typeof mainModule.activate === 'function') {
        mainModule.activate({ pluginPath: plugin.basePath });
      }

      return { ...plugin, mainModule };
    } catch (err) {
      console.error(`[Plugin] Failed to load main module: ${mainPath}`, err);
      throw err;
    }
  }

  // 公共 API 函数
  async function loadAllPlugins() {
    console.log('pluginsDir', pluginsDir);
    if (!fs.existsSync(pluginsDir)) return;

    const dirs = fs.readdirSync(pluginsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const pluginPath = path.join(pluginsDir, dir.name);
        const manifest = readPluginManifest(pluginPath);
        if (manifest) {
          plugins.set(manifest.id, {
            manifest,
            basePath: pluginPath,
            isActive: false,
          });
        }
      }
    }
    console.log('[plugin_manager:loadAllPlugins]', plugins);
  }

  async function enablePlugin(pluginId: string) {
    const plugin = plugins.get(pluginId);
    if (!plugin || plugin.isActive) return plugin;

    let updatedPlugin = plugin;
    if (plugin.manifest.main) {
      updatedPlugin = await loadPluginMainModule(plugin);
      plugins.set(pluginId, updatedPlugin);
    }

    // 标记为激活
    const activePlugin = { ...updatedPlugin, isActive: true };
    plugins.set(pluginId, activePlugin);

    return activePlugin;
  }

  function getActivePlugin(id: string): LoadedPlugin | null {
    const p = plugins.get(id);
    return p && p.isActive ? p : null;
  }

  function getAllManifests(): PluginManifest[] {
    return Array.from(plugins.values()).map(p => p.manifest);
  }

  function getRendererPath(pluginId: string): string | null {
    const plugin = plugins.get(pluginId);
    if (!plugin || !plugin.manifest.renderer) return null;
    return `/plugins/${pluginId}/${plugin.manifest.renderer}`;
  }

  async function enableAllPlugins() {
    for (const manifest of getAllManifests()) {
      if (manifest.enabled) {
        await enablePlugin(manifest.id); // ← 加了 await
      }
    }
  }

  function enablePluginIPC() {
    // IPC: 调用插件方法
    ipcMain.handle('PLUGIN:invoke', async (_e, pluginId: string, method: string, ...args: any[]) => {
      const plugin = getActivePlugin(pluginId);
      // console.log('[main:plugin]', plugin?.mainModule?.ipcMethods);
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
    ipcMain.handle('PLUGIN:list', () => getAllManifests());
    ipcMain.handle('PLUGIN:get-renderer-path', (_e, id: string) => {
      return getRendererPath(id);
    });
  }

  return { enablePlugin, getActivePlugin, getAllManifests, getRendererPath, loadAllPlugins, enableAllPlugins, enablePluginIPC }
}
