import { NextRequest, NextResponse } from "next/server";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import {
  createPendingImageAttachment,
  getAttachmentImageUrl,
  processCompletedImageUpload,
} from "~~/lib/attachments/imageAttachments";
import {
  UPLOAD_IMAGE_ACTION,
  buildImageUploadChallengeMessage,
  hashImageUploadChallengePayload,
  normalizeImageUploadChallengeInput,
} from "~~/lib/auth/imageUploadChallenge";
import { getMaxImageUploadSizeBytes, isSupportedImageUploadMimeType } from "~~/lib/auth/imageUploadChallenge.shared";
import { verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import { MCP_SCOPES, authenticateMcpRequest } from "~~/lib/mcp/auth";
import { checkRateLimit } from "~~/utils/rateLimit";

type UploadClientPayload = Record<string, unknown> & {
  challengeId?: string;
  clientRequestId?: string;
  signature?: `0x${string}`;
};

type TokenPayload = {
  agentId?: string | null;
  attachmentId: string;
  clientRequestId?: string | null;
  ownerWalletAddress?: `0x${string}` | string | null;
};

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const TOKEN_TTL_MS = 10 * 60 * 1000;
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseClientPayload(value: string | null): UploadClientPayload {
  if (!value) {
    throw new Error("Upload metadata is required.");
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Upload metadata must be an object.");
    }
    return parsed as UploadClientPayload;
  } catch (error) {
    if (error instanceof Error && error.message !== "Unexpected end of JSON input") {
      throw error;
    }
    throw new Error("Upload metadata must be valid JSON.");
  }
}

function parseTokenPayload(value: string | null | undefined): TokenPayload {
  if (!value) {
    throw new Error("Upload token payload is missing.");
  }
  const parsed = JSON.parse(value) as TokenPayload;
  if (!parsed.attachmentId) {
    throw new Error("Upload token payload is invalid.");
  }
  return parsed;
}

function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.trim() ? request.headers.get("authorization") : null;
}

async function authorizeUploadRequest(request: NextRequest, payload: UploadClientPayload) {
  const normalized = normalizeImageUploadChallengeInput(payload);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }

  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    const agent = await authenticateMcpRequest(request, MCP_SCOPES.ask);
    if (agent.walletAddress && agent.walletAddress.toLowerCase() !== normalized.payload.normalizedAddress) {
      throw new Error("Upload wallet does not match the authenticated agent wallet.");
    }

    return {
      identity: {
        kind: "agent" as const,
        agentId: agent.id,
        ownerWalletAddress: agent.walletAddress?.toLowerCase() ?? normalized.payload.normalizedAddress,
      },
      normalized,
    };
  }

  if (!payload.challengeId || !payload.signature) {
    throw new Error("Signed upload challenge is required.");
  }

  const payloadHash = hashImageUploadChallengePayload(normalized.payload);
  const challengeFailure = await verifySignedActionChallenge({
    challengeId: payload.challengeId,
    action: UPLOAD_IMAGE_ACTION,
    walletAddress: normalized.payload.normalizedAddress,
    payloadHash,
    signature: payload.signature,
    buildMessage: ({ nonce, expiresAt }) =>
      buildImageUploadChallengeMessage({
        payload: normalized.payload,
        payloadHash,
        nonce,
        expiresAt,
      }),
  });
  if (challengeFailure) {
    throw new Error("Invalid signed upload challenge.");
  }

  return {
    identity: {
      kind: "wallet" as const,
      ownerWalletAddress: normalized.payload.normalizedAddress,
    },
    normalized,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const limited = await checkRateLimit(request, RATE_LIMIT, {
          extraKeyParts: [
            typeof payload.address === "string" ? payload.address : undefined,
            typeof payload.attachmentId === "string" ? payload.attachmentId : undefined,
          ],
        });
        if (limited) {
          throw new Error("Upload rate limit exceeded.");
        }

        const authorization = await authorizeUploadRequest(request, payload);
        await createPendingImageAttachment({
          attachmentId: authorization.normalized.payload.attachmentId,
          clientRequestId: typeof payload.clientRequestId === "string" ? payload.clientRequestId : null,
          filename: authorization.normalized.payload.filename,
          mimeType: authorization.normalized.payload.mimeType,
          sha256: authorization.normalized.payload.sha256,
          sizeBytes: authorization.normalized.payload.sizeBytes,
          uploader: authorization.identity,
        });

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: getMaxImageUploadSizeBytes(),
          validUntil: Date.now() + TOKEN_TTL_MS,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            agentId: authorization.identity.kind === "agent" ? authorization.identity.agentId : null,
            attachmentId: authorization.normalized.payload.attachmentId,
            clientRequestId: typeof payload.clientRequestId === "string" ? payload.clientRequestId : null,
            ownerWalletAddress: authorization.identity.ownerWalletAddress,
          } satisfies TokenPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseTokenPayload(tokenPayload);
        if (!isSupportedImageUploadMimeType(blob.contentType)) {
          throw new Error("Unsupported uploaded image type.");
        }

        await processCompletedImageUpload({
          attachmentId: payload.attachmentId,
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          contentType: blob.contentType,
        });
      },
    });

    const parsedPayload = "clientPayload" in body.payload ? parseClientPayload(body.payload.clientPayload) : null;
    return NextResponse.json({
      ...jsonResponse,
      attachmentId: parsedPayload?.attachmentId,
      imageUrl:
        typeof parsedPayload?.attachmentId === "string"
          ? getAttachmentImageUrl(request.url, parsedPayload.attachmentId)
          : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
