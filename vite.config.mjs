import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { minify } from 'html-minifier-terser';

import { biniRouterPlugin } from './bini/internal/plugins/router.js';
import { biniBadgePlugin } from './bini/internal/plugins/badge.js';
import { biniSSRPlugin } from './bini/internal/plugins/ssr.js';
import { biniAPIPlugin } from './bini/internal/plugins/api.js';
import { biniPreviewPlugin } from './bini/internal/plugins/preview.js';
import biniConfig from './bini.config.mjs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isPreview = process.env.npm_lifecycle_event === 'preview';
  const isBuild = command === 'build';
  const port = biniConfig.port || 3000;

  // FIXED: Enhanced HMR configuration
  const hmrConfig = env.CODESPACE_NAME ? {
    clientPort: 443,
    overlay: true
  } : {
    overlay: true,
    host: 'localhost'
  };

  return {
    plugins: [
      react(),
      biniRouterPlugin(),
      biniSSRPlugin(),
      biniBadgePlugin(),
      biniAPIPlugin({ isPreview }),
      biniPreviewPlugin(),

      {
        name: 'bini-html-minifier',
        apply: 'build',
        closeBundle: async () => {
          const distDir = path.resolve('dist'); // CHANGED: Now uses standard dist folder
          if (!fs.existsSync(distDir)) return;

          const processHTML = async (filePath) => {
            const html = await fs.promises.readFile(filePath, 'utf8');
            const minified = await minify(html, {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: true,
              removeEmptyAttributes: true,
              removeScriptTypeAttributes: true,
              removeStyleLinkTypeAttributes: true,
              minifyCSS: true,
              minifyJS: true,
            });
            await fs.promises.writeFile(filePath, minified, 'utf8');
          };

          const walk = async (dir) => {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) await walk(fullPath);
              else if (entry.name.endsWith('.html')) await processHTML(fullPath);
            }
          };

          await walk(distDir);
        },
      },
    ],

    // FIXED: Server configuration with auto-open and better HMR
    server: {
      port,
      host: env.CODESPACE_NAME ? '0.0.0.0' : (biniConfig.host || 'localhost'),
      open: true, // FIXED: Changed from false to true
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      hmr: hmrConfig,
      watch: {
        usePolling: env.CODESPACE_NAME ? true : false,
        ignored: ['**/dist/**', '**/node_modules/**'] // CHANGED: Updated ignore pattern
      },
    },

    // FIXED: Preview configuration with auto-open
    preview: {
      port,
      host: '0.0.0.0',
      open: true, // FIXED: Added auto-open for preview
      cors: true,
    },

    build: {
      outDir: 'dist', // CHANGED: Now uses standard dist folder
      sourcemap: biniConfig.build?.sourcemap !== false && !isBuild,
      emptyOutDir: true,
      minify: 'terser',
      cssCodeSplit: true,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 1000,

      rollupOptions: {
        output: {
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|gif|svg|webp|avif/.test(ext)) return 'assets/images/[name]-[hash][extname]';
            if (/woff|woff2|eot|ttf|otf|ttc/.test(ext)) return 'assets/fonts/[name]-[hash][extname]';
            if (ext === 'css') return 'css/[name]-[hash][extname]';
            if (ext === 'json') return 'data/[name]-[hash][extname]';
            return 'assets/[name]-[hash][extname]';
          },
        },
      },

      terserOptions: {
        compress: {
          drop_console: isBuild,
          drop_debugger: isBuild,
          passes: 2,
        },
        format: {
          comments: false,
        },
      },
    },

    resolve: {
      alias: { '@': '/src' },
    },

    css: {
      modules: { localsConvention: 'camelCase' },
      devSourcemap: true,
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: ['@bini/internal']
    },
  };
});