import { type NextRequest, NextResponse } from "next/server";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { type SignedReadSessionScope, verifySignedReadSession } from "~~/lib/auth/signedReadSessions";
import { verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import {
  type SignedWriteSessionScope,
  getSignedWriteSessionCookie,
  issueSignedWriteSession,
  verifySignedWriteSession,
} from "~~/lib/auth/signedWriteSessions";

type AddressScopedPayload = {
  normalizedAddress: `0x${string}`;
};

type NormalizedInputResult<TPayload extends AddressScopedPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; error: string };

export async function hasSignedCollectionReadSession(
  request: NextRequest,
  cookieName: string,
  walletAddress: `0x${string}`,
  scope: SignedReadSessionScope,
) {
  return verifySignedReadSession(request.cookies.get(cookieName)?.value, walletAddress, scope);
}

export async function hasSignedCollectionWriteSession(
  request: NextRequest,
  cookieName: string,
  walletAddress: `0x${string}`,
  scope: SignedWriteSessionScope,
) {
  return verifySignedWriteSession(request.cookies.get(cookieName)?.value, walletAddress, scope);
}

export async function getSignedCollectionSessionStatus(
  request: NextRequest,
  params: {
    walletAddress: `0x${string}`;
    readCookieName: string;
    readScope: SignedReadSessionScope;
    writeCookieName: string;
    writeScope: SignedWriteSessionScope;
  },
) {
  const hasReadSession = await hasSignedCollectionReadSession(
    request,
    params.readCookieName,
    params.walletAddress,
    params.readScope,
  );
  const hasWriteSession = await hasSignedCollectionWriteSession(
    request,
    params.writeCookieName,
    params.walletAddress,
    params.writeScope,
  );

  return { hasReadSession, hasWriteSession };
}

export async function createSignedCollectionSessionResponse(
  request: NextRequest,
  params: {
    walletAddress: `0x${string}`;
    readCookieName: string;
    readScope: SignedReadSessionScope;
    writeCookieName: string;
    writeScope: SignedWriteSessionScope;
  },
) {
  const { hasReadSession, hasWriteSession } = await getSignedCollectionSessionStatus(request, params);
  return NextResponse.json({
    hasSession: hasReadSession,
    hasReadSession,
    hasWriteSession,
  });
}

export async function createSignedCollectionChallengeResponse<
  TBody extends Record<string, unknown>,
  TReadPayload extends AddressScopedPayload,
  TWritePayload extends AddressScopedPayload,
>(
  body: TBody,
  params: {
    title: string;
    readAction: string;
    getWriteAction: (body: TBody) => string;
    isReadRequest: (body: TBody) => boolean;
    normalizeReadInput: (body: TBody) => NormalizedInputResult<TReadPayload>;
    hashReadPayload: (payload: TReadPayload) => string;
    normalizeWriteInput: (body: TBody) => NormalizedInputResult<TWritePayload>;
    hashWritePayload: (payload: TWritePayload) => string;
  },
) {
  if (params.isReadRequest(body)) {
    const normalizedRead = params.normalizeReadInput(body);
    if (!normalizedRead.ok) {
      return NextResponse.json({ error: normalizedRead.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: params.title,
      action: params.readAction,
      walletAddress: normalizedRead.payload.normalizedAddress,
      payloadHash: params.hashReadPayload(normalizedRead.payload),
    });

    return NextResponse.json(challenge);
  }

  const normalizedWrite = params.normalizeWriteInput(body);
  if (!normalizedWrite.ok) {
    return NextResponse.json({ error: normalizedWrite.error }, { status: 400 });
  }

  const challenge = await issueSignedActionChallenge({
    title: params.title,
    action: params.getWriteAction(body),
    walletAddress: normalizedWrite.payload.normalizedAddress,
    payloadHash: params.hashWritePayload(normalizedWrite.payload),
  });

  return NextResponse.json(challenge);
}

export async function verifySignedCollectionWriteAccess(
  request: NextRequest,
  params: {
    cookieName: string;
    walletAddress: `0x${string}`;
    scope: SignedWriteSessionScope;
    signature?: `0x${string}`;
    challengeId?: string;
    action: string;
    payloadHash: string;
    buildMessage: (args: { nonce: string; expiresAt: Date }) => string;
  },
): Promise<{ ok: true; hasWriteSession: boolean } | { ok: false; response: NextResponse }> {
  const hasWriteSession = await hasSignedCollectionWriteSession(
    request,
    params.cookieName,
    params.walletAddress,
    params.scope,
  );
  if (hasWriteSession) {
    return { ok: true, hasWriteSession };
  }

  if (!params.signature || !params.challengeId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Signed write required" }, { status: 401 }),
    };
  }

  const challengeFailure = await verifySignedActionChallenge({
    challengeId: params.challengeId,
    action: params.action,
    walletAddress: params.walletAddress,
    payloadHash: params.payloadHash,
    signature: params.signature,
    buildMessage: params.buildMessage,
  });
  if (challengeFailure) {
    return { ok: false, response: challengeFailure };
  }

  return { ok: true, hasWriteSession };
}

export { verifySignedActionChallenge as verifySignedCollectionChallenge } from "~~/lib/auth/signedRouteHelpers";
export { createSignedReadResponse as createSignedCollectionReadResponse } from "~~/lib/auth/signedRouteHelpers";

export async function maybeIssueSignedCollectionWriteSession(
  response: NextResponse,
  params: {
    hasWriteSession: boolean;
    walletAddress: `0x${string}`;
    scope: SignedWriteSessionScope;
  },
) {
  if (!params.hasWriteSession) {
    const session = await issueSignedWriteSession(params.walletAddress, params.scope);
    response.cookies.set(getSignedWriteSessionCookie(params.scope, session));
  }

  return response;
}
