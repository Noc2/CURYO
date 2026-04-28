import assert from "node:assert/strict";
import test from "node:test";
import {
  X402QuestionInputError,
  buildX402QuestionOperation,
  parseX402QuestionRequest,
} from "~~/lib/x402/questionPayload";

const VALID_REQUEST = {
  bounty: {
    amount: "1000000",
    asset: "USDC",
    requiredSettledRounds: "1",
    requiredVoters: "3",
    rewardPoolExpiresAt: "1762000000",
  },
  chainId: 42220,
  clientRequestId: "youtube:abc123",
  question: {
    categoryId: "5",
    contextUrl: "https://example.com/watch?v=abc123",
    description: "Vote based on the source material and the prompt.",
    imageUrls: ["https://example.com/preview.jpg"],
    tags: ["Media", "Video"],
    title: "Is this clip worth watching?",
  },
};

test("parseX402QuestionRequest normalizes a valid paid question payload", () => {
  const payload = parseX402QuestionRequest(VALID_REQUEST);

  assert.equal(payload.chainId, 42220);
  assert.equal(payload.questions.length, 1);
  assert.equal(payload.questions[0].contextUrl, "https://example.com/watch?v=abc123");
  assert.equal(payload.bounty.amount, 1_000_000n);
  assert.equal(payload.bounty.rewardPoolExpiresAt, 1_762_000_000n);
  assert.equal(payload.bounty.requiredVoters, 3n);
  assert.equal(payload.roundConfig.epochDuration, 1200n);
  assert.equal(payload.questions[0].tags, "Media,Video");
  assert.deepEqual(payload.questions[0].imageUrls, ["https://example.com/preview.jpg"]);
});

test("parseX402QuestionRequest accepts an omitted description", () => {
  const payload = parseX402QuestionRequest({
    ...VALID_REQUEST,
    question: {
      ...VALID_REQUEST.question,
      description: undefined,
    },
  });

  assert.equal(payload.questions[0].description, "");
});

test("parseX402QuestionRequest accepts ordered question bundles", () => {
  const payload = parseX402QuestionRequest({
    ...VALID_REQUEST,
    question: undefined,
    questions: [
      VALID_REQUEST.question,
      {
        ...VALID_REQUEST.question,
        contextUrl: "https://example.com/second",
        imageUrls: [],
        tags: ["Market", "Research"],
        title: "Would you pay for this?",
      },
    ],
    roundConfig: {
      epochDuration: "600",
      maxDuration: "7200",
      minVoters: "5",
      maxVoters: "50",
    },
  });

  assert.equal(payload.questions.length, 2);
  assert.equal(payload.questions[1].title, "Would you pay for this?");
  assert.equal(payload.questions[1].tags, "Market,Research");
  assert.equal(payload.roundConfig.maxVoters, 50n);
});

test("parseX402QuestionRequest preserves selected agent templates in hashes", () => {
  const generic = parseX402QuestionRequest(VALID_REQUEST);
  const goNoGo = parseX402QuestionRequest({
    ...VALID_REQUEST,
    templateId: "go_no_go",
    templateInputs: {
      action: "send_outreach",
    },
  });

  assert.equal(goNoGo.questions[0].templateId, "go_no_go");
  assert.equal(goNoGo.questions[0].templateVersion, 1);
  assert.deepEqual(goNoGo.questions[0].templateInputs, { action: "send_outreach" });
  assert.notEqual(goNoGo.questions[0].questionMetadataHash, generic.questions[0].questionMetadataHash);
  assert.notEqual(goNoGo.questions[0].resultSpecHash, generic.questions[0].resultSpecHash);
});

test("parseX402QuestionRequest anchors feature acceptance template metadata", () => {
  const generic = parseX402QuestionRequest(VALID_REQUEST);
  const featureAcceptance = parseX402QuestionRequest({
    ...VALID_REQUEST,
    templateId: "feature_acceptance_test",
    templateInputs: {
      acceptanceCriteria: "Vote up only if connect, refresh, and vote all work without manual recovery.",
      expectedBehavior: "The wallet stays connected after refresh.",
      testSteps: "1. Open preview. 2. Connect wallet. 3. Refresh. 4. Confirm wallet remains connected.",
    },
  });

  assert.equal(featureAcceptance.questions[0].templateId, "feature_acceptance_test");
  assert.equal(featureAcceptance.questions[0].templateVersion, 1);
  assert.deepEqual(featureAcceptance.questions[0].templateInputs, {
    acceptanceCriteria: "Vote up only if connect, refresh, and vote all work without manual recovery.",
    expectedBehavior: "The wallet stays connected after refresh.",
    testSteps: "1. Open preview. 2. Connect wallet. 3. Refresh. 4. Confirm wallet remains connected.",
  });
  assert.notEqual(featureAcceptance.questions[0].questionMetadataHash, generic.questions[0].questionMetadataHash);
  assert.notEqual(featureAcceptance.questions[0].resultSpecHash, generic.questions[0].resultSpecHash);
});

test("parseX402QuestionRequest binds public target audience metadata into the payload", () => {
  const withoutAudience = parseX402QuestionRequest(VALID_REQUEST);
  const withAudience = parseX402QuestionRequest({
    ...VALID_REQUEST,
    question: {
      ...VALID_REQUEST.question,
      targetAudience: {
        expertise: ["developer", "founder"],
        roles: ["operator"],
      },
    },
  });

  assert.deepEqual(withAudience.questions[0].targetAudience, {
    expertise: ["developer", "founder"],
    roles: ["operator"],
  });
  assert.notEqual(withAudience.questions[0].questionMetadataHash, withoutAudience.questions[0].questionMetadataHash);
  assert.notEqual(
    buildX402QuestionOperation(withAudience).payloadHash,
    buildX402QuestionOperation(withoutAudience).payloadHash,
  );
});

