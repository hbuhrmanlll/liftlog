/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { coachOptionsFromEnv } from './server/coachEnv.ts';
import { coachDevApi } from './server/devApiPlugin.ts';

export default defineConfig(({ mode }) => {
  // Loads GEMINI_API_KEY / ANTHROPIC_API_KEY from .env.local for the dev/preview API only.
  // They are not prefixed with VITE_, so they are never bundled into the app.
  const env = loadEnv(mode, process.cwd(), '');
  const getOptions = () => coachOptionsFromEnv({ ...process.env, ...env });
  // Short commit id shown in Settings and error reports (Netlify sets COMMIT_REF).
  let commit = process.env.COMMIT_REF ?? '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'dev';
    }
  }
  const version = `${commit.slice(0, 7)} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      tailwindcss(),
      coachDevApi(getOptions),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'LiftLog - PPL Tracker',
          short_name: 'LiftLog',
          description: 'Log Push / Pull / Legs workouts fast and know when to add weight.',
          theme_color: '#0a0b0d',
          background_color: '#0a0b0d',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          categories: ['health', 'fitness', 'sports'],
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 1200,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  };
});
