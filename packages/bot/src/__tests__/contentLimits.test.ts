import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_DESCRIPTION_LENGTH,
  MAX_CONTENT_TITLE_LENGTH,
  truncateContentDescription,
  truncateContentTitle,
} from "../contentLimits.js";

describe("content limits", () => {
  it("leaves short titles unchanged", () => {
    expect(truncateContentTitle("Short title")).toBe("Short title");
  });

  it("truncates long titles to the contract-safe length with an ellipsis", () => {
    const longTitle = "A".repeat(MAX_CONTENT_TITLE_LENGTH + 20);
    const truncated = truncateContentTitle(longTitle);

    expect(truncated).toHaveLength(MAX_CONTENT_TITLE_LENGTH);
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("truncates long descriptions to the contract-safe length", () => {
    const longDescription = "B".repeat(MAX_CONTENT_DESCRIPTION_LENGTH + 50);
    const truncated = truncateContentDescription(longDescription);

    expect(truncated).toHaveLength(MAX_CONTENT_DESCRIPTION_LENGTH);
    expect(truncated).toBe(longDescription.slice(0, MAX_CONTENT_DESCRIPTION_LENGTH));
  });
});
