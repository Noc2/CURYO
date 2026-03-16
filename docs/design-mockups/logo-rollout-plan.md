# Planet Flare Logo Rollout Plan

This plan replaces the current lighthouse-ring mark with a new planet-and-flare system across the app and brand assets.

## Brand System

We should define the new logo as a small family rather than a single SVG:

1. `planetHero`
   Large, dimensional planet with animated flare orbit.
   Used on the landing page hero.

2. `planetBadge`
   Standalone icon mark for the top-left header logo and general brand surfaces.
   Keeps the planet, one outer orbit, and a restrained flare segment.

3. `planetMicro`
   Simplified favicon/app-icon version.
   Same silhouette, fewer inner details, stronger contrast at tiny sizes.

4. `planetLockup`
   Planet badge paired with the `CURYO` wordmark.
   Used for banner, README, and any wider brand placements.

## Codebase Replacement Map

1. Replace the canonical React mark in [CuryoLighthouseMark.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/brand/CuryoLighthouseMark.tsx).
   Rename or replace it with a new `CuryoPlanetMark` component.
   Keep prop support for animated/static usage and small-size variants.

2. Update the shared wrapper in [CuryoLogo.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/CuryoLogo.tsx).
   The rest of the app should keep consuming one shared logo wrapper.

3. Replace the public brand assets:
   [logo.svg](/Users/davidhawig/source/curyo-release/packages/nextjs/public/logo.svg)
   [logo.png](/Users/davidhawig/source/curyo-release/packages/nextjs/public/logo.png)
   [favicon.svg](/Users/davidhawig/source/curyo-release/packages/nextjs/public/favicon.svg)
   [favicon.png](/Users/davidhawig/source/curyo-release/packages/nextjs/public/favicon.png)
   [banner.svg](/Users/davidhawig/source/curyo-release/packages/nextjs/public/banner.svg)
   [banner.png](/Users/davidhawig/source/curyo-release/packages/nextjs/public/banner.png)

4. Replace the landing hero mark in [CuryoAnimation.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/home/CuryoAnimation.tsx).
   This should become the large hero version:
   big planet,
   animated flare orbiting around it,
   subtle ambient stars/background glow,
   motion reduced or disabled for `prefers-reduced-motion`.

5. Update any remaining mark-only placements.
   Search for `CuryoLogo`, `CuryoLighthouseMark`, and direct `logo.svg` usage.

## Recommended Rollout Sequence

1. Finalize one approved logo direction from the mock-ups.
2. Build `CuryoPlanetMark` with three variants: `hero`, `badge`, `micro`.
3. Swap `CuryoLogo` and the header/top-left brand usage first.
4. Replace favicon and exported public assets.
5. Replace the landing-page animation with the large animated hero planet.
6. Refresh the banner/README art after the new production mark is stable.

## Design Constraints

- The hero version can be dimensional and animated.
- The header/logo version should be calmer and slightly flatter.
- The favicon must keep the same silhouette but drop fragile detail.
- The flare should communicate signal/progress, not read like a random streak.
- The orbit should stay outside the planet; the flare is what moves.

## Landing Page Behavior

For the landing page specifically:

- The planet should be large and dominant, replacing the current logo-scale mark.
- The flare should animate around the orbit path, not through the planet.
- The motion should feel slow and intentional, closer to orbital progress than to a spinner.
- The hero should still work as a static composition if animation is disabled.
