import assert from "node:assert/strict";
import test from "node:test";
import { getAttachmentImageUrl, parseAttachmentIdFromImageUrl } from "~~/lib/attachments/imageAttachments";

test("builds direct HTTPS Curyo image URLs with a webp extension", () => {
  assert.equal(
    getAttachmentImageUrl("https://www.curyo.xyz/ask", "att_abcdefghijklmnop"),
    "https://www.curyo.xyz/api/attachments/images/att_abcdefghijklmnop.webp",
  );
});

test("parses Curyo attachment ids from public image URLs", () => {
  assert.equal(
    parseAttachmentIdFromImageUrl("https://www.curyo.xyz/api/attachments/images/att_abcdefghijklmnop.webp"),
    "att_abcdefghijklmnop",
  );
  assert.equal(parseAttachmentIdFromImageUrl("https://www.curyo.xyz/api/attachments/images/nope.png"), null);
});
