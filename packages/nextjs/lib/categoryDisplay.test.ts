import { getCategoryDisplayName } from "./categoryDisplay";
import assert from "node:assert/strict";
import test from "node:test";

test("getCategoryDisplayName presents the legacy Wikipedia People category as Wiki", () => {
  assert.equal(
    getCategoryDisplayName({
      id: 5n,
      name: "People",
      domain: "https://www.en.wikipedia.org/wiki/Tesla,_Inc.",
    }),
    "Wiki",
  );
  assert.equal(getCategoryDisplayName({ categoryId: "5", categoryName: "People" }), "Wiki");
});

test("getCategoryDisplayName leaves normal category names unchanged", () => {
  assert.equal(getCategoryDisplayName({ id: 1n, name: "YouTube", domain: "youtube.com" }), "YouTube");
  assert.equal(getCategoryDisplayName({ categoryId: "5", categoryName: "People", domain: "example.com" }), "People");
});
