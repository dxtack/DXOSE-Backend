/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: __dirname,
  testMatch: 'gate-c-keyboard-e2e.spec.mjs',
  timeout: 120000,
  use: {
    headless: true,
    viewport: { width: 1400, height: 900 },
  },
};
