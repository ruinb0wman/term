// scripts/vite-plugin-build-plugins.ts
import type { Plugin } from 'vite';
import { build } from 'esbuild';
import chokidar from 'chokidar';
import { join, resolve, basename, dirname as pathDirname } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
} from 'fs';
import { fileURLToPath } from 'url';

// 兼容 ESM 获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);
const PLUGINS_DIR = resolve(__dirname, '../plugins');

function ensureDist(pluginDir: string): string {
  const distDir = join(pluginDir, 'dist');
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  return distDir;
}

async function buildMain(entry: string, outfile: string) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: false,          // 不打包
    platform: 'node',
    format: 'esm',          // 主进程用 ESM
    target: 'node18',
    sourcemap: true,
  });
}

async function buildRenderer(entry: string, outfile: string) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: false,          // 不打包
    platform: 'neutral',
    format: 'esm',          // 渲染进程用 ESM
    target: 'es2020',
    jsx: 'automatic',       // 支持 TSX
    sourcemap: true,
  });
}

export function buildPlugins(): Plugin {
  return {
    name: 'build-plugins',

    configureServer(server) {
      const logger = server.config.logger;

      // 构建单个插件
      const buildPlugin = async (pluginDir: string) => {
        const name = basename(pluginDir);

        try {
          // 构建 main.ts
          const mainTs = join(pluginDir, 'main.ts');
          if (existsSync(mainTs)) {
            const dist = ensureDist(pluginDir);
            await buildMain(mainTs, join(dist, 'main.js'));
            logger.info(`✅ Built plugin main: ${name}`);
          }

          // 构建 renderer.tsx 或 renderer.ts
          const rendererTsx = join(pluginDir, 'renderer.tsx');
          const rendererTs = join(pluginDir, 'renderer.ts');
          const rendererEntry = existsSync(rendererTsx)
            ? rendererTsx
            : existsSync(rendererTs)
              ? rendererTs
              : null;

          if (rendererEntry) {
            const dist = ensureDist(pluginDir);
            await buildRenderer(rendererEntry, join(dist, 'renderer.js'));
            logger.info(`✅ Built plugin renderer: ${name}`);
          }
        } catch (err: any) {
          logger.error(`❌ Build failed for plugin "${name}": ${err.message || err}`);
        }
      };

      // 初始全量构建
      const buildAllPlugins = async () => {
        if (!existsSync(PLUGINS_DIR)) return;

        const items = readdirSync(PLUGINS_DIR);
        for (const item of items) {
          const pluginDir = join(PLUGINS_DIR, item);
          const manifestPath = join(pluginDir, 'manifest.json');

          // 只处理包含 manifest.json 的目录（视为插件）
          if (existsSync(manifestPath)) {
            await buildPlugin(pluginDir);
          }
        }
      };

      // 启动时构建一次
      buildAllPlugins();

      // 监听文件变化
      const watcher = chokidar.watch(
        [
          join(PLUGINS_DIR, '*/main.ts'),
          join(PLUGINS_DIR, '*/renderer.ts'),
          join(PLUGINS_DIR, '*/renderer.tsx'),
        ],
        {
          ignoreInitial: true,
          cwd: process.cwd(),
        }
      );

      watcher.on('change', async (changedPath) => {
        const absPath = resolve(changedPath);
        const pluginDir = pathDirname(absPath);
        const filename = basename(absPath);
        const name = basename(pluginDir);

        try {
          if (filename === 'main.ts') {
            const dist = ensureDist(pluginDir);
            await buildMain(absPath, join(dist, 'main.js'));
            logger.info(`🔁 Updated ${name}/main.js`);
          } else if (filename === 'renderer.ts' || filename === 'renderer.tsx') {
            const dist = ensureDist(pluginDir);
            await buildRenderer(absPath, join(dist, 'renderer.js'));
            logger.info(`🔁 Updated ${name}/renderer.js`);
          }
        } catch (err: any) {
          logger.error(`💥 Rebuild error in plugin "${name}": ${err.message || err}`);
        }
      });

      // 清理监听器
      server.httpServer?.on('close', () => {
        watcher.close();
      });
    },

    // 生产构建时也构建插件
    closeBundle() {
      if (process.env.NODE_ENV === 'production') {
        console.log('\n📦 Building plugins for production...');
        // 注意：closeBundle 没有 server.logger，所以用 console
        const logger = console;

        if (!existsSync(PLUGINS_DIR)) return;

        const items = readdirSync(PLUGINS_DIR);
        for (const item of items) {
          const pluginDir = join(PLUGINS_DIR, item);
          const manifestPath = join(pluginDir, 'manifest.json');
          if (!existsSync(manifestPath)) continue;

          const name = item;
          try {
            const mainTs = join(pluginDir, 'main.ts');
            if (existsSync(mainTs)) {
              const dist = ensureDist(pluginDir);
              buildMain(mainTs, join(dist, 'main.js'));
              logger.log(`✅ Built ${name}/main.js`);
            }

            const rendererTsx = join(pluginDir, 'renderer.tsx');
            const rendererTs = join(pluginDir, 'renderer.ts');
            const rendererEntry = existsSync(rendererTsx)
              ? rendererTsx
              : existsSync(rendererTs)
                ? rendererTs
                : null;

            if (rendererEntry) {
              const dist = ensureDist(pluginDir);
              buildRenderer(rendererEntry, join(dist, 'renderer.js'));
              logger.log(`✅ Built ${name}/renderer.js`);
            }
          } catch (err: any) {
            logger.error(`❌ Build failed for ${name}:`, err);
          }
        }
      }
    },
  };
}
