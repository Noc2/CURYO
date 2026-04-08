import assert from "node:assert/strict";
import test from "node:test";
import { computePopoverPlacement } from "~~/lib/ui/popoverPosition";

const triggerRect = {
  top: 100,
  left: 120,
  right: 216,
  bottom: 140,
  width: 96,
  height: 40,
};

test("computePopoverPlacement keeps the popover below the trigger when it fits", () => {
  const placement = computePopoverPlacement({
    triggerRect,
    popoverSize: { width: 288, height: 240 },
    viewportWidth: 1280,
    viewportHeight: 800,
  });

  assert.equal(placement.position, "bottom");
  assert.equal(placement.left, 120);
  assert.equal(placement.top, 148);
});

test("computePopoverPlacement clamps wide popovers inside the viewport", () => {
  const placement = computePopoverPlacement({
    triggerRect: {
      ...triggerRect,
      left: 980,
      right: 1076,
    },
    popoverSize: { width: 288, height: 240 },
    viewportWidth: 1100,
    viewportHeight: 800,
  });

  assert.equal(placement.left, 804);
  assert.equal(placement.position, "bottom");
});

test("computePopoverPlacement flips above the trigger when there is no room below", () => {
  const placement = computePopoverPlacement({
    triggerRect: {
      ...triggerRect,
      top: 720,
      bottom: 760,
    },
    popoverSize: { width: 288, height: 140 },
    viewportWidth: 1280,
    viewportHeight: 800,
  });

  assert.equal(placement.position, "top");
  assert.equal(placement.top, 572);
  assert.equal(placement.maxHeight, 704);
});
