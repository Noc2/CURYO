import { type NextRequest, NextResponse } from "next/server";
import { type SignedReadSessionScope, verifySignedReadSession } from "~~/lib/auth/signedReadSessions";
import {
  type SignedWriteSessionScope,
  getSignedWriteSessionCookie,
  issueSignedWriteSession,
  verifySignedWriteSession,
} from "~~/lib/auth/signedWriteSessions";

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
