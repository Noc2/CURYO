# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Curyo protocol (smart contracts, API routes, or infrastructure), please report it responsibly.

**Email:** info@hawig.xyz

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 1 week
- **Fix or mitigation:** depends on severity, but we aim for resolution within 30 days for critical issues

## Scope

The following are in scope:

- Smart contracts in `packages/foundry/contracts/`
- API routes in `packages/nextjs/app/api/`
- Ponder indexer in `packages/ponder/`
- Keeper service in `packages/keeper/`

Out of scope:

- Third-party dependencies (report upstream)
- Vendored upstream code under `packages/foundry/lib/*` unless the issue is caused by a Curyo-specific modification or integration bug
- Social engineering attacks
- Denial of service attacks

## Disclosure

We ask that you give us reasonable time to address the issue before public disclosure. We are happy to credit researchers who report valid vulnerabilities.
