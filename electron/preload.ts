import { contextBridge, ipcRenderer } from 'electron';

// 插件 API
contextBridge.exposeInMainWorld('pluginAPI', {
  invoke: (pluginId: string, method: string, ...args: any[]) =>
    ipcRenderer.invoke('PLUGIN:invoke', pluginId, method, ...args),

  on: (pluginId: string, event: string, listener: (payload: any) => void) => {
    const channel = `plugin:event:${pluginId}:${event}`;
    ipcRenderer.on(channel, (_e, payload) => listener(payload));
  },

  off: (pluginId: string, event: string, listener: (...args: any[]) => void) => {
    const channel = `plugin:event:${pluginId}:${event}`;
    ipcRenderer.removeListener(channel, listener);
  }
});

// 全局 API
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
});
