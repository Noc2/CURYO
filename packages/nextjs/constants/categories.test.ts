import { getSeededCategorySubcategories, parseTags, serializeTags } from "./categories";
import assert from "node:assert/strict";
import test from "node:test";

test("software category has seeded subcategory fallback tags", () => {
  assert.deepEqual(getSeededCategorySubcategories("software"), [
    "Web Apps",
    "Mobile Apps",
    "Developer Tools",
    "Repos",
    "Libraries",
    "APIs",
    "Smart Contracts",
    "Productivity",
    "Onboarding",
    "Performance",
    "Trust",
    "Pricing",
  ]);
});

test("unknown categories do not receive seeded fallback tags", () => {
  assert.deepEqual(getSeededCategorySubcategories("custom-category"), []);
});

test("tag serialization helpers keep existing behavior", () => {
  assert.deepEqual(parseTags("alpha, beta,, gamma "), ["alpha", "beta", "gamma"]);
  assert.equal(serializeTags(["alpha", "beta", "gamma"]), "alpha,beta,gamma");
});
