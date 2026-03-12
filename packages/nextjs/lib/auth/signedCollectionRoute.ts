import { type NextRequest, NextResponse } from "next/server";
import {
  ensureSignedActionChallengeTable,
  mapSignedActionError,
  verifyAndConsumeSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import {
  type SignedReadSessionScope,
  getSignedReadSessionCookie,
  issueSignedReadSession,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import {
  type SignedWriteSessionScope,
  getSignedWriteSessionCookie,
  issueSignedWriteSession,
  verifySignedWriteSession,
} from "~~/lib/auth/signedWriteSessions";
import { db } from "~~/lib/db";

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

export async function verifySignedCollectionChallenge(params: {
  challengeId: string;
  action: string;
  walletAddress: `0x${string}`;
  payloadHash: string;
  signature: `0x${string}`;
  buildMessage: (args: { nonce: string; expiresAt: Date }) => string;
}) {
  await ensureSignedActionChallengeTable();

  try {
    await db.transaction(async tx => {
      await verifyAndConsumeSignedActionChallenge(tx, {
        challengeId: params.challengeId,
        action: params.action,
        walletAddress: params.walletAddress,
        payloadHash: params.payloadHash,
        signature: params.signature,
        buildMessage: ({ nonce, expiresAt }) =>
          params.buildMessage({
            nonce,
            expiresAt,
          }),
      });
    });
  } catch (error: unknown) {
    const mapped = mapSignedActionError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    throw error;
  }

  return null;
}

export async function createSignedCollectionReadResponse<TBody>(
  walletAddress: `0x${string}`,
  scope: SignedReadSessionScope,
  body: TBody,
) {
  const session = await issueSignedReadSession(walletAddress, scope);
  const response = NextResponse.json(body);
  response.cookies.set(getSignedReadSessionCookie(scope, session));
  return response;
}

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
