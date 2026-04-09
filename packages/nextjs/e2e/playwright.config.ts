import { E2E_BASE_URL } from "./helpers/service-urls";
import { defineConfig, devices } from "@playwright/test";

const specFile = (name: string) => new RegExp(`(^|[/\\\\])${name}\\.spec\\.[cm]?[jt]sx?$`);

const BROWSER_COMPAT_TESTS = specFile("browser-compat");
const RESPONSIVE_LAYOUT_TESTS = specFile("responsive-layout");
const ACCESSIBILITY_AXE_TESTS = specFile("accessibility-axe");
const MOBILE_TESTS = specFile("mobile");

export default defineConfig({
  globalSetup: "./global-setup.cts",
  testDir: "./tests",
  fullyParallel: false, // Tests share Anvil chain state — run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker to prevent Anvil nonce conflicts
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "html",
  timeout: 60_000, // On-chain tx confirmation needs time

  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "ci-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /smoke|pages-smoke|docs-pages|nextjs-api|follow-api|watchlist-api|faucet|single-tx-vote|contract-boundaries/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Exclude tests that need special conditions:
      // - settlement/reward/tied-round: need block advancement for settlement
      // - round-cancellation/content-dormancy: need time-skip (fast-forward days)
      // - mobile/responsive/browser-compat/a11y: scoped device/browser projects
      testIgnore:
        /round-cancellation|content-dormancy|settlement-lifecycle|reward-claim|tied-round|zz-multi-round|unanimous-settlement|frontend-fee-claim|reveal-failed|manual-reveal|keeper-settlement|mobile|browser-compat|responsive-layout|accessibility-axe/,
    },
    {
      name: "responsive-layout",
      use: { ...devices["Desktop Chrome"] },
      testMatch: RESPONSIVE_LAYOUT_TESTS,
    },
    {
      name: "accessibility-axe",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ACCESSIBILITY_AXE_TESTS,
    },
    {
      name: "compat-chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: BROWSER_COMPAT_TESTS,
    },
    {
      name: "compat-firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: BROWSER_COMPAT_TESTS,
    },
    {
      name: "compat-webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: BROWSER_COMPAT_TESTS,
    },
    {
      // Settlement tests need block advancement for random settlement.
      // Run with: yarn e2e:settlement
      name: "settlement",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /settlement-lifecycle|reward-claim|tied-round|zz-multi-round|unanimous-settlement|frontend-fee-claim|reveal-failed|manual-reveal/,
      dependencies: ["chromium"],
    },
    {
      // Keeper-backed settlement tests require the live keeper service and
      // should avoid direct reveal/settle helper calls.
      name: "settlement-keeper",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /keeper-settlement/,
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
    // Install first: npx playwright install chromium webkit
    {
      name: "mobile-phone",
      use: { ...devices["iPhone 12"] },
      testMatch: MOBILE_TESTS,
    },
    {
      name: "mobile-android",
      use: { ...devices["Pixel 5"] },
      testMatch: MOBILE_TESTS,
    },
    {
      name: "mobile-tablet",
      use: { ...devices["iPad Mini"] },
      testMatch: MOBILE_TESTS,
    },
  ],

  // Services must be started manually (global-setup.ts validates they're running):
  //   yarn chain && yarn deploy && yarn dev:stack
});
