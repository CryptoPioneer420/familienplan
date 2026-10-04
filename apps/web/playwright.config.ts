import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/** Mit E2E_BASE_URL (z. B. http://127.0.0.1:8787 = wrangler dev) läuft die Suite gegen den echten Worker samt _headers/CSP. */
const external = process.env['E2E_BASE_URL'];
/** Lokal/Sandbox: vorinstalliertes Chromium. In CI (leer) lädt `playwright install chromium` den Standardpfad. */
const chromiumPath = process.env['PW_CHROMIUM'] ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/**
 * Emulation des iPhone 15 Pro Max (430 × 932 pt, 3×) in Chromium. Echtes iOS-Safari/WebKit ist hier nicht verfügbar;
 * die Abnahme auf dem Gerät (Anmeldung, Installation, Offline) bleibt Pflicht (PRD, Phase 1, Abnahmepunkt 1).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: external ?? 'http://127.0.0.1:4173',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'de-DE',
    timezoneId: 'Asia/Nicosia',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  webServer: external
    ? undefined
    : [
        {
          command: 'pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env['CI'],
          timeout: 30_000,
        },
        { command: 'node e2e/stub-api.mjs', port: 8787, reuseExistingServer: !process.env['CI'], timeout: 10_000 },
      ],
});
