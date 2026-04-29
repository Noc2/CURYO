import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { __setDatabaseResourcesForTests, dbClient } from "~~/lib/db";
import { createMemoryDatabaseResources } from "~~/lib/db/testMemory";
import type { X402QuestionPayload } from "~~/lib/x402/questionPayload";
import {
  __setX402QuestionSubmissionTestOverridesForTests,
  buildPermissionlessWalletClientRequestId,
  getX402QuestionSubmissionByClientRequest,
  prepareAgentWalletQuestionSubmissionRequest,
  prepareNativeX402QuestionSubmissionRequest,
  preparePermissionlessNativeX402QuestionSubmissionRequest,
  preparePermissionlessWalletQuestionSubmissionRequest,
  x402QuestionSubmissionRecordBody,
} from "~~/lib/x402/questionSubmission";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;

function buildPayload(clientRequestId: string): X402QuestionPayload {
  return {
    bounty: {
      amount: 1_000_000n,
      asset: "USDC" as const,
      feedbackClosesAt: 0n,
      requiredSettledRounds: 1n,
      requiredVoters: 3n,
      rewardPoolExpiresAt: 1_762_000_000n,
    },
    chainId: 42220,
    clientRequestId,
    questions: [
      {
        categoryId: 5n,
        contextUrl: "https://example.com/context",
        description: "Would you approve this action?",
        imageUrls: [] as string[],
        questionMetadataHash: `0x${"2".repeat(64)}` as const,
        resultSpecHash: `0x${"3".repeat(64)}` as const,
        tagList: ["agents"],
        tags: "agents",
        targetAudience: null,
        templateId: "generic_rating",
        templateInputs: null,
        templateVersion: 1,
        title: "Agent action approval",
        videoUrl: "",
      },
    ],
    roundConfig: {
      epochDuration: 300n,
      maxDuration: 3_600n,
      maxVoters: 5n,
      minVoters: 3n,
    },
  };
}

const TEST_CONFIG = {
  chainId: 42220,
  contentRegistryAddress: "0x0000000000000000000000000000000000000011" as const,
  questionRewardPoolEscrowAddress: "0x0000000000000000000000000000000000000013" as const,
  rpcUrl: "http://localhost:8545",
  targetNetwork: { id: 42220 } as never,
  usdcAddress: "0x0000000000000000000000000000000000000014" as const,
  x402QuestionSubmitterAddress: "0x0000000000000000000000000000000000000015" as const,
};

before(() => {
  env.DATABASE_URL = "memory:";
  __setDatabaseResourcesForTests(createMemoryDatabaseResources());
});

beforeEach(async () => {
  __setX402QuestionSubmissionTestOverridesForTests({
    buildAgentWalletQuestionSubmissionPlan: async ({ payload, walletAddress }) => ({
      calls: [
        {
          data: `0x${"a".repeat(8)}` as const,
          description: "Approve escrow",
          functionName: "approve",
          id: "approve-usdc",
          phase: "approve_usdc",
          to: TEST_CONFIG.usdcAddress,
          value: "0",
        },
      ],
      chainId: payload.chainId,
      operationKey: `0x${payload.clientRequestId.padEnd(64, "0").slice(0, 64)}` as `0x${string}`,
      payment: {
        amount: payload.bounty.amount.toString(),
        asset: "USDC",
        bountyAmount: payload.bounty.amount.toString(),
        decimals: 6,
        spender: TEST_CONFIG.questionRewardPoolEscrowAddress,
        tokenAddress: TEST_CONFIG.usdcAddress,
      },
      payloadHash: `payload:${payload.clientRequestId}`,
      questionCount: payload.questions.length,
      requiresOrderedExecution: true,
      revealCommitment: `0x${"9".repeat(64)}` as const,
      roundConfig: {
        epochDuration: payload.roundConfig.epochDuration.toString(),
        maxDuration: payload.roundConfig.maxDuration.toString(),
        maxVoters: payload.roundConfig.maxVoters.toString(),
        minVoters: payload.roundConfig.minVoters.toString(),
      },
      submissionKeys: [`0x${"2".repeat(64)}` as const],
      walletAddress,
    }),
    resolveX402QuestionConfig: () => TEST_CONFIG,
  });
  await dbClient.execute("DELETE FROM x402_question_submissions");
});

