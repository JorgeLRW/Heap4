import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ mode }) => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const localMode = mode === 'dev';
  const cloudflarePlugins = localMode
    ? []
    : (await import('@cloudflare/vite-plugin')).cloudflare({
        configPath: './wrangler.jsonc',
      });

  return {
    // Work around Vite 8's dev-client constants leaking unreplaced in some
    // multi-environment projects. Production output is unaffected.
    define: {
      __BUNDLED_DEV__: 'false',
      __SERVER_FORWARD_CONSOLE__: 'false',
    },
    environments: {
      client: {
        define: {
          __BUNDLED_DEV__: 'false',
          __SERVER_FORWARD_CONSOLE__: 'false',
        },
      },
    },
    experimental: { bundledDev: false },
    plugins: [
      react(),
      sites(),
      ...cloudflarePlugins,
    ],
    server: {
      port: 5173,
      strictPort: true,
      forwardConsole: false,
      proxy: localMode
        ? {
            '/api': {
              target: 'http://127.0.0.1:3001',
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
