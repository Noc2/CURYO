# Curyo — Claude Code Guidelines

Decentralized reputation game where users stake cREP tokens on content quality predictions. Yarn 3 monorepo with 5 packages: `foundry` (Solidity), `nextjs` (frontend), `ponder` (indexer), `keeper` (round settlement), `bot` (CLI voting). See [README.md](README.md) for full overview.

## Allowed Tools

WebSearch, WebFetch, Bash(yarn *), Bash(forge *), Bash(git log*), Bash(git status*), Bash(git diff*), Bash(git push*), Bash(git add*), Bash(git commit*), Bash(git checkout*), Bash(git branch*), Bash(git stash*), Bash(git merge*), Bash(git rebase*), Bash(git fetch*), Bash(git cherry-pick*), Bash(rm -rf packages/ponder/.ponder*), Bash(curl *), Bash(npx *), Bash(ls *), Bash(mkdir *), Bash(cp *), Bash(mv *), Bash(cat *), Bash(which *), Bash(node *), Bash(cast *)

## Common Commands

| Task | Command |
|---|---|
| Local chain | `yarn chain` |
| Deploy contracts | `yarn deploy` |
| Frontend dev | `yarn start` |
| Ponder indexer | `yarn ponder:dev` |
| Keeper | `yarn keeper:dev` |
| Foundry tests | `yarn foundry:test` |
| Next.js lint | `yarn next:lint` |
| Type check | `yarn next:check-types` |
| Format | `yarn format` |
| Whitepaper PDF | `cd packages/nextjs && yarn whitepaper` |
| E2E tests | `yarn e2e` |

## Smart Contract Security

These rules are mandatory for any Solidity changes:

- **Never** remove or weaken access controls, require/revert checks, or safety guards without explicit user approval
- Every contract change **must** include corresponding Foundry tests
- **Never** use `tx.origin` for authorization — use `msg.sender` with role checks
- Preserve storage layout compatibility for UUPS upgradeable contracts — never reorder, remove, or change types of existing storage variables
- Use custom errors over require strings (gas efficiency)
- Check for reentrancy when adding external calls to untrusted contracts
- Run `yarn foundry:test` after any contract modification

## General Security

- **Never** commit `.env` files, private keys, mnemonics, or API keys
- Only add new domains to the image proxy whitelist (`packages/nextjs/app/api/image-proxy/route.ts`) after confirming the domain is trustworthy
- Validate all user input at API route boundaries
- Use parameterized queries with Drizzle ORM — no raw SQL string interpolation

## Code Conventions

**TypeScript/React** — Path alias `~~/*` for project root. Functional components only. Use scaffold-eth hooks (`useScaffoldReadContract`, `useScaffoldWriteContract`) for contract interaction. Add `"use client"` directive for client components.

**Solidity** — Custom errors (not require strings). UUPS upgradeable pattern. Role-based access via `AccessControlUpgradeable`. Tests extend `Test` from forge-std.

**Ponder** — Always use `replaceBigInts()` from `"ponder"` before `c.json()` (BigInt breaks JSON.stringify). Routes `/health` and `/status` are reserved by Ponder. Drizzle operators (`eq`, `desc`, `asc`, `and`, `inArray`, `sql`) are re-exported from `"ponder"`.

**Commits** — `type: subject` format. Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.

## Architecture

```
foundry (compile) → ABIs in contracts/src/abis/ + addresses in contracts/src/deployedContracts.ts
ponder (index)    → REST API at localhost:42069, consumed by nextjs via services/ponder/client.ts
nextjs (frontend) → reads contracts via wagmi/scaffold-eth hooks + Ponder API
keeper (service)  → settles rounds via trySettle(), cancels expired rounds, marks dormant content
```

## Key File Locations

| What | Path |
|---|---|
| Contract source | `packages/foundry/contracts/` |
| Contract tests | `packages/foundry/test/` |
| Deployed addresses | `packages/contracts/src/deployedContracts.ts` |
| Contract ABIs | `packages/contracts/src/abis/` |
| Ponder schema | `packages/ponder/ponder.schema.ts` |
| Ponder API routes | `packages/ponder/src/api/index.ts` |
| Ponder client | `packages/nextjs/services/ponder/client.ts` |
| Platform handlers | `packages/nextjs/utils/platforms/handlers/` |
| Embed components | `packages/nextjs/components/content/embeds/` |
| Scaffold-eth hooks | `packages/nextjs/hooks/scaffold-eth/` |
| API routes | `packages/nextjs/app/api/` |
| Drizzle schema | `packages/nextjs/lib/db/schema.ts` |
| Whitepaper generator | `packages/nextjs/scripts/whitepaper/` |

## Gotchas

- **PGlite corruption**: If Ponder crashes, run `rm -rf packages/ponder/.ponder` to clear corrupted state
- **macOS zsh**: Single-quote curl URLs with `?` and `&` (e.g., `curl 'http://localhost:42069/content?status=all'`)
- **Pre-commit hook failures**: Fix the issue, re-stage, and create a **new** commit — never amend (the failed commit didn't happen)
- **Approve + write race**: Use `disableSimulate: true` on `useScaffoldWriteContract` for calls that immediately follow an `approve` tx (simulation runs against stale allowance state)
- **Whitepaper LaTeX SVGs**: MathJax `<path>` elements need `transform` attributes wrapped in `<G>` or characters stack at origin
- **`as any` on RoundVotingEngine hooks**: TypeScript inference hits complexity limits on the 6300-line ABI, causing generic resolution failures in scaffold-eth hooks. The `as any` casts are a known workaround, not a fixable type error

## Workflow Preferences

- Auto-commit after completing any task that changes files — do not wait for user to ask
- Use the `type: subject` commit format described above
