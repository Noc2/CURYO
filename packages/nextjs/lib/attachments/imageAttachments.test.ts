import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  getAttachmentImageUrl,
  getImageAttachmentSubmissionValidationError,
  parseAttachmentIdFromImageUrl,
} from "~~/lib/attachments/imageAttachments";
import { __setDatabaseResourcesForTests, db } from "~~/lib/db";
import { questionImageAttachments } from "~~/lib/db/schema";
import { createMemoryDatabaseResources } from "~~/lib/db/testMemory";

beforeEach(() => {
  __setDatabaseResourcesForTests(createMemoryDatabaseResources());
});

afterEach(() => {
  __setDatabaseResourcesForTests(null);
});

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

test("validates approved Curyo-hosted image ownership before submission", async () => {
  const now = new Date();
  await db.insert(questionImageAttachments).values({
    id: "att_abcdefghijklmnop",
    uploaderKind: "wallet",
    ownerWalletAddress: "0x00000000000000000000000000000000000000aa",
    originalFilename: "mockup.png",
    mimeType: "image/webp",
    sizeBytes: 1024,
    status: "approved",
    moderationStatus: "approved",
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(
    await getImageAttachmentSubmissionValidationError({
      imageUrls: ["https://www.curyo.xyz/api/attachments/images/att_abcdefghijklmnop.webp"],
      ownerWalletAddress: "0x00000000000000000000000000000000000000AA",
    }),
    null,
  );
  assert.equal(
    await getImageAttachmentSubmissionValidationError({
      imageUrls: ["https://www.curyo.xyz/api/attachments/images/att_abcdefghijklmnop.webp"],
      ownerWalletAddress: "0x00000000000000000000000000000000000000bb",
    }),
    "imageUrls Curyo-hosted uploads must belong to the submitting wallet or agent.",
  );
});

test("allows approved Curyo-hosted images owned by the submitting agent", async () => {
  const now = new Date();
  await db.insert(questionImageAttachments).values({
    id: "att_agentownedupload",
    agentId: "agent-123",
    uploaderKind: "agent",
    ownerWalletAddress: null,
    originalFilename: "mockup.png",
    mimeType: "image/webp",
    sizeBytes: 1024,
    status: "approved",
    moderationStatus: "approved",
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(
    await getImageAttachmentSubmissionValidationError({
      agentId: "agent-123",
      imageUrls: ["https://www.curyo.xyz/api/attachments/images/att_agentownedupload.webp"],
    }),
    null,
  );
  assert.equal(
    await getImageAttachmentSubmissionValidationError({
      agentId: "agent-456",
      imageUrls: ["https://www.curyo.xyz/api/attachments/images/att_agentownedupload.webp"],
    }),
    "imageUrls Curyo-hosted uploads must belong to the submitting wallet or agent.",
  );
});
