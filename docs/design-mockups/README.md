# Design Mock-ups

These are standalone review artifacts for the current brand direction.

## Review Files

1. `planet-flare-obsidian-ember.svg`
   High-contrast palette board for the settled Obsidian Ember website direction.
   Preview export: `planet-flare-obsidian-ember.png`

2. `ai-sphere-obsidian-ember-fold-with-flare.svg`
   Refined orb direction that replaces the earlier planet body with the folded sphere treatment while keeping the flare orbit.
   Preview export: `ai-sphere-obsidian-ember-fold-with-flare.png`

3. `ai-sphere-obsidian-ember-fold-with-flare-single-palette-deeper-blue.svg`
   Reduced-palette orb variant used to test a cooler, more restrained sphere treatment against the same flare language.
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
  docs/design-mockups/planet-flare-obsidian-ember.svg \
  docs/design-mockups/ai-sphere-obsidian-ember-fold-with-flare.svg \
  docs/design-mockups/ai-sphere-obsidian-ember-fold-with-flare-single-palette-deeper-blue.svg
```

This keeps the raster previews in sync with the editable SVG artwork.

## Notes

- These are mock-ups only.
- The live app now uses the Obsidian Ember website direction.
- The two AI-sphere SVGs are curated source files, not code-generated boards.
