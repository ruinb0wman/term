# term

这是一个electron-react-vite项目, 旨在提供tiling布局及动态插件

## plugins

每一个插件都有其自己的结构
- `renderer.ts` 插件渲染进程入口
- `main.ts` 插件主进程入口
- `manifest.json` 插件元数据
- `package.json` 插件依赖等信息
