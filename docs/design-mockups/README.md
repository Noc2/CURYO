# Design Mock-ups

These are standalone review artifacts rather than production UI.

## Current Files

1. `planet-flare-landing.svg`
   Landing page mock-up using the current Curyo hero and "How it Works" structure.
   Preview export: `planet-flare-landing.png`

2. `planet-flare-spacefox-theme.svg`
   Warmer Spacefox-style dashboard direction built around the multicolor signal planet.
   Preview export: `planet-flare-spacefox-theme.png`

3. `planet-flare-logo-exploration.svg`
   Logo exploration board for the planet-plus-flare direction.
   Preview export: `planet-flare-logo-exploration.png`

4. `logo-rollout-plan.md`
   Rollout plan for replacing the shared brand assets.

## PNG Export

The PNG previews are generated from the SVG sources with:

```bash
node docs/design-mockups/render-pngs.mjs
```

This keeps the raster previews in sync with the editable SVG artwork.

## Notes

- These are mock-ups only.
- The live app was reverted separately and is not using these designs.
