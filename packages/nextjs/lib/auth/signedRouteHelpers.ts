import { NextResponse } from "next/server";
import {
  ensureSignedActionChallengeTable,
  mapSignedActionError,
  verifyAndConsumeSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import { type SignedReadSessionScope, setAllSignedReadSessionCookies } from "~~/lib/auth/signedReadSessions";
import { db } from "~~/lib/db";

export async function verifySignedActionChallenge(params: {
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

export async function createSignedReadResponse<TBody>(
  walletAddress: `0x${string}`,
  scope: SignedReadSessionScope,
  body: TBody,
) {
  void scope;
  const response = NextResponse.json(body);
  return setAllSignedReadSessionCookies(response, walletAddress);
}
