# Agent Workflow Notes

## Commits

- Commit each self-contained change immediately after it is made.
- Keep commits narrow and avoid bundling unrelated edits together.
- If a change is intentionally left uncommitted, call that out explicitly.

## Review Guidelines

- Prioritize real regressions over style feedback: broken user flows, incorrect contract wiring, unsafe assumptions, and missing test coverage matter most.
- Pay extra attention to wallet-sensitive paths such as connect, vote, submit, reveal, claim, and any flow that changes behavior across injected wallets, thirdweb wallets, or Ledger/MetaMask.
- Treat chain and deployment config as high-risk: verify frontend, Ponder, keeper, bot, and shared deployment artifacts stay aligned when addresses, target networks, RPCs, or environment guards change.
- For CI or E2E changes, check both the app behavior and the test infrastructure itself. Route warmup, local-vs-production server behavior, helper retries, and service startup assumptions are common failure points here.
- Flag responsive UI regressions on laptop layouts and dense voting surfaces, especially if changes affect card height, scrolling, queue visibility, or text readability.
- Call out when a change should include or update tests, particularly Foundry tests, Next.js node tests, and Playwright coverage for critical user flows.
