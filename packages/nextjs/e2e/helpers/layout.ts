import { expect, type Page } from "@playwright/test";

type OverflowDetails = {
  bodyClientWidth: number;
  bodyScrollWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  offenders: Array<{
    className: string;
    id: string;
    rectLeft: number;
    rectRight: number;
    tagName: string;
    text: string;
  }>;
};

export async function expectNoNextErrorOverlay(page: Page): Promise<void> {
  const nextErrorOverlay = page.locator("nextjs-portal");
  const appErrorHeading = page.getByRole("heading", { name: /Application error/i });

  await expect(nextErrorOverlay, "Next.js error overlay should not be visible").toBeHidden({ timeout: 1_000 });
  await expect(appErrorHeading, "Application error page should not be visible").toBeHidden({ timeout: 1_000 });
}

export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate<OverflowDetails>(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const viewportWidth = documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { element, rect };
      })
      .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1))
      .slice(0, 8)
      .map(({ element, rect }) => ({
        className: typeof element.className === "string" ? element.className : "",
        id: element.id,
        rectLeft: Math.round(rect.left),
        rectRight: Math.round(rect.right),
        tagName: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      }));

    return {
      bodyClientWidth: body?.clientWidth ?? 0,
      bodyScrollWidth: body?.scrollWidth ?? 0,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      offenders,
    };
  });

  const maxScrollWidth = Math.max(overflow.documentScrollWidth, overflow.bodyScrollWidth);
  const minClientWidth = Math.max(overflow.documentClientWidth, overflow.bodyClientWidth);

  expect(
    maxScrollWidth <= minClientWidth + 1,
    `${label} should not overflow horizontally.\n${JSON.stringify(overflow, null, 2)}`,
  ).toBe(true);
}

