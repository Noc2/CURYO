# Design Mock-ups

These are standalone review artifacts for the current brand direction.

Current canonical brand artwork:

- `ai-sphere-obsidian-ember-fold-with-flare.svg`

Archived alternatives kept only for reference:

- `planet-flare-obsidian-ember.svg`
- `ai-sphere-obsidian-ember-fold-with-flare-single-palette-deeper-blue.svg`

## Review Files

1. `planet-flare-obsidian-ember.svg`
   Archived earlier planet-based direction retained for reference only.
   Preview export: `planet-flare-obsidian-ember.png`

2. `ai-sphere-obsidian-ember-fold-with-flare.svg`
   Canonical folded-sphere brand artwork with the flare orbit.
   Preview export: `ai-sphere-obsidian-ember-fold-with-flare.png`

3. `ai-sphere-obsidian-ember-fold-with-flare-single-palette-deeper-blue.svg`
   Archived cooler reduced-palette variant retained for reference only.
   Preview export: `ai-sphere-obsidian-ember-fold-with-flare-single-palette-deeper-blue.png`

4. `generate-planet-flare-theme-directions.mjs`
   Script that regenerates the retained `planet-flare-obsidian-ember.svg` board from code.

5. `render-pngs.mjs`
   Utility script that exports PNG previews from the SVG sources.

## PNG Export

The checked-in PNG previews are generated from the retained SVG sources with:

```bash
node docs/design-mockups/generate-planet-flare-theme-directions.mjs
node docs/design-mockups/render-pngs.mjs \
  docs/design-mockups/ai-sphere-obsidian-ember-fold-with-flare.svg \
  docs/design-mockups/planet-flare-obsidian-ember.svg \
  docs/design-mockups/ai-sphere-obsidian-ember-fold-with-flare-single-palette-deeper-blue.svg
```

This keeps the raster previews in sync with the editable SVG artwork.

## Notes

- These are mock-ups only.
- The canonical standalone brand artwork is `ai-sphere-obsidian-ember-fold-with-flare.svg`.
- The composite README banner lives at `packages/nextjs/public/banner.svg`.
- The other retained SVGs are archive references, not the primary brand asset.
