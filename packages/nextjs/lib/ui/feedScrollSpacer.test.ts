import { resolveEndSpacerHeightForLastCardSnap } from "./feedScrollSpacer";
import assert from "node:assert/strict";
import test from "node:test";

test("returns enough spacer for a shorter final card to snap to the top", () => {
  assert.equal(
    resolveEndSpacerHeightForLastCardSnap({
      scrollerHeight: 900,
      lastCardHeight: 620,
    }),
    280,
  );
});

test("subtracts already reserved mobile dock space and snap guard", () => {
  assert.equal(
    resolveEndSpacerHeightForLastCardSnap({
      scrollerHeight: 900,
      lastCardHeight: 620,
      reservedEndSpace: 152,
      topSnapGuard: 12,
    }),
    116,
  );
});

test("does not add spacer when the existing reserved area is enough", () => {
  assert.equal(
    resolveEndSpacerHeightForLastCardSnap({
      scrollerHeight: 900,
      lastCardHeight: 620,
      reservedEndSpace: 320,
      topSnapGuard: 12,
    }),
    0,
  );
});

test("does not add spacer when the final card is taller than the scroller", () => {
  assert.equal(
    resolveEndSpacerHeightForLastCardSnap({
      scrollerHeight: 620,
      lastCardHeight: 900,
      reservedEndSpace: 152,
      topSnapGuard: 12,
    }),
    0,
  );
});
