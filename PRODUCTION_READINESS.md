# Production Readiness Checklist

A checklist of audits, tests, and reviews to run before going to production. Each section includes the Claude Code prompt to copy-paste. Run them in the order listed — earlier items have higher impact and may surface issues that affect later steps.

---

## 1. Smart Contract Security Audit
**Priority: Critical**

```
Audit all Solidity contracts in packages/foundry/contracts/ for security vulnerabilities. Check for:
- Access control issues (role escalation, missing checks, leftover admin roles post-deploy)
- Reentrancy vulnerabilities (even with nonReentrant, check cross-contract calls)
- Integer overflow/underflow in reward calculations
- Front-running risks in commit-reveal voting
- UUPS upgrade safety (storage layout collisions, initializer gaps)
- Flash loan attack vectors on staking/voting
- Griefing attacks (can someone block rounds, drain gas, spam categories?)
- Verify deployer has zero roles after deployment completes
Report each finding with severity (Critical/High/Medium/Low/Info), file, line number, and suggested fix.
```

## 2. API Route Security Review
**Priority: Critical**

```
Review all API routes in packages/nextjs/app/api/ for security issues:
- SSRF risks in image-proxy/route.ts and thumbnail/route.ts (do the allowlists actually prevent abuse?)
- Rate limiting — are any routes missing rate limits that could be abused?
- Input validation — are URL parameters properly sanitized?
- API key exposure — does the RAWG proxy route properly hide the key?
- Response size limits — can an attacker trigger unbounded responses?
- CORS configuration — is it appropriate for production?
Report each finding with severity and suggested fix.
```

## 3. Environment & Configuration Audit
**Priority: High**

```
Check the entire codebase for production readiness issues:
- Hardcoded testnet values that would break on mainnet (RPC URLs, chain IDs, addresses)
- Missing environment variable validation (what happens if RAWG_API_KEY is unset?)
- Secrets that shouldn't be committed (.env files, API keys, private keys)
- Console.log statements that should be removed for production
- Development-only code paths that should be gated
- Check all .env.example files exist and document required variables
Report each finding with file path and line number.
```

## 4. Forge Test Coverage
**Priority: High**

```
Run `cd packages/foundry && forge coverage` and analyze the results. Identify:
- Contracts with less than 80% line coverage
- Critical functions with no test coverage (especially in voting, rewards, staking)
- Edge cases that aren't tested (zero amounts, max values, boundary conditions)
- Missing negative tests (things that SHOULD revert but aren't tested)
Write new tests for the most critical gaps you find. Focus on the FrontendRegistry register()/deregister() changes, the HumanFaucet claim tiers, and round settlement edge cases.
```

## 5. Frontend Type Safety & Error Handling
**Priority: Medium**

```
Review packages/nextjs/ for frontend robustness:
- TypeScript errors or any `as any` casts that hide bugs
- Missing error boundaries around components that fetch external data
- Unhandled promise rejections in hooks and API calls
- Missing loading/error states in UI components
- Wallet disconnection handling — does the app gracefully handle disconnects mid-transaction?
- Check that all contract reads handle the case where the contract returns unexpected data
Fix any issues you find.
```

## 6. Bot Package Review
**Priority: Medium**

```
Review packages/bot/ for production robustness:
- Error handling in all strategies (twitter.ts, rawg.ts, etc.) — what happens if APIs are down?
- Rate limiting compliance with external APIs (RAWG: 20k/month, Twitter syndication: undocumented limits)
- Retry logic — are transient failures handled?
- Gas estimation — does the bot handle gas spikes gracefully?
- Private key management — is the keystore approach secure?
- Logging — is there enough to diagnose production issues without leaking secrets?
Report findings and fix critical issues.
```

## 7. Ponder Indexer Review
**Priority: Medium**

```
Review packages/ponder/ for production readiness:
- Are all contract events indexed? Check for missing event handlers
- BigInt serialization — verify all API responses use replaceBigInts
- Error handling in event handlers — what happens on reorg?
- Schema completeness — does the schema cover all data the frontend needs?
- Performance — any N+1 query patterns in the API routes?
- Check that start blocks are correct for the current deployment
Fix any issues you find.
```

## 8. Dependency Audit
**Priority: Medium**

```
Run `yarn audit` at the repo root and review the output. Also check:
- Are there any dependencies with known CVEs?
- Are critical dependencies pinned to exact versions?
- Are there any unnecessary dependencies that increase attack surface?
- Is react-tweet on a stable version?
- Check license compatibility for all dependencies (especially for commercial use)
Report findings with severity.
```

## 9. Performance & UX Review
**Priority: Low**

```
Review the frontend for performance and UX issues:
- Bundle size — are there unnecessarily large imports?
- Lazy loading — are embed components properly code-split?
- Image optimization — are external images sized appropriately?
- Mobile responsiveness — do all embed components work on small screens?
- Accessibility — do interactive elements have proper aria labels?
- Loading states — is there visual feedback during all async operations?
Report findings and fix quick wins.
```

## 10. Deployment & Infrastructure
**Priority: Low**

```
Review deployment configuration for production:
- Is the Vercel/hosting config production-ready? (caching headers, redirects, error pages)
- Are there health check endpoints for monitoring?
- Is there a rollback strategy for contract upgrades?
- Are Ponder's reserved routes (/health, /status) accessible for monitoring?
- Is there logging/alerting set up for contract events (slashing, large transfers)?
Document any gaps and suggest solutions.
```