test("parseX402QuestionRequest supports per-question template overrides in bundles", () => {
  const payload = parseX402QuestionRequest({
    ...VALID_REQUEST,
    question: undefined,
    templateId: "generic_rating",
    questions: [
      {
        ...VALID_REQUEST.question,
        templateId: "go_no_go",
      },
      {
        ...VALID_REQUEST.question,
        contextUrl: "https://example.com/second",
        imageUrls: [],
        tags: ["Market", "Research"],
        templateId: "ranked_option_member",
        templateInputs: {
          comparisonSetId: "headline-test-1",
          optionId: "variant-a",
          optionLabel: "Hero variant A",
        },
        title: "Would you pay for this?",
      },
    ],
  });

  assert.equal(payload.questions[0].templateId, "go_no_go");
  assert.equal(payload.questions[1].templateId, "ranked_option_member");
  assert.deepEqual(payload.questions[1].templateInputs, {
    comparisonSetId: "headline-test-1",
    optionId: "variant-a",
    optionLabel: "Hero variant A",
  });
});

test("parseX402QuestionRequest rejects unknown or unsupported template versions", () => {
  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        templateId: "mystery_template",
      }),
    /templateId is not supported/,
  );

  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        templateId: "go_no_go",
        templateVersion: 2,
      }),
    /templateVersion 2 is not supported/,
  );
});

test("parseX402QuestionRequest accepts explicit governed round config", () => {
  const payload = parseX402QuestionRequest({
    ...VALID_REQUEST,
    question: {
      ...VALID_REQUEST.question,
      roundConfig: {
        epochDuration: "600",
        maxDuration: "7200",
        minVoters: "5",
        maxVoters: "50",
      },
    },
  });

  assert.equal(payload.roundConfig.epochDuration, 600n);
  assert.equal(payload.roundConfig.maxDuration, 7200n);
  assert.equal(payload.roundConfig.minVoters, 5n);
  assert.equal(payload.roundConfig.maxVoters, 50n);
});

test("buildX402QuestionOperation binds round config into the payload hash", () => {
  const first = buildX402QuestionOperation(parseX402QuestionRequest(VALID_REQUEST));
  const second = buildX402QuestionOperation(
    parseX402QuestionRequest({
      ...VALID_REQUEST,
      question: {
        ...VALID_REQUEST.question,
        roundConfig: {
          epochDuration: "600",
          maxDuration: "7200",
          minVoters: "5",
          maxVoters: "50",
        },
      },
    }),
  );

  assert.notEqual(first.operationKey, second.operationKey);
  assert.notEqual(first.payloadHash, second.payloadHash);
});

test("buildX402QuestionOperation is sensitive to bundle question order", () => {
  const first = buildX402QuestionOperation(
    parseX402QuestionRequest({
      ...VALID_REQUEST,
      question: undefined,
      questions: [
        VALID_REQUEST.question,
        { ...VALID_REQUEST.question, contextUrl: "https://example.com/second", title: "Second title" },
      ],
    }),
  );
  const second = buildX402QuestionOperation(
    parseX402QuestionRequest({
      ...VALID_REQUEST,
      question: undefined,
      questions: [
        { ...VALID_REQUEST.question, contextUrl: "https://example.com/second", title: "Second title" },
        VALID_REQUEST.question,
      ],
    }),
  );

  assert.notEqual(first.operationKey, second.operationKey);
  assert.notEqual(first.payloadHash, second.payloadHash);
});

test("buildX402QuestionOperation is stable for equivalent payloads", () => {
  const first = buildX402QuestionOperation(parseX402QuestionRequest(VALID_REQUEST));
  const second = buildX402QuestionOperation(parseX402QuestionRequest({ ...VALID_REQUEST }));

  assert.equal(first.operationKey, second.operationKey);
  assert.equal(first.payloadHash, second.payloadHash);
});

test("parseX402QuestionRequest rejects non-USDC x402 bounties", () => {
  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        bounty: { ...VALID_REQUEST.bounty, asset: "HREP" },
      }),
    X402QuestionInputError,
  );
});

test("parseX402QuestionRequest accepts bundle payouts with multiple settled rounds", () => {
  const payload = parseX402QuestionRequest({
    ...VALID_REQUEST,
    bounty: { ...VALID_REQUEST.bounty, requiredSettledRounds: "2" },
  });

  assert.equal(payload.bounty.requiredSettledRounds, 2n);
});

test("parseX402QuestionRequest rejects bundle payouts without a bounty close", () => {
  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        bounty: { ...VALID_REQUEST.bounty, rewardPoolExpiresAt: "0" },
      }),
    /must be greater than zero/,
  );
});

test("parseX402QuestionRequest rejects unsupported media combinations before payment", () => {
  assert.throws(
    () =>
      parseX402QuestionRequest({
        ...VALID_REQUEST,
        question: {
          ...VALID_REQUEST.question,
          videoUrl: "https://www.youtube.com/watch?v=abc123",
        },
      }),
    /Use imageUrls or videoUrl/,
  );
});
