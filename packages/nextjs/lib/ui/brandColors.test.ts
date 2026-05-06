import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ACTION_ORANGE = "#cc490f";
const ACTION_ORANGE_HOVER = "#c2410c";
const SECONDARY_ORANGE = "#a83a0f";
const ACTION_CONTENT = "#ffffff";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "styles", "globals.css"), "utf8");

function readCssVar(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedName}\\s*:\\s*([^;]+);`, "i"));

  assert.ok(match, `${name} is declared in globals.css`);

  return match[1].trim().toLowerCase();
}

test("primary action orange stays aligned with the accessible orange", () => {
  assert.equal(readCssVar("--color-primary"), ACTION_ORANGE);
  assert.equal(readCssVar("--color-primary-content"), ACTION_CONTENT);
  assert.equal(readCssVar("--color-success"), ACTION_ORANGE);
  assert.equal(readCssVar("--color-success-content"), ACTION_CONTENT);
  assert.equal(readCssVar("--curyo-ember"), ACTION_ORANGE);
  assert.equal(readCssVar("--curyo-action-orange"), ACTION_ORANGE);
  assert.equal(readCssVar("--curyo-action-orange-hover"), ACTION_ORANGE_HOVER);
  assert.equal(readCssVar("--curyo-action-content"), ACTION_CONTENT);
  assert.equal(readCssVar("--curyo-ember-rgb"), "204 73 15");
});

test("secondary orange remains available for down-state accents", () => {
  assert.equal(readCssVar("--color-accent"), SECONDARY_ORANGE);
  assert.equal(readCssVar("--color-accent-content"), ACTION_CONTENT);
  assert.equal(readCssVar("--color-error"), SECONDARY_ORANGE);
  assert.equal(readCssVar("--color-error-content"), ACTION_CONTENT);
  assert.equal(readCssVar("--curyo-ember-deep"), SECONDARY_ORANGE);
  assert.equal(readCssVar("--curyo-ember-deep-rgb"), "168 58 15");
});
