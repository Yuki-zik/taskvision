import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.resolve('artifacts/e2e-results.json') }]],
  outputDir: path.resolve('artifacts/e2e'),
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
