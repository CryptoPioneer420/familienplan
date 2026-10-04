import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };
const contentDir = fileURLToPath(new URL('../../content', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@content': contentDir } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: true,
    fs: { allow: ['../..'] },
    // Lokale Entwicklung: `wrangler dev` (apps/worker) liefert /api. Ohne Worker antwortet der Proxy mit 502, die App zeigt dann „offline".
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: { target: 'es2022', sourcemap: false, cssCodeSplit: false },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // „prompt": ein neuer Service Worker wartet, bis der Nutzer in der App auf „Aktualisieren" tippt.
      // Kein stilles skipWaiting: sonst laufen alte Seite und neue Assets gemischt.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Familienplan Zypern',
        short_name: 'Familienplan',
        description: 'Wochenplan, Rezepte und Einkaufsliste für die Familie.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#E9EEEC',
        theme_color: '#10222E',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Vietnamesisch wird für deutsche Texte nie gebraucht; spart Precache-Volumen.
        globIgnores: ['**/*vietnamese*'],
        navigateFallback: 'index.html',
        // API-Aufrufe sind nie eine Navigation und werden nie aus dem Cache beantwortet.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
});
