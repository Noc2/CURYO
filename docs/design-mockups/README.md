# Design Mock-ups

These are standalone review artifacts rather than production UI.

## Review Files

1. `planet-flare-logo-single.svg`
   Current standalone planet-plus-flare logo source used as the base geometry for the newer explorations.
   Preview export: `planet-flare-logo-single.png`

2. `planet-flare-theme-directions.svg`
   Four site-wide color themes mapped back into the current logo and a compact UI mock-up so palette choices can be reviewed in context.
   Preview export: `planet-flare-theme-directions.png`

3. `planet-flare-alt-theme-directions.svg`
   More adventurous color systems that also recolor the flare, useful for testing whether a broader brand refresh still feels like Curyo.
   Preview export: `planet-flare-alt-theme-directions.png`

4. `planet-flare-3d-gradient-tests.svg`
   Focused planet-lighting and gradient study showing how far the mark can move toward a more dimensional 3D read.
   Preview export: `planet-flare-3d-gradient-tests.png`

5. `planet-flare-obsidian-ember.svg`
   Dedicated high-contrast concept inspired by the orange / graphite / white reference palette, with a darker Mars-like planet and brighter flare highlight.
   Preview export: `planet-flare-obsidian-ember.png`

6. `planet-flare-landing.svg`
   Landing page mock-up using the current Curyo hero and "How it Works" structure.
   Preview export: `planet-flare-landing.png`

7. `planet-flare-logo-obsidian-ember-abstract-variants.svg`
   Four warmer orange/red logo studies that flatten or abstract the ember core while keeping the flare language.
   Preview export: `planet-flare-logo-obsidian-ember-abstract-variants.png`

8. `planet-flare-logo-obsidian-ember-gradient-core.svg`, `planet-flare-logo-obsidian-ember-abstract-eclipse.svg`, `planet-flare-logo-obsidian-ember-abstract-lens.svg`, `planet-flare-logo-obsidian-ember-abstract-signal.svg`
   Individual exports from the abstract ember round.
   Preview exports: matching `.png` files for each concept.

9. `planet-flare-logo-exploration.svg`
   Earlier logo exploration board for the planet-plus-flare direction.
   Preview export: `planet-flare-logo-exploration.png`

10. `generate-planet-flare-theme-directions.mjs`
   Script that regenerates the theme-direction, alternative theme, contrast-study, and 3D-gradient SVG boards from code.

11. `generate-planet-flare-obsidian-ember-abstract-variants.mjs`
   Script that regenerates the abstract ember logo round and the comparison board.

12. `logo-rollout-plan.md`
   Rollout plan for replacing the shared brand assets.

## PNG Export

The PNG previews are generated from the SVG sources with:

```bash
node docs/design-mockups/generate-planet-flare-theme-directions.mjs
node docs/design-mockups/generate-planet-flare-obsidian-ember-abstract-variants.mjs
node docs/design-mockups/render-pngs.mjs docs/design-mockups/planet-flare-theme-directions.svg docs/design-mockups/planet-flare-alt-theme-directions.svg docs/design-mockups/planet-flare-3d-gradient-tests.svg docs/design-mockups/planet-flare-obsidian-ember.svg
node docs/design-mockups/render-pngs.mjs docs/design-mockups/planet-flare-logo-obsidian-ember-gradient-core.svg docs/design-mockups/planet-flare-logo-obsidian-ember-abstract-eclipse.svg docs/design-mockups/planet-flare-logo-obsidian-ember-abstract-lens.svg docs/design-mockups/planet-flare-logo-obsidian-ember-abstract-signal.svg docs/design-mockups/planet-flare-logo-obsidian-ember-abstract-variants.svg
```

This keeps the raster previews in sync with the editable SVG artwork.

## Notes

- These are mock-ups only.
- The live app was reverted separately and is not using these designs.
