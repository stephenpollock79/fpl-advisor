/**
 * Browser flows for the Assistant (STE-63).
 *
 * Every `/api/*` request is intercepted with a fixture world, so these run
 * without a server, a database or a model, and never spend. They drive the real
 * client bundle under Vite at the one viewport the app has.
 *
 * The installed Chrome is used rather than a downloaded browser. These are named
 * `*.spec.ts` so Vitest does not pick them up; CI runs Vitest only, and this runs
 * with `pnpm e2e`.
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5199',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  webServer: {
    command: 'corepack pnpm --filter @fpl/client exec vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
