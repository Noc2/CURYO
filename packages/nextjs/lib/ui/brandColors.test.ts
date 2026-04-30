import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const MUG_ORANGE = "#f26426";
const SECONDARY_ORANGE = "#bf3f18";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "styles", "globals.css"), "utf8");

function readCssVar(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedName}\\s*:\\s*([^;]+);`, "i"));

  assert.ok(match, `${name} is declared in globals.css`);

  return match[1].trim().toLowerCase();
}

test("primary action orange stays aligned with the mug orange", () => {
  assert.equal(readCssVar("--color-primary"), MUG_ORANGE);
  assert.equal(readCssVar("--color-success"), MUG_ORANGE);
  assert.equal(readCssVar("--curyo-ember"), MUG_ORANGE);
  assert.equal(readCssVar("--curyo-action-orange"), MUG_ORANGE);
  assert.equal(readCssVar("--curyo-action-orange-hover"), MUG_ORANGE);
  assert.equal(readCssVar("--curyo-ember-rgb"), "242 100 38");
});

test("secondary orange remains reserved for error and down-state accents", () => {
  assert.equal(readCssVar("--color-error"), SECONDARY_ORANGE);
  assert.equal(readCssVar("--curyo-ember-deep"), SECONDARY_ORANGE);
  assert.equal(readCssVar("--curyo-ember-deep-rgb"), "191 63 24");
});
