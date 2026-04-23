import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { __setDatabaseResourcesForTests, dbClient } from "~~/lib/db";
import { createMemoryDatabaseResources } from "~~/lib/db/testMemory";
import {
  __setX402QuestionSubmissionTestOverridesForTests,
  completeManagedQuestionSubmissionRequest,
  getX402QuestionSubmissionByClientRequest,
  startManagedQuestionSubmissionRequest,
} from "~~/lib/x402/questionSubmission";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;

function buildPayload(clientRequestId: string) {
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
        tags: ["agents"],
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
  contentRegistryAddress: "0x0000000000000000000000000000000000000011",
  executorAddress: "0x0000000000000000000000000000000000000012",
  executorPrivateKey: `0x${"1".repeat(64)}`,
  questionRewardPoolEscrowAddress: "0x0000000000000000000000000000000000000013",
  rpcUrl: "http://localhost:8545",
  serviceFeeAmount: 0n,
  targetNetwork: { id: 42220 } as never,
  thirdwebSecretKey: null,
  usdcAddress: "0x0000000000000000000000000000000000000014",
  waitUntil: "submitted" as const,
};

before(() => {
  env.DATABASE_URL = "memory:";
  __setDatabaseResourcesForTests(createMemoryDatabaseResources());
});

beforeEach(async () => {
  __setX402QuestionSubmissionTestOverridesForTests({
    executeX402QuestionSubmission: async () => ({
      bundleId: null,
      contentIds: [777n],
      rewardPoolId: 888n,
      transactionHashes: [`0x${"4".repeat(64)}` as const],
    }),
    preflightX402QuestionSubmission: async ({ payload }) => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: `0x${payload.clientRequestId.padEnd(64, "0").slice(0, 64)}` as `0x${string}`,
        payloadHash: `payload:${payload.clientRequestId}`,
      },
      paymentAmount: payload.bounty.amount,
      resolvedCategoryIds: payload.questions.map(question => question.categoryId),
      submissionKeys: payload.questions.map(
        (_question, index) => `0x${String(index + 1).padStart(64, "0")}` as `0x${string}`,
      ),
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

test("startManagedQuestionSubmissionRequest only grants one live execution token", async () => {
  const payload = buildPayload("atomic-start");
  const [first, second] = await Promise.all([
    startManagedQuestionSubmissionRequest({ agentId: "agent-1", payload }),
    startManagedQuestionSubmissionRequest({ agentId: "agent-1", payload }),
  ]);

  const winners = [first, second].filter(result => result.shouldSubmit);
  assert.equal(winners.length, 1);
  assert.equal(typeof winners[0]?.submissionToken, "string");

  const loser = first.shouldSubmit ? second : first;
  assert.equal(loser.shouldSubmit, false);
  assert.equal((loser.body as { status: string }).status, "submitting");

  const record = await getX402QuestionSubmissionByClientRequest({
    chainId: payload.chainId,
    clientRequestId: payload.clientRequestId,
  });
  assert.equal(record?.status, "submitting");
  assert.equal(typeof record?.submissionToken, "string");
});

test("completeManagedQuestionSubmissionRequest consumes the execution token before submit", async () => {
  const payload = buildPayload("token-consume");
  let executeCalls = 0;
  let releaseExecution: (() => void) | null = null;
  const executionGate = new Promise<void>(resolve => {
    releaseExecution = resolve;
  });

  __setX402QuestionSubmissionTestOverridesForTests({
    executeX402QuestionSubmission: async () => {
      executeCalls += 1;
      await executionGate;
      return {
        bundleId: null,
        contentIds: [999n],
        rewardPoolId: 1_001n,
        transactionHashes: [`0x${"5".repeat(64)}` as const],
      };
    },
    preflightX402QuestionSubmission: async ({ payload: currentPayload }) => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: `0x${currentPayload.clientRequestId.padEnd(64, "0").slice(0, 64)}` as `0x${string}`,
        payloadHash: `payload:${currentPayload.clientRequestId}`,
      },
      paymentAmount: currentPayload.bounty.amount,
      resolvedCategoryIds: currentPayload.questions.map(question => question.categoryId),
      submissionKeys: currentPayload.questions.map(
        (_question, index) => `0x${String(index + 1).padStart(64, "0")}` as `0x${string}`,
      ),
    }),
    resolveX402QuestionConfig: () => TEST_CONFIG,
  });

  const started = await startManagedQuestionSubmissionRequest({ agentId: "agent-1", payload });
  assert.equal(started.shouldSubmit, true);
  assert.equal(typeof started.submissionToken, "string");

  const firstCompletion = completeManagedQuestionSubmissionRequest({
    agentId: "agent-1",
    payload,
    submissionToken: started.submissionToken,
  });

  while (executeCalls === 0) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  await assert.rejects(
    () =>
      completeManagedQuestionSubmissionRequest({
        agentId: "agent-1",
        payload,
        submissionToken: started.submissionToken,
      }),
    /already being processed/i,
  );
  assert.equal(executeCalls, 1);

  releaseExecution?.();
  const completed = await firstCompletion;
  assert.equal(completed.status, 200);

  const record = await getX402QuestionSubmissionByClientRequest({
    chainId: payload.chainId,
    clientRequestId: payload.clientRequestId,
  });
  assert.equal(record?.status, "submitted");
  assert.equal(record?.contentId, "999");
  assert.equal(record?.submissionToken, null);
});

test("startManagedQuestionSubmissionRequest rejects unsupported bundle bounty terms", async () => {
  const unsupportedRoundsPayload = buildPayload("unsupported-rounds");
  unsupportedRoundsPayload.bounty = {
    ...unsupportedRoundsPayload.bounty,
    requiredSettledRounds: 2n,
  };
  await assert.rejects(
    () => startManagedQuestionSubmissionRequest({ agentId: "agent-1", payload: unsupportedRoundsPayload }),
    /must equal 1/,
  );

  const missingClosePayload = buildPayload("missing-close");
  missingClosePayload.bounty = {
    ...missingClosePayload.bounty,
    rewardPoolExpiresAt: 0n,
  };
  await assert.rejects(
    () => startManagedQuestionSubmissionRequest({ agentId: "agent-1", payload: missingClosePayload }),
    /must be greater than zero/,
  );
});
