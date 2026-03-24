import { type Browser, type BrowserContext } from "@playwright/test";
import { E2E_BASE_URL } from "./service-urls";

export function newE2EContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: E2E_BASE_URL });
}
