import { defineConfig, devices } from '@playwright/test';

const FIXTURE_API_PORT = 4310;
const WEB_PORT = 4321;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: `bun run fixtures/server.ts`,
      url: `http://localhost:${FIXTURE_API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { FIXTURE_API_PORT: String(FIXTURE_API_PORT) },
    },
    {
      // The @astrojs/cloudflare adapter doesn't support `astro preview` (it errors:
      // "does not support the preview command"), so the SSR frontmatter under test runs
      // via `astro dev` instead — this still exercises the real page frontmatter/runtime,
      // just via Vite's dev server rather than the Workers build artifact.
      command: `bun run dev --port ${WEB_PORT}`,
      cwd: '../web',
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      env: { PUBLIC_API_URL: `http://localhost:${FIXTURE_API_PORT}` },
      timeout: 30_000,
    },
  ],
});
