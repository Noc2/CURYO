# Wallet/Auth Platform Comparison

Verified on March 19, 2026.

This compares `thirdweb`, `Dynamic`, and the most relevant alternatives for Curyo's current stack. The focus is pricing first, then product fit.

## Short answer

- If Curyo stays mostly self-custodial, the cheapest path is to keep the current `RainbowKit` + `WalletConnect` approach and only add a richer vendor if product goals change.
- If Curyo wants embedded wallets plus email/social login with the least platform churn, `Dynamic`, `Privy`, and `Reown` are the closest fits.
- If Curyo wants one vendor for more than auth and wallets, `thirdweb` is the broadest all-in-one option and its public wallet pricing is notably aggressive.
- If Curyo wants the most control over wallet custody, signing, and backend policies, `Turnkey` is the strongest infrastructure-layer option, but it is not a drop-in frontend replacement.

## Why this matters for this repo

Curyo currently uses external wallet connectors through `RainbowKit`, `wagmi`, and `WalletConnect`, not an embedded wallet platform:

- [`packages/nextjs/services/web3/wagmiConnectors.tsx`](../packages/nextjs/services/web3/wagmiConnectors.tsx)
- [`packages/nextjs/components/ScaffoldEthAppWithProviders.tsx`](../packages/nextjs/components/ScaffoldEthAppWithProviders.tsx)
- [`packages/nextjs/scaffold.config.ts`](../packages/nextjs/scaffold.config.ts)

Inference from the current codebase:

- Lowest migration effort: `Reown`
- Moderate migration effort: `Dynamic`, `Privy`, `Magic`, `Web3Auth`
- Highest migration effort: `Turnkey`, `Sequence`, `Crossmint`, `thirdweb` if Curyo adopts the broader stack instead of just wallet auth

## Pricing snapshot

All figures below are public list prices from vendor pricing pages and do not include taxes, SMS delivery surcharges, gas, onramp fees, swaps, or other pass-through network costs.

| Vendor | Best described as | Public self-serve entry | Public usage model | Pricing take |
| --- | --- | --- | --- | --- |
| `thirdweb` | Broad web3 platform: wallets, server wallets, gas, RPC, storage, contracts | `$5/mo` Starter | User wallets: first `1,000` free, then `$0.015/MAU` up to `100k`; custom auth starts on `Growth` at `$99/mo` | Cheap on wallet MAU, but total spend grows if you also use gas, RPC, server wallets, or bridge |
| `Dynamic` | Wallet/auth platform with embedded wallets, auth, smart wallets, UI | Free Launch | Free to `1,000` MAUs; `Growth` is `$249/mo` incl. `5,000` MAUs, then `$0.05/additional MAU`; `10k+` is Enterprise | Strong mid-market option; connect-only usage is especially attractive |
| `Privy` | Wallet infra + auth + embedded wallet platform | Free | `0-499` MAU free, `500-2,499` is `$299/mo`, `2,500-9,999` is `$499/mo`; above `10k` is usage/custom | Mature platform, but list price is higher than most peers at low and mid scale |
| `Reown` | WalletConnect/AppKit platform with embedded wallets and payments | Free | Self-custodial MAUs are effectively unlimited; embedded/auth MAUs are free to `500`; `Pro` is `$89/mo` incl. `7,500` embedded/auth MAUs, then `$0.05/extra MAU` | Best price-to-effort fit if Curyo wants to extend the current stack |
| `Magic` | Embedded wallet + passwordless auth platform | Free | Free to `1,000` MAWs with `$0.045/additional`; `Startup` is `$99/mo` incl. `2,500`, then `$0.04/additional`; Enterprise is custom | Usually cheaper than Dynamic and Privy, but not as aligned to Curyo's current stack |
| `Web3Auth` | Embedded wallet/auth platform with MPC and AA | Free | Free to `1,000` MAWs with `$0.05/additional`; `Growth` is `$69/mo` incl. `3,000`; `Scale` is `$399/mo` incl. `10,000` | Very competitive self-serve pricing |
| `Turnkey` | Wallet infrastructure / key management / signing layer | Free | `25` free signatures, then pay-as-you-go at `$0.10/signature`; `Pro` has `$99/mo` minimum and can go as low as `$0.01/signature` | Excellent if you want infra control, but pricing is transaction-driven, not MAU-driven |
| `Crossmint` | Wallets + payments + stablecoin rails + tokenization | Free | `1,000` free monthly active wallets and txs; custom wallet pricing starts at `$0.05/MAW` | Good suite if payments matter, but pricing is less transparent |
| `Sequence` | Ecosystem wallet platform for multi-app experiences | Custom | Public site says `unlimited wallets` and `no per-active-wallet fees`, but no public numeric rates | Potentially attractive at high scale; requires sales process |

## Estimated monthly cost by embedded/auth user count

These are rough planning numbers using public list pricing only.

Assumptions:

- `thirdweb Starter` includes the monthly platform fee plus wallet MAU charges.
- `thirdweb Growth` is shown separately because custom in-app wallet auth starts there.
- `Reown` uses the public monthly `Pro` price of `$89`, not the cheaper annual equivalent.
- `Magic` and `Web3Auth` use the cheapest public self-serve path that fits the usage level, which may not include every higher-tier feature.
- `Dynamic`, `Privy`, `Crossmint`, and `Sequence` become sales-led at higher scale, so public planning numbers are less precise there.

