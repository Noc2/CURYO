import React from "react";
import { RatingOrb } from "./RatingOrb";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

test("RatingOrb uses a white score over the separated orange center", () => {
  const html = renderToStaticMarkup(<RatingOrb rating={0} size={96} />).replace(/\s+/g, " ");

  assert.match(html, /--curyo-action-content/);
  assert.doesNotMatch(html, /text-black/);
  assert.doesNotMatch(html, /text-base-content/);
  assert.doesNotMatch(html, /text-primary/);
  assert.match(html, /stop-color="var\(--curyo-ember\)"/);
});

test("RatingOrb omits a fallback outer track when no progress is visible", () => {
  const html = renderToStaticMarkup(<RatingOrb rating={0} size={96} />).replace(/\s+/g, " ");

  assert.doesNotMatch(html, /stroke="#ffffff"/);
  assert.doesNotMatch(html, /rgba\(245,240,235,0\.06\)/);
  assert.doesNotMatch(html, /rgba\(179,52,27,0\.2\)/);
});
