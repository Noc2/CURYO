import assert from "node:assert/strict";
import test from "node:test";
import config from "./playwright.config";

function getProjectTestMatch(name: string): RegExp {
  const project = (config.projects ?? []).find(candidate => candidate.name === name);

  assert.ok(project, `Expected Playwright project "${name}" to exist`);
  assert.ok(project.testMatch instanceof RegExp, `Expected Playwright project "${name}" to use a RegExp testMatch`);

  return project.testMatch;
}

test("browser-scoped Playwright projects only match their intended spec files", () => {
  const scenarios = [
    {
      project: "compat-firefox",
      workspaceSegment: "pr74-browser-compat",
      matchingSpec: "browser-compat.spec.ts",
      nonMatchingSpec: "vote.spec.ts",
    },
    {
      project: "responsive-layout",
      workspaceSegment: "responsive-layout-laptop-check",
      matchingSpec: "responsive-layout.spec.ts",
      nonMatchingSpec: "browser-compat.spec.ts",
    },
    {
      project: "accessibility-axe",
      workspaceSegment: "accessibility-axe-audit",
      matchingSpec: "accessibility-axe.spec.ts",
      nonMatchingSpec: "settings.spec.ts",
    },
    {
      project: "mobile-phone",
      workspaceSegment: "mobile-preview",
      matchingSpec: "mobile.spec.ts",
      nonMatchingSpec: "browser-compat.spec.ts",
    },
  ];

  for (const { project, workspaceSegment, matchingSpec, nonMatchingSpec } of scenarios) {
    const testMatch = getProjectTestMatch(project);
    const matchingPath = `/tmp/${workspaceSegment}/packages/nextjs/e2e/tests/${matchingSpec}`;
    const nonMatchingPath = `/tmp/${workspaceSegment}/packages/nextjs/e2e/tests/${nonMatchingSpec}`;

    assert.equal(testMatch.test(matchingPath), true, `${project} should match ${matchingSpec}`);
    assert.equal(
      testMatch.test(nonMatchingPath),
      false,
      `${project} should ignore ${nonMatchingSpec} even when the workspace path includes "${workspaceSegment}"`,
    );
  }
});
