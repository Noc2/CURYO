import { buildCuryoEmailHtml } from "./emailTemplate";
import assert from "node:assert/strict";
import test from "node:test";

test("buildCuryoEmailHtml includes the branded header, button, and fallback link", () => {
  const html = buildCuryoEmailHtml({
    title: "Verify your email",
    body: "Confirm this email address to receive Curyo notification emails.",
    ctaLabel: "Verify email",
    ctaHref: "https://info.curyo.xyz/api/notifications/email/verify?token=test-token",
    eyebrow: "Email verification",
    footerLinkLabel: "Unsubscribe from these emails",
    footerLinkHref: "https://info.curyo.xyz/api/notifications/email/unsubscribe?token=unsubscribe-token",
  });

  assert.match(html, />\s*Curyo\s*</);
  assert.match(html, /Email verification/);
  assert.match(html, /Verify your email/);
  assert.match(html, /background:#d56a3e/);
  assert.match(html, />\s*Verify email\s*</);
  assert.match(html, /If the button does not work, open this link manually:/);
  assert.match(html, /Unsubscribe from these emails/);
  assert.match(html, /unsubscribe\?token=unsubscribe-token/);
});
