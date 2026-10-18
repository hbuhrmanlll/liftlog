/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { coachDevApi } from './server/devApiPlugin.ts';

export default defineConfig(({ mode }) => {
  // Loads ANTHROPIC_API_KEY from .env.local for the dev/preview API only.
  // It is not prefixed with VITE_, so it is never bundled into the app.
  const env = loadEnv(mode, process.cwd(), '');
  const getKey = () => env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const getAccessCode = () => env.COACH_ACCESS_CODE || process.env.COACH_ACCESS_CODE;

  return {
    plugins: [
      react(),
      tailwindcss(),
      coachDevApi(getKey, getAccessCode),
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
