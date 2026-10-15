import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'CalendarAsist',
          short_name: 'CalendarAsist',
          description: 'Tu asistente de calendario y agenda personal.',
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          cleanupOutdatedCaches: true,
          // Push notifications of the nightly assistant
          importScripts: ['push-sw.js'],
          clientsClaim: true,
          skipWaiting: true,
          // API and serverless routes must never be answered with the SPA shell
          navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//, /^\/sync-now/],
          runtimeCaching: [
            {
              // Google Fonts stylesheet: serve cached copy instantly, refresh in background
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              // Font files are immutable: cache for a year (also makes them available offline)
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Read-only data (Moodle deliverables, calendar feed): network first, last copy when offline
              urlPattern: ({ url, request }) =>
                request.method === 'GET' &&
                url.origin === self.location.origin &&
                (url.pathname.startsWith('/api/moodle/') || url.pathname.startsWith('/api/google-calendar/')),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-readonly',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 14 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          // Vendor code changes less often than the app: separate chunks stay cached across deploys
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
            'vendor-motion': ['motion', 'motion/react'],
            'vendor-supabase': ['@supabase/supabase-js'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