| Vendor | 500 MAUs | 2,500 MAUs | 5,000 MAUs | 10,000 MAUs | Notes |
| --- | --- | --- | --- | --- | --- |
| `thirdweb Starter` | `$5` | `$27.50` | `$65` | `$140` | First `1,000` wallets free |
| `thirdweb Growth` | `$99` | `$121.50` | `$159` | `$234` | Needed if you want custom in-app wallet auth |
| `Dynamic` | `$0` | `$249` | `$249` | about `$499` | `10k+` moves into Enterprise pricing |
| `Privy` | `$299` | `$499` | `$499` | custom / usage | Public site does not expose an exact `10k+` number |
| `Reown` | `$0` | `$89` | `$89` | about `$214` | `Pro` includes `7,500` MAUs, then `$0.05` each |
| `Magic` | `$0` | about `$67.50` | about `$180` | about `$399` | Cheapest public path; `Startup` is the lower-cost option once MAU gets high enough and adds MFA/session features |
| `Web3Auth` | `$0` | `$69` | about `$159` | about `$384` | Cheapest public path; `Scale` becomes better once feature needs rise |
| `Crossmint` | `$0` | custom | custom | custom | Public site only states starts at `$0.05/MAW` after free tier |
| `Sequence` | custom | custom | custom | custom | No public numeric wallet pricing |
| `Turnkey` | depends on signatures | depends on signatures | depends on signatures | depends on signatures | Better modeled by signed actions per month, not MAUs |

## Direct comparison: `thirdweb` vs `Dynamic`

### `thirdweb`

Best if Curyo wants one vendor for:

- embedded wallets
- server wallets
- gas sponsorship
- RPC
- storage
- bridge / swaps
- broader contract tooling

Pricing upside:

- At public list price, `thirdweb` is materially cheaper on wallet MAU than `Dynamic`
- Even `thirdweb Growth` is still cheaper than `Dynamic Growth` for many MAU ranges

Tradeoff:

- It is broader than Curyo currently needs
- That breadth is only a win if Curyo actually wants to consolidate more infrastructure under one vendor
- If Curyo only wants better login and embedded wallets, `thirdweb` can be more platform than product

### `Dynamic`

Best if Curyo wants:

- embedded wallets
- multi-chain auth and wallet UX
- bring-your-own-auth options
- smart wallets
- minimal friction for connect-first apps

Pricing upside:

- Free up to `1,000` MAUs
- Connect-only users are included in the free tier with no count limit, which matters for apps that still want to support normal external wallets

Tradeoff:

- Above the free tier, `Dynamic` is noticeably more expensive than `thirdweb`, `Reown`, `Magic`, and `Web3Auth`
- It is narrower than `thirdweb` if Curyo later wants to consolidate gas, RPC, backend wallet operations, and related infra

## Best alternatives by use case

### If the goal is lowest migration risk

1. `Reown`
2. `Dynamic`
3. `Privy`

Why:

- Curyo already depends on `WalletConnect`
- `Reown` is the natural evolution of the current stack
- `Dynamic` and `Privy` are still reasonable, but more of the connect/auth surface would change

### If the goal is cheapest public pricing for embedded wallets

1. `thirdweb`
2. `Reown`
3. `Web3Auth`

Why:

- `thirdweb` has the strongest public wallet-MAU economics in this set
- `Reown` is cheap and especially attractive if self-custodial users remain a first-class path
- `Web3Auth` is one of the more price-aggressive auth-first options

### If the goal is best product fit for a consumer app

1. `Dynamic`
2. `Privy`
3. `Reown`

Why:

- All three are strong app-facing wallet/auth products
- They are easier to justify than `Turnkey` if the team wants to move quickly
- They are more directly comparable to each other than to `thirdweb`

### If the goal is maximum control and backend policy enforcement

1. `Turnkey`
2. `thirdweb`
3. `Crossmint`

Why:

- `Turnkey` is the cleanest infrastructure-layer choice
- `thirdweb` and `Crossmint` also cover backend wallet operations, but with more bundled product surface

## Recommendation for Curyo

If the goal is to improve onboarding without rewriting the whole wallet stack, I would shortlist:

1. `Reown`
2. `Dynamic`
3. `Privy`

Reason:

- `Reown` is the easiest fit with the current codebase and has attractive public pricing
- `Dynamic` is the best direct "upgrade the wallet/auth UX" option if product wants embedded wallets plus strong auth flexibility
- `Privy` is worth evaluating if the team values its developer ergonomics and wallet APIs enough to justify the higher list price

I would only put `thirdweb` at the top of the list if Curyo also wants to evaluate:

- sponsored transactions
- server wallets
- RPC and infra bundling
- vendor consolidation across more of the stack

If Curyo does not want that broader consolidation, `thirdweb` is cost-effective but not the cleanest product match.

## Bottom line

- `Dynamic` is the cleaner direct comparison to Curyo's likely near-term need.
- `thirdweb` wins on breadth and public wallet pricing.
- `Reown` is the safest shortlist item because it matches the current stack and pricing well.
- `Privy` is the premium direct alternative.
- `Turnkey` is the engineering-heavy control play.

## Sources

- [thirdweb pricing](https://thirdweb.com/pricing)
- [Dynamic pricing](https://www.dynamic.xyz/pricing)
- [Privy pricing](https://www.privy.io/pricing)
- [Reown pricing](https://reown.com/pricing)
- [Reown Pro plan docs](https://docs.reown.com/appkit/paid-plans/pro)
- [Magic pricing](https://magic.link/pricing)
- [Web3Auth pricing](https://web3auth.io/pricing.html)
- [Turnkey pricing](https://www.turnkey.com/pricing)
- [Crossmint pricing](https://www.crossmint.com/pricing)
- [Sequence wallet product page](https://sequence.xyz/products/wallets)
