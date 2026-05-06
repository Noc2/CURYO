import { del, get, put } from "@vercel/blob";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import "server-only";
import sharp from "sharp";
import { db } from "~~/lib/db";
import { type QuestionImageAttachment, questionImageAttachments } from "~~/lib/db/schema";

const IMAGE_ATTACHMENT_ROUTE_PREFIX = "/api/attachments/images";
const IMAGE_ATTACHMENT_PUBLIC_EXTENSION = "webp";

type ImageAttachmentStatus = "uploading" | "processing" | "approved" | "blocked" | "failed" | "deleted";

type UploaderIdentity =
  | {
      kind: "wallet";
      ownerWalletAddress: `0x${string}`;
      agentId?: null;
    }
  | {
      kind: "agent";
      ownerWalletAddress: string | null;
      agentId: string;
    };

type CreatePendingImageAttachmentParams = {
  attachmentId: string;
  clientRequestId?: string | null;
  filename: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  uploader: UploaderIdentity;
};

type ModerationDecision = {
  provider: string;
  result: unknown;
  status: "approved" | "blocked" | "review_required";
};

const OPENAI_MODERATION_MODEL = "omni-moderation-latest";
const MAX_INPUT_PIXELS = 28_000_000;
const NORMALIZED_IMAGE_QUALITY = 88;
const BLOCKED_MODERATION_CATEGORIES = new Set([
  "sexual/minors",
  "sexual",
  "violence/graphic",
  "self-harm/instructions",
  "hate/threatening",
  "harassment/threatening",
  "illicit/violent",
]);

function nowDate() {
  return new Date();
}

function hasOpenAiModerationKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function isModerationExplicitlyDisabled() {
  return process.env.CURYO_IMAGE_MODERATION_MODE === "disabled";
}

function isDevModerationSkipAllowed() {
  return process.env.NODE_ENV !== "production" && !hasOpenAiModerationKey();
}

function assertSupportedImageSignature(buffer: Buffer, mimeType: string) {
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";

  if (mimeType === "image/png" && isPng) return;
  if (mimeType === "image/jpeg" && isJpeg) return;
  if (mimeType === "image/webp" && isWebp) return;

  throw new Error("Image signature does not match the declared content type.");
}

function getAttachmentImagePath(attachmentId: string) {
  return `${IMAGE_ATTACHMENT_ROUTE_PREFIX}/${attachmentId}.${IMAGE_ATTACHMENT_PUBLIC_EXTENSION}`;
}

export function getAttachmentImageUrl(requestUrl: string, attachmentId: string) {
  return new URL(getAttachmentImagePath(attachmentId), requestUrl).toString();
}

export function parseAttachmentIdFromImageUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/api\/attachments\/images\/(att_[A-Za-z0-9_-]{16,80})\.webp$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function validateImageAttachmentBlobPathname(attachmentId: string, blobPathname: string) {
  return blobPathname.startsWith(`question-attachments/${attachmentId}/`);
}

export async function getImageAttachment(id: string): Promise<QuestionImageAttachment | null> {
  const [attachment] = await db
    .select()
    .from(questionImageAttachments)
    .where(eq(questionImageAttachments.id, id))
    .limit(1);
  return attachment ?? null;
}

export async function createPendingImageAttachment(params: CreatePendingImageAttachmentParams) {
  const createdAt = nowDate();
  await db
    .insert(questionImageAttachments)
    .values({
      id: params.attachmentId,
      uploaderKind: params.uploader.kind,
      ownerWalletAddress: params.uploader.ownerWalletAddress,
      agentId: params.uploader.kind === "agent" ? params.uploader.agentId : null,
      clientRequestId: params.clientRequestId ?? null,
      originalFilename: params.filename,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      sha256: params.sha256,
      status: "uploading",
      moderationStatus: "pending",
      createdAt,
      updatedAt: createdAt,
    })
    .onConflictDoNothing();
}

async function readBlobBuffer(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Uploaded image blob was not found.");
  }

  return {
    blob: result.blob,
    buffer: Buffer.from(await new Response(result.stream).arrayBuffer()),
  };
}

