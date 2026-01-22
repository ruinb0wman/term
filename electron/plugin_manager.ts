// electron/plugin_manager.ts
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { pathToFileURL } from 'url';


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

class PluginManager {
  private pluginsDir: string;
  private plugins = new Map<string, LoadedPlugin>();

  constructor() {
    this.pluginsDir = path.join(app.getAppPath(), 'plugins');
  }

  async loadAllPlugins() {
    console.log('pluginsDir', this.pluginsDir)
    if (!fs.existsSync(this.pluginsDir)) return;

    const dirs = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const pluginPath = path.join(this.pluginsDir, dir.name);
        const manifestPath = path.join(pluginPath, 'manifest.json');

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest;
            this.plugins.set(manifest.id, {
              manifest,
              basePath: pluginPath,
              isActive: false,
            });
          } catch (e) {
            console.error(`Failed to load plugin ${dir.name}`, e);
          }
        }
      }
    }
    console.log('[plugin_manager:loadAllPlugins]', this.plugins)
  }

  async enablePlugin(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.isActive) return;

    if (plugin.manifest.main) {
      const mainPath = path.resolve(plugin.basePath, plugin.manifest.main);
      let mainModule;

      try {
        // 转为 file URL（ESM 必须）
        const url = pathToFileURL(mainPath).href;
        const imported = await import(url);
        console.log('[plugin_manager:enablePlugin]', imported)
        // 兼容 CommonJS (exports.default) 和 ESM
        mainModule = imported.default || imported;
      } catch (err) {
        console.error(`[Plugin] Failed to load main module: ${mainPath}`, err);
        throw err;
      }

      if (typeof mainModule.activate === 'function') {
        mainModule.activate({ pluginPath: plugin.basePath });
      }

      plugin.mainModule = mainModule;
    }

    plugin.isActive = true;
    return plugin;
  }

  getActivePlugin(id: string) {
    const p = this.plugins.get(id);
    return p?.isActive ? p : null;
  }

  getAllManifests() {
    return Array.from(this.plugins.values()).map(p => p.manifest);
  }

  getRendererPath(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.manifest.renderer) return null;
    return `/plugins/${pluginId}/${plugin.manifest.renderer}`;
  }
}

export const pluginManager = new PluginManager();
