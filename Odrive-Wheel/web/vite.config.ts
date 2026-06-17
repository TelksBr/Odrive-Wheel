import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Odrive-Wheel Configurator',
        short_name: 'Odrive-Wheel',
        description: 'Installable PWA for Odrive-Wheel bring-up, FFB tuning, telemetry, profiles, and DFU.',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#090d14',
        background_color: '#090d14',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        scope: './',
        start_url: './',
        categories: ['utilities', 'developer', 'productivity'],
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Console',
            short_name: 'Console',
            description: 'Open the raw serial console.',
            url: './?tab=console',
            icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
          {
            name: 'Telemetry',
            short_name: 'Telemetry',
            description: 'Open live diagnostics and telemetry.',
            url: './?tab=observe',
            icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
      },
    }),
  ],
});
