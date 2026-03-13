import assert from "node:assert/strict";
import test from "node:test";
import { computeTooltipPlacement } from "~~/lib/ui/tooltipPosition";

const triggerRect = {
  top: 100,
  left: 120,
  right: 140,
  bottom: 120,
  width: 20,
  height: 20,
};

test("computeTooltipPlacement prefers the requested side when it fits", () => {
  const placement = computeTooltipPlacement({
    triggerRect,
    tooltipSize: { width: 180, height: 60 },
    preferredPosition: "bottom",
    viewportWidth: 400,
    viewportHeight: 400,
  });

  assert.equal(placement.position, "bottom");
  assert.equal(placement.top, 130);
});

test("computeTooltipPlacement falls back when the preferred side would overflow", () => {
  const placement = computeTooltipPlacement({
    triggerRect: {
      ...triggerRect,
      top: 360,
      bottom: 380,
    },
    tooltipSize: { width: 180, height: 60 },
    preferredPosition: "bottom",
    viewportWidth: 400,
    viewportHeight: 400,
  });

  assert.equal(placement.position, "top");
  assert.equal(placement.top, 290);
});

test("computeTooltipPlacement clamps horizontal position inside the viewport", () => {
  const placement = computeTooltipPlacement({
    triggerRect: {
      ...triggerRect,
      left: 4,
      right: 24,
    },
    tooltipSize: { width: 180, height: 60 },
    preferredPosition: "bottom",
    viewportWidth: 220,
    viewportHeight: 400,
  });

  assert.equal(placement.left, 8);
  assert.ok(placement.arrowLeft >= 12);
});
