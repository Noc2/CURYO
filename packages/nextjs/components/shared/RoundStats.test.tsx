import React from "react";
import { RoundRevealedBreakdown } from "./RoundStats";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

test("RoundRevealedBreakdown renders Up before Down to match the vote button order", () => {
  const html = renderToStaticMarkup(
    <RoundRevealedBreakdown
      snapshot={
        {
          isLoading: false,
          round: {
            revealedCount: 1,
            upPool: 0n,
            downPool: 5_000_000n,
            upCount: 0n,
            downCount: 1n,
          },
        } as any
      }
    />,
  ).replace(/\s+/g, " ");

  assert.match(html, /Up<\/span>\s*<span[^>]*>0 cREP<\/span>\s*<span[^>]*>0 votes<\/span>/);
  assert.match(html, /Down<\/span>\s*<span[^>]*>5 cREP<\/span>\s*<span[^>]*>1 vote<\/span>/);
  assert.ok(html.indexOf(">Up<") < html.indexOf(">Down<"));
});
