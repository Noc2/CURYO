# Browser and Screen-Size Compatibility

This project treats browser and layout compatibility as a layered test problem:
fast automated checks on every PR, broader automated checks on a schedule, and
manual real-device smoke testing before releases that touch wallet-sensitive
flows.

## Supported Matrix

Automated tests should cover these browser families:

- Chromium: latest Chrome or Edge behavior.
- Firefox: latest stable desktop Firefox behavior.
- WebKit: latest Playwright WebKit as a proxy for Safari layout/runtime behavior.
- Mobile Safari profile: iPhone-sized WebKit viewport and touch behavior.
- Android Chrome profile: Pixel-sized Chromium viewport and touch behavior.
- Tablet profile: iPad-sized WebKit viewport and touch behavior.

Responsive layout checks should include these viewport sizes:

- `360x640`: small phone.
- `390x844`: modern phone.
- `768x1024`: tablet portrait.
- `1024x768`: tablet landscape or small laptop.
- `1280x800`: dense laptop.
- `1366x768`: common laptop.
- `1440x900`: desktop.

These sizes are not a substitute for content-driven responsive design. Use them
as regression sentinels, then add or adjust breakpoints where the UI actually
breaks.

## PR Checks

Every PR should keep the fast path focused:

- Chromium smoke and critical E2E coverage.
- Chromium responsive layout checks.
- Mobile layout checks when navigation, vote surfaces, dialogs, or shared page
  shells change.
- Accessibility semantic checks and axe scans for stable pages.

Avoid running the full settlement, keeper, reveal, or lifecycle suites across
Firefox and WebKit. Those tests mutate shared Anvil state and are expensive
enough that browser compatibility failures become hard to triage.

## Scheduled Checks

Scheduled or manually dispatched browser-compatibility jobs should run:

- `compat-chromium`
- `compat-firefox`
- `compat-webkit`
- `mobile-phone`
- `mobile-android`
- `mobile-tablet`

Keep these projects scoped to stable smoke, layout, and accessibility behavior.
Do not make them run the full chain lifecycle suite unless the test explicitly
needs that browser and has isolated state.

## Feature Support

Before introducing newer CSS or browser APIs:

- Check MDN Baseline and browser compatibility data.
- Prefer progressive enhancement for features that are not Baseline Widely
  available.
- Use `@supports` or runtime feature detection when a fallback is needed.
- Keep wallet, submit, vote, reveal, claim, and navigation flows usable without
  optional visual enhancements.

## Visual Regression Policy

Visual screenshots should start small:

- Prefer stable pages such as `/docs`, `/legal`, `/submit`, and the landing
  page.
- Avoid dynamic feed, wallet, timestamp, animation, or chain-state regions unless
  they are masked.
- Generate and compare baselines in the same CI environment. Browser rendering
  can differ across operating systems, fonts, hardware, headless mode, and power
  settings.

Visual checks are a complement to layout assertions, not a replacement.

