import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["critical", "serious"]);
const NON_BLOCKING_RULE_IDS = new Set(["color-contrast"]);

type AccessibilityViolation = {
  help: string;
  helpUrl: string;
  id: string;
  impact: string | null | undefined;
  targets: string[];
};

export async function expectNoBlockingAccessibilityViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blockingViolations: AccessibilityViolation[] = results.violations
    .filter(violation => violation.impact && BLOCKING_IMPACTS.has(violation.impact))
    // Keep the first CI gate focused on structural regressions while existing contrast debt is tracked separately.
    .filter(violation => !NON_BLOCKING_RULE_IDS.has(violation.id))
    .map(violation => ({
      help: violation.help,
      helpUrl: violation.helpUrl,
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap(node =>
        node.target.map(target => (Array.isArray(target) ? target.join(" ") : String(target))),
      ),
    }));

  expect(
    blockingViolations,
    `${label} should have no serious or critical non-contrast axe accessibility violations`,
  ).toEqual([]);
}
