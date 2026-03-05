import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: require.resolve("./global-setup"),
  testDir: "./tests",
  fullyParallel: false, // Tests share Anvil chain state — run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker to prevent Anvil nonce conflicts
  reporter: process.env.CI ? "github" : "html",
  timeout: 60_000, // On-chain tx confirmation needs time

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Exclude tests that need special conditions:
      // - settlement/reward/tied-round: need block advancement for settlement
      // - round-cancellation/content-dormancy: need time-skip (fast-forward days)
      // - mobile: need phone/tablet device profiles (run via mobile-phone/mobile-tablet projects)
      testIgnore:
        /round-cancellation|content-dormancy|settlement-lifecycle|reward-claim|tied-round|zz-multi-round|unanimous-settlement|mobile/,
    },
    {
      // Settlement tests need block advancement for random settlement.
      // Run with: yarn e2e:settlement
      name: "settlement",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /settlement-lifecycle|reward-claim|tied-round|zz-multi-round|unanimous-settlement/,
      dependencies: ["chromium"],
    },
    {
      // Round cancellation fast-forwards 7+ days — runs after settlement tests.
      name: "round-cancellation",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /round-cancellation/,
      dependencies: ["settlement"],
    },
    {
      // Content dormancy fast-forwards 30+ days — runs after round-cancellation.
      name: "content-dormancy",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /content-dormancy/,
      dependencies: ["round-cancellation"],
    },
    // Mobile: opt-in via --project=mobile-phone or --project=mobile-tablet
    // Install first: npx playwright install webkit
    {
      name: "mobile-phone",
      use: { ...devices["iPhone 12"] },
      testMatch: /mobile/,
      dependencies: ["chromium"],
    },
    {
      name: "mobile-tablet",
      use: { ...devices["iPad Mini"] },
      testMatch: /mobile/,
      dependencies: ["chromium"],
    },
    // Cross-browser: opt-in via --project=firefox or --project=webkit
    // Not included in default run to avoid tripling runtime on shared Anvil state.
    // Install first: npx playwright install firefox webkit
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  // Services must be started manually (global-setup.ts validates they're running):
  //   yarn chain && yarn deploy && yarn ponder:dev && yarn start
});
