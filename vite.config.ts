import { sites } from '@openai/sites-vite-plugin';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const hostingConfig = JSON.parse(
  readFileSync(new URL('./.openai/hosting.json', import.meta.url), 'utf8'),
) as { d1: string | null; r2: string | null };

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');

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
      cloudflare({
        config: {
        name: 'heap-4',
        main: './worker/index.ts',
        compatibility_date: '2026-08-27',
        compatibility_flags: ['nodejs_compat'],
        assets: {
          not_found_handling: 'single-page-application',
          run_worker_first: ['/api/*'],
        },
        d1_databases: hostingConfig.d1
          ? [
              {
                binding: hostingConfig.d1,
                database_name: 'heap-4-demo',
                database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
                migrations_dir: 'drizzle',
              },
            ]
          : [],
        },
      }),
    ],
    server: { port: 5173, forwardConsole: false },
  };
});