after(() => {
  __setX402QuestionSubmissionTestOverridesForTests(null);
  __setDatabaseResourcesForTests(null);
  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("prepareAgentWalletQuestionSubmissionRequest stores a direct wallet plan without service fees", async () => {
  const payload = buildPayload("wallet-plan");
  const walletAddress = "0x00000000000000000000000000000000000000aa" as const;

  const prepared = await prepareAgentWalletQuestionSubmissionRequest({
    agentId: "agent-wallet",
    payload,
    walletAddress,
  });
  const body = prepared.body as {
    payment: Record<string, unknown>;
    status: string;
    transactionPlan: { calls: unknown[] };
    wallet: { address: string };
  };

  assert.equal(prepared.status, 202);
  assert.equal(body.status, "awaiting_wallet_signature");
  assert.equal(body.wallet.address, walletAddress);
  assert.equal(body.transactionPlan.calls.length, 1);
  assert.equal(body.payment.amount, payload.bounty.amount.toString());
  assert.equal("serviceFeeAmount" in body.payment, false);

  const record = await getX402QuestionSubmissionByClientRequest({
    chainId: payload.chainId,
    clientRequestId: payload.clientRequestId,
  });
  assert.equal(record?.status, "awaiting_wallet_signature");
  assert.equal(record?.payerAddress, walletAddress);
  assert.equal(record?.paymentAmount, payload.bounty.amount.toString());
});

test("preparePermissionlessWalletQuestionSubmissionRequest namespaces idempotency by wallet", async () => {
  const payload = buildPayload("same-client-request");
  const firstWallet = "0x00000000000000000000000000000000000000aa" as const;
  const secondWallet = "0x00000000000000000000000000000000000000bb" as const;

  const first = await preparePermissionlessWalletQuestionSubmissionRequest({
    payload,
    walletAddress: firstWallet,
  });
  const second = await preparePermissionlessWalletQuestionSubmissionRequest({
    payload,
    walletAddress: secondWallet,
  });
  const firstBody = first.body as { clientRequestId: string; operationKey: string; status: string };
  const secondBody = second.body as { clientRequestId: string; operationKey: string; status: string };

  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(firstBody.clientRequestId, payload.clientRequestId);
  assert.equal(secondBody.clientRequestId, payload.clientRequestId);
  assert.notEqual(firstBody.operationKey, secondBody.operationKey);

  const storedClientRequestId = buildPermissionlessWalletClientRequestId({
    chainId: payload.chainId,
    clientRequestId: payload.clientRequestId,
    walletAddress: firstWallet,
  });
  const record = await getX402QuestionSubmissionByClientRequest({
    chainId: payload.chainId,
    clientRequestId: storedClientRequestId,
  });
  assert.equal(record?.payerAddress, firstWallet);
  assert.equal(record?.status, "awaiting_wallet_signature");
  assert.equal(x402QuestionSubmissionRecordBody(record).clientRequestId, payload.clientRequestId);
  assert.match(record?.paymentReceipt ?? "", /permissionless-wallet-plan/);
});

test("prepareNativeX402QuestionSubmissionRequest returns an authorization request before signature", async () => {
  const payload = buildPayload("native-x402-plan");
  const walletAddress = "0x00000000000000000000000000000000000000aa" as const;

  __setX402QuestionSubmissionTestOverridesForTests({
    buildNativeX402QuestionSubmissionPlan: async ({ paymentAuthorization, payload, walletAddress }) => {
      const signature =
        paymentAuthorization && typeof paymentAuthorization.signature === "string"
          ? (paymentAuthorization.signature as `0x${string}`)
          : undefined;
      return {
        authorization: {
          from: walletAddress,
          nonce: `0x${"4".repeat(64)}` as const,
          signature,
          to: TEST_CONFIG.x402QuestionSubmitterAddress,
          validAfter: "0",
          validBefore: "1762000000",
          value: payload.bounty.amount.toString(),
        },
        calls: signature
          ? [
              {
                data: `0x${"a".repeat(8)}` as const,
                description: "Reserve submission",
                functionName: "reserveSubmission",
                id: "reserve-submission",
                phase: "reserve_submission",
                to: TEST_CONFIG.contentRegistryAddress,
                value: "0",
              },
              {
                data: `0x${"b".repeat(8)}` as const,
                description: "Submit x402 question",
                functionName: "submitQuestionWithX402Payment",
                id: "submit-x402-question",
                phase: "submit_x402_question",
                to: TEST_CONFIG.x402QuestionSubmitterAddress,
                value: "0",
              },
            ]
          : [],
        chainId: payload.chainId,
        operationKey: `0x${payload.clientRequestId.padEnd(64, "0").slice(0, 64)}` as `0x${string}`,
        payment: {
          amount: payload.bounty.amount.toString(),
          asset: "USDC",
          bountyAmount: payload.bounty.amount.toString(),
          decimals: 6,
          spender: TEST_CONFIG.x402QuestionSubmitterAddress,
          tokenAddress: TEST_CONFIG.usdcAddress,
        },
        payloadHash: `payload:${payload.clientRequestId}`,
        questionCount: payload.questions.length,
        requiresOrderedExecution: true,
        revealCommitment: `0x${"9".repeat(64)}` as const,
        roundConfig: {
          epochDuration: payload.roundConfig.epochDuration.toString(),
          maxDuration: payload.roundConfig.maxDuration.toString(),
          maxVoters: payload.roundConfig.maxVoters.toString(),
          minVoters: payload.roundConfig.minVoters.toString(),
        },
        submissionKey: `0x${"2".repeat(64)}` as const,
        walletAddress,
      };
    },
    resolveX402QuestionConfig: () => TEST_CONFIG,
  });

  const prepared = await prepareNativeX402QuestionSubmissionRequest({
    agentId: "native-agent",
    payload,
    walletAddress,
  });
  const body = prepared.body as {
    nextAction: string;
    paymentMode: string;
    transactionPlan: null | { calls: unknown[] };
    x402AuthorizationRequest: { authorization: { nonce: string } };
  };

  assert.equal(prepared.status, 202);
  assert.equal(body.paymentMode, "x402_authorization");
  assert.equal(body.nextAction, "sign_x402_authorization");
  assert.equal(body.transactionPlan, null);
  assert.equal(body.x402AuthorizationRequest.authorization.nonce, `0x${"4".repeat(64)}`);

  const signed = await prepareNativeX402QuestionSubmissionRequest({
    agentId: "native-agent",
    paymentAuthorization: { signature: `0x${"5".repeat(130)}` },
    payload,
    walletAddress,
  });
  const signedBody = signed.body as {
    nextAction: string;
    transactionPlan: { calls: unknown[] };
  };
  assert.equal(signedBody.nextAction, "submit_x402_transaction");
  assert.equal(signedBody.transactionPlan.calls.length, 2);

  const permissionlessPayload = buildPayload("native-x402-public");
  const permissionless = await preparePermissionlessNativeX402QuestionSubmissionRequest({
    payload: permissionlessPayload,
    walletAddress,
  });
  const permissionlessBody = permissionless.body as {
    clientRequestId: string;
    paymentMode: string;
    x402AuthorizationRequest: { authorization: { nonce: string } };
  };
  assert.equal(permissionless.status, 202);
  assert.equal(permissionlessBody.clientRequestId, permissionlessPayload.clientRequestId);
  assert.equal(permissionlessBody.paymentMode, "x402_authorization");

  const storedClientRequestId = buildPermissionlessWalletClientRequestId({
    chainId: permissionlessPayload.chainId,
    clientRequestId: permissionlessPayload.clientRequestId,
    walletAddress,
  });
  const record = await getX402QuestionSubmissionByClientRequest({
    chainId: permissionlessPayload.chainId,
    clientRequestId: storedClientRequestId,
  });
  assert.equal(x402QuestionSubmissionRecordBody(record).clientRequestId, permissionlessPayload.clientRequestId);
  assert.match(record?.paymentReceipt ?? "", /permissionless-x402-authorization/);
});
