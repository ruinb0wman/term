import React, { Suspense, useEffect, useState } from 'react';

interface PluginManifest {
  id: string;
  name: string;
  enabled: boolean;
}

export default function App() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [activePlugin, setActivePlugin] = useState<string | null>('terminal');

  useEffect(() => {
    window.electronAPI.invoke('PLUGIN:list').then(setPlugins);
  }, []);

  const LazyPlugin = React.lazy(async () => {
    if (!activePlugin) throw new Error('No plugin selected');
    
    const rendererPath = await window.electronAPI.invoke('PLUGIN:get-renderer-path', activePlugin);
    if (!rendererPath) throw new Error(`Renderer not found for ${activePlugin}`);
    
    const mod = await import(/* @vite-ignore */ rendererPath);
    return { default: () => <mod.default pluginId={activePlugin} /> };
  });

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <h1>Electron Plugin Demo</h1>
      
      <div style={{ marginBottom: 10 }}>
        {plugins.map(p => (
          <button key={p.id} onClick={() => setActivePlugin(p.id)}>
            {p.name} ({p.id})
          </button>
        ))}
      </div>

      <div style={{ flex: 1, border: '1px solid #ccc' }}>
        <Suspense fallback={<div>Loading...</div>}>
          {activePlugin ? <LazyPlugin /> : <div>Select a plugin</div>}
        </Suspense>
      </div>
    </div>
  );
}