async function moderateImage(buffer: Buffer): Promise<ModerationDecision> {
  if (isModerationExplicitlyDisabled()) {
    return { provider: "disabled", status: "approved", result: { skipped: true, reason: "explicitly_disabled" } };
  }

  if (isDevModerationSkipAllowed()) {
    return { provider: "dev-skip", status: "approved", result: { skipped: true, reason: "missing_dev_key" } };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { provider: "openai", status: "review_required", result: { error: "OPENAI_API_KEY is not configured" } };
  }

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODERATION_MODEL,
      input: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/webp;base64,${buffer.toString("base64")}`,
          },
        },
      ],
    }),
  });

  const result = (await response.json().catch(() => null)) as {
    results?: Array<{
      categories?: Record<string, boolean>;
      flagged?: boolean;
    }>;
  } | null;

  if (!response.ok) {
    return {
      provider: "openai",
      status: "review_required",
      result: result ?? { error: `OpenAI moderation failed with ${response.status}` },
    };
  }

  const categories = result?.results?.[0]?.categories ?? {};
  const flagged = Boolean(result?.results?.[0]?.flagged);
  const shouldBlock = Object.entries(categories).some(
    ([category, flagged]) => flagged && BLOCKED_MODERATION_CATEGORIES.has(category),
  );
  return {
    provider: "openai",
    status: flagged || shouldBlock ? "blocked" : "approved",
    result,
  };
}

export async function processCompletedImageUpload(params: {
  attachmentId: string;
  blobPathname: string;
  blobUrl: string;
  contentType: string;
}) {
  const processingAt = nowDate();
  await db
    .update(questionImageAttachments)
    .set({
      originalBlobPathname: params.blobPathname,
      originalBlobUrl: params.blobUrl,
      mimeType: params.contentType,
      status: "processing",
      updatedAt: processingAt,
    })
    .where(eq(questionImageAttachments.id, params.attachmentId));

  try {
    const { buffer } = await readBlobBuffer(params.blobPathname);
    assertSupportedImageSignature(buffer, params.contentType);

    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    const attachment = await getImageAttachment(params.attachmentId);
    if (attachment?.sha256 && attachment.sha256 !== actualSha256) {
      throw new Error("Image hash does not match the signed upload challenge.");
    }

    const normalized = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .webp({ quality: NORMALIZED_IMAGE_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const normalizedPathname = `question-attachments/${params.attachmentId}/image.webp`;
    const normalizedBlob = await put(normalizedPathname, normalized.data, {
      access: "private",
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
      contentType: "image/webp",
    });
    const moderation = await moderateImage(normalized.data);
    const status: ImageAttachmentStatus = moderation.status === "approved" ? "approved" : "blocked";
    const completedAt = nowDate();

    await db
      .update(questionImageAttachments)
      .set({
        normalizedBlobPathname: normalizedBlob.pathname,
        normalizedBlobUrl: normalizedBlob.url,
        mimeType: "image/webp",
        sizeBytes: normalized.data.length,
        width: normalized.info.width,
        height: normalized.info.height,
        sha256: actualSha256,
        status,
        moderationStatus: moderation.status,
        moderationProvider: moderation.provider,
        moderationResult: JSON.stringify(moderation.result),
        approvedAt: moderation.status === "approved" ? completedAt : null,
        error: moderation.status === "review_required" ? "Image requires moderation review before publication." : null,
        updatedAt: completedAt,
      })
      .where(eq(questionImageAttachments.id, params.attachmentId));

    await del(params.blobPathname).catch(() => undefined);
  } catch (error) {
    const failedAt = nowDate();
    await db
      .update(questionImageAttachments)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Image processing failed.",
        updatedAt: failedAt,
      })
      .where(eq(questionImageAttachments.id, params.attachmentId));
  }
}

export async function getImageAttachmentSubmissionValidationError(params: {
  agentId?: string | null;
  imageUrls: readonly string[];
  ownerWalletAddress?: string | null;
}): Promise<string | null> {
  const attachmentIds = [
    ...new Set(params.imageUrls.map(parseAttachmentIdFromImageUrl).filter((id): id is string => Boolean(id))),
  ];
  if (attachmentIds.length === 0) return null;

  const ownerWalletAddress = params.ownerWalletAddress?.trim().toLowerCase() || null;
  const agentId = params.agentId?.trim() || null;

  for (const attachmentId of attachmentIds) {
    const attachment = await getImageAttachment(attachmentId);
    if (!attachment || attachment.status !== "approved") {
      return "imageUrls must reference approved Curyo-hosted uploads.";
    }

    const ownedByAgent = agentId !== null && attachment.agentId === agentId;
    const ownedByWallet =
      ownerWalletAddress !== null && attachment.ownerWalletAddress?.trim().toLowerCase() === ownerWalletAddress;

    if (!ownedByAgent && !ownedByWallet) {
      return "imageUrls Curyo-hosted uploads must belong to the submitting wallet or agent.";
    }
  }

  return null;
}

export async function attachImagesToOperation(params: {
  imageUrls: readonly string[];
  operationKey: string;
  clientRequestId: string;
  ownerWalletAddress?: string | null;
  agentId?: string | null;
}) {
  const attachmentIds = params.imageUrls.map(parseAttachmentIdFromImageUrl).filter((id): id is string => Boolean(id));
  if (attachmentIds.length === 0) return;

  const updatedAt = nowDate();
  for (const attachmentId of attachmentIds) {
    await db
      .update(questionImageAttachments)
      .set({
        operationKey: params.operationKey,
        clientRequestId: params.clientRequestId,
        updatedAt,
      })
      .where(
        and(
          eq(questionImageAttachments.id, attachmentId),
          params.agentId
            ? eq(questionImageAttachments.agentId, params.agentId)
            : eq(questionImageAttachments.ownerWalletAddress, params.ownerWalletAddress ?? ""),
        ),
      );
  }
}
