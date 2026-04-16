# Design Mock-ups

These are standalone review artifacts for the current brand direction.

Current canonical brand artwork:

- `ai-sphere-obsidian-ember-fold-with-flare.svg`

Current vote-feed exploration boards:

- `vote-feed-infinite-scroll-directions.svg`
- `vote-feed-infinite-scroll-recommended.svg`

## Review Files

1. `ai-sphere-obsidian-ember-fold-with-flare.svg`
   Canonical folded-sphere brand artwork with the flare orbit.
   Preview export: `ai-sphere-obsidian-ember-fold-with-flare.png`

2. `render-pngs.mjs`
   Utility script that exports PNG previews from the SVG sources.

3. `vote-feed-infinite-scroll-directions.svg`
   Comparison board for three infinite-scroll voting interaction models.
   Preview export: `vote-feed-infinite-scroll-directions.png`

4. `vote-feed-infinite-scroll-recommended.svg`
   Focused mock-up for the preferred infinite feed with persistent voting.
   Preview export: `vote-feed-infinite-scroll-recommended.png`

## PNG Export

The checked-in PNG previews are generated from the retained SVG sources with:

```bash
node design-mockups/render-pngs.mjs \
  design-mockups/ai-sphere-obsidian-ember-fold-with-flare.svg \
  design-mockups/vote-feed-infinite-scroll-directions.svg \
  design-mockups/vote-feed-infinite-scroll-recommended.svg
```

This keeps the raster previews in sync with the editable SVG artwork.

## Notes

- These are mock-ups only.
- The canonical standalone brand artwork is `ai-sphere-obsidian-ember-fold-with-flare.svg`.
- The composite README banner lives at `packages/nextjs/public/banner.svg`.
