# Release Browser Smoke Checklist

Use this checklist before releasing changes that affect layout, navigation,
wallet connection, voting, submission, settlement, or rewards.

## Browser and Device Pass

Smoke the release candidate on:

- Desktop Chrome or Edge.
- Desktop Firefox.
- Desktop Safari.
- iPhone Safari.
- Android Chrome.
- Tablet Safari or Chrome.

For each browser or device:

- Open `/` and confirm the page renders without console error overlays.
- Open `/vote` and confirm the feed, active content surface, vote controls, and
  navigation are usable.
- Open `/submit` and confirm the URL input is visible, focusable, and usable.
- Open `/portfolio` and confirm wallet/account state renders correctly.
- Open `/docs` and `/legal` and confirm text is readable with no horizontal
  scrolling.
- Resize desktop browsers through phone, tablet, laptop, and desktop widths.
- Confirm dialogs fit within the viewport and can be dismissed.

## Wallet-Sensitive Pass

Run the highest-risk wallet flows on at least one desktop browser and one mobile
browser:

- Connect a wallet.
- Submit content.
- Vote up and vote down.
- Reveal when the flow is available.
- Claim rewards when the flow is available.
- Disconnect and reconnect.

When available, also smoke:

- Injected MetaMask-style wallet.
- Thirdweb wallet.
- WalletConnect mobile flow.
- Ledger or hardware-wallet path.

## Layout Watchpoints

Pay extra attention to:

- No horizontal scrolling on phone, tablet, and laptop widths.
- Dense vote cards keeping buttons, stake controls, and status text readable.
- Queue, thumbnail, and active-card surfaces remaining visible on laptop
  layouts.
- Mobile hamburger navigation opening, closing, and navigating correctly.
- Sticky or fixed headers not covering form inputs, dialogs, or vote controls.

Record any device-specific issue with browser, OS version, viewport size,
wallet type, route, and a screenshot or screen recording.

