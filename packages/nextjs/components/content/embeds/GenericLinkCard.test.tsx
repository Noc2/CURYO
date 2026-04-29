import React from "react";
import { GenericLinkCard } from "./GenericLinkCard";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

test("GenericLinkCard renders a visual context placeholder when no thumbnail is available", () => {
  const html = renderToStaticMarkup(<GenericLinkCard url="https://example.com/review/source" />).replace(/\s+/g, " ");

  assert.match(html, /Context/);
  assert.match(html, /example\.com/);
  assert.doesNotMatch(html, /<img/);
});

test("GenericLinkCard keeps available thumbnails as images", () => {
  const html = renderToStaticMarkup(
    <GenericLinkCard url="https://example.com/review/source" thumbnailUrl="https://example.com/review/source.png" />,
  ).replace(/\s+/g, " ");

  assert.match(html, /<img/);
  assert.match(html, /src="https:\/\/example\.com\/review\/source\.png"/);
  assert.match(html, /Open context/);
});
