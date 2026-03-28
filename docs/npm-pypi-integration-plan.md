# npm and PyPI Integration Plan

This plan adds `npm Packages` and `PyPI Packages` as first-class Curyo platforms without breaking the current category ID layout.

## Why These Two Next

- They are centralized platforms with stable URL structures.
- They are highly useful for AI consumption and agent workflows.
- They do not have a strong native, reputation-weighted rating layer today.
- They fit the existing Curyo model better than fragmented "official docs" sources.

## Phase 0: Reserve the Categories at Deployment

Goal: make new deployments seed the platform categories from day one.

Implementation:
- Append `npm Packages` as category `13` with domain `npmjs.com`
- Append `PyPI Packages` as category `14` with domain `pypi.org`
- Do not reorder the first 12 categories, because tests and seed scripts already assume those IDs

Status in this change:
- Added to `packages/foundry/script/DeployCuryo.s.sol`

## Phase 1: URL Detection and Canonicalization

Goal: treat npm and PyPI URLs as first-class platform URLs in the frontend.

Files to add/update:
- `packages/nextjs/utils/platforms/types.ts`
- `packages/nextjs/utils/platforms/registry.ts`
- `packages/nextjs/utils/platforms/handlers/npm.ts`
- `packages/nextjs/utils/platforms/handlers/pypi.ts`

Suggested rules:

### npm

Supported forms:
- `https://www.npmjs.com/package/react`
- `https://npmjs.com/package/react`
- `https://www.npmjs.com/package/@scope/name`

Canonical form:
- `https://www.npmjs.com/package/<normalized-package-name>`

Canonical content key target:
- package name only
- examples:
  - `react`
  - `@tanstack/react-query`

### PyPI

Supported forms:
- `https://pypi.org/project/requests/`
- `https://pypi.org/project/pydantic`

Canonical form:
- `https://pypi.org/project/<normalized-project-name>/`

Canonical content key target:
- normalized project name, using PyPI normalization rules
- examples:
  - `requests`
  - `langchain-core`

Security constraints:
- strict hostname allowlist
- strict path parsing
- no README or arbitrary HTML fetches in the first version
- normalize names before dedupe

## Phase 2: Metadata Fetching

Goal: provide enough metadata for cards, voting pages, and previews.

Files to update:
- `packages/nextjs/utils/resolveEmbed.ts`
- `packages/nextjs/lib/contentMetadata/types.ts` if additional fields are needed

Suggested metadata surface for v1:

### npm

Primary source:
- npm registry package metadata endpoint

Suggested fields:
- package name
- latest version
- description
- license
- homepage
- repository URL
- maintainers count or names if cheap to fetch

Thumbnail strategy:
- no thumbnail in v1
- use generic package visual treatment in UI

### PyPI

Primary source:
- PyPI JSON API

Suggested fields:
- project name
- latest version
- summary
- license
- project URLs
- author/maintainer if available

Thumbnail strategy:
- no thumbnail in v1
- use generic package visual treatment in UI

Operational rules:
- keep the existing response-size guard
- cache aggressively, similar to other metadata lookups
- fail soft and return partial metadata when remote APIs are missing fields

## Phase 3: Submission-Key Quality Upgrade

Goal: improve on-chain dedupe beyond generic normalized URLs.

Current behavior:
- These new domains will work immediately through the generic URL fallback in `SubmissionCanonicalizer.sol`

Upgrade later:
- add package-specific extraction for:
  - `npmjs.com -> npm:<package-name>`
  - `pypi.org -> pypi:<normalized-project-name>`

Files to update later:
- `packages/foundry/contracts/SubmissionCanonicalizer.sol`
- related Foundry tests for canonical URL and submission-key behavior

This should be a separate contract change because it affects on-chain deduplication semantics.

## Phase 4: Seed and Test Coverage

Goal: cover the new platforms in local dev and CI.

Suggested updates:
- append example npm and PyPI submissions to `packages/foundry/script/SeedContent.sh`
- add them to `packages/nextjs/e2e/helpers/baseline-seed.ts`
- add handler unit tests for scoped npm packages and normalized PyPI names
- add metadata resolver tests for happy path and malformed URLs

Suggested example URLs:
- npm: `https://www.npmjs.com/package/react`
- npm: `https://www.npmjs.com/package/@tanstack/react-query`
- PyPI: `https://pypi.org/project/requests/`
- PyPI: `https://pypi.org/project/pydantic/`

## Recommended Delivery Order

1. Seed categories at deployment time
2. Add frontend handlers and canonical URLs
3. Add metadata fetching
4. Add local seed content and tests
5. Upgrade Solidity submission-key specialization if generic URL dedupe proves too weak

## Recommendation

Ship `npm` first, then `PyPI` immediately after in the same platform wave.

Reason:
- npm URL patterns are simple and common in the current audience
- PyPI follows the same conceptual model, so the implementation work overlaps heavily
- together they create a strong "package registries" product category for AI users
