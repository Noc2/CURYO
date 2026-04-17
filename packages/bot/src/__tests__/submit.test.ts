import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256, type Hex } from "viem";

const ADDRESS = "0x9999999999999999999999999999999999999999" as const;
const SUBMISSION_KEY = `0x${"aa".repeat(32)}` as const;
const FIXED_SALT = `0x${"11".repeat(32)}` as const;
const CONTENT_REGISTRY = "0x2222222222222222222222222222222222222222" as const;
const REWARD_ESCROW = "0x3333333333333333333333333333333333333333" as const;
const USDC_TOKEN = "0x4444444444444444444444444444444444444444" as const;
const PROTOCOL_CONFIG = "0x5555555555555555555555555555555555555555" as const;
const ITEM = {
  contextUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  description: "A music video with persistent cultural staying power.",
  tags: "Music",
  categoryId: 5n,
};

type SubmitCommandOptions = {
  allowance?: bigint;
  balance?: bigint;
  submissionKeyUsed?: boolean;
  previewCategoryId?: bigint;
  receiptStatusByHash?: Record<string, "success" | "reverted">;
  sources?: Array<{
    categoryId: bigint;
    categoryName: string;
    items: typeof ITEM[];
    name: string;
  }>;
  submitErrorCount?: number;
  submitError?: Error;
  x402Response?: Record<string, unknown>;
};

async function loadSubmitCommand(options: SubmitCommandOptions = {}) {
  vi.resetModules();

  const sleep = vi.fn().mockResolvedValue(undefined);
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "balanceOf":
        return options.balance ?? 20_000_000n;
      case "allowance":
        return options.allowance ?? 0n;
      case "minSubmissionUsdcPool":
        return 1_000_000n;
      case "previewQuestionSubmissionKey":
        return [options.previewCategoryId ?? ITEM.categoryId, SUBMISSION_KEY] as const;
      case "protocolConfig":
        return PROTOCOL_CONFIG;
      case "submissionKeyUsed":
        return options.submissionKeyUsed ?? false;
      case "usdcToken":
        return USDC_TOKEN;
      default:
        throw new Error(`Unexpected readContract: ${functionName}`);
    }
  });
  const waitForTransactionReceipt = vi.fn(async ({ hash }: { hash: string }) => ({
    status: options.receiptStatusByHash?.[hash] ?? "success",
  }));
  let submitAttempts = 0;
  const writeContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (
      functionName === "submitQuestionWithReward" &&
      options.submitError &&
      submitAttempts < (options.submitErrorCount ?? 1)
    ) {
      submitAttempts += 1;
      throw options.submitError;
    }

    switch (functionName) {
      case "approve":
        return "0xapprove";
      case "reserveSubmission":
        return "0xreserve";
      case "submitQuestionWithReward":
        return "0xsubmit";
      case "cancelReservedSubmission":
        return "0xcancel";
      default:
        throw new Error(`Unexpected writeContract: ${functionName}`);
    }
  });
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const paidFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify(
        options.x402Response ?? {
          contentId: "123",
          operationKey: "0xx402",
          rewardPoolId: "456",
          status: "submitted",
          transactionHashes: ["0xsubmit"],
        },
      ),
      { status: 200 },
    );
  });
  const wrapFetchWithPayment = vi.fn(() => paidFetch);

  vi.doMock("node:crypto", () => ({
    createHash: vi.fn(() => ({
      digest: vi.fn(() => "abcd".repeat(16)),
      update: vi.fn().mockReturnThis(),
    })),
    randomBytes: vi.fn(() => Buffer.from(FIXED_SALT.slice(2), "hex")),
  }));
  vi.doMock("thirdweb", () => ({
    createThirdwebClient: vi.fn(() => ({ clientId: "thirdweb-client" })),
    defineChain: vi.fn(chain => chain),
  }));
  vi.doMock("thirdweb/wallets", () => ({
    privateKeyToAccount: vi.fn(() => ({ address: ADDRESS })),
  }));
  vi.doMock("thirdweb/x402", () => ({
    wrapFetchWithPayment,
  }));
  vi.doMock("../client.js", () => ({
    getAccount: vi.fn(() => ({ address: ADDRESS })),
    getIdentityPrivateKey: vi.fn(() => `0x${"22".repeat(32)}`),
    getWalletClient: vi.fn(() => ({ writeContract })),
    publicClient: {
      readContract,
      waitForTransactionReceipt,
    },
  }));
  vi.doMock("../contracts.js", () => ({
    contractConfig: {
      protocolConfigAbi: [],
      questionRewardPoolEscrow: { address: REWARD_ESCROW, abi: [] },
      registry: { address: CONTENT_REGISTRY, abi: [] },
      token: { address: "0x1111111111111111111111111111111111111111", abi: [] },
    },
  }));
  vi.doMock("../config.js", () => ({
    config: {
      submitBot: { privateKey: `0x${"22".repeat(32)}` },
      chainId: 42220,
      rpcUrl: "https://forno.celo.org",
      contracts: { contentRegistry: CONTENT_REGISTRY, questionRewardPoolEscrow: REWARD_ESCROW },
      submitRewardAsset: "usdc",
      submitRewardRequiredVoters: 3,
      submitRewardRequiredSettledRounds: 1,
      submitRewardPoolExpiresAt: 0n,
      maxSubmissionsPerRun: 5,
      maxSubmissionsPerCategory: 3,
      x402: {
        apiUrl: "https://curyo.example/api/x402/questions",
        maxPaymentUsdc: 1_000_000n,
        thirdwebClientId: "thirdweb-client",
      },
    },
    log,
  }));
  vi.doMock("../sources/index.js", () => ({
    getAllSources: () =>
      options.sources?.map(source => ({
        name: source.name,
        categoryId: source.categoryId,
        categoryName: source.categoryName,
        fetchTrending: vi.fn().mockResolvedValue(source.items),
      })) ?? [
        {
          name: "youtube",
          categoryId: ITEM.categoryId,
          categoryName: "Media",
          fetchTrending: vi.fn().mockResolvedValue([ITEM]),
        },
      ],
  }));
  vi.doMock("../utils.js", async () => {
    const actual = await vi.importActual<typeof import("../utils.js")>("../utils.js");
    return {
      ...actual,
      sleep,
    };
  });

  const submitModule = await import("../commands/submit.js");
  return {
    ...submitModule,
    mocks: {
      log,
      readContract,
      sleep,
      waitForTransactionReceipt,
      writeContract,
      paidFetch,
      wrapFetchWithPayment,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function buildExpectedRevealCommitment(): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        SUBMISSION_KEY,
        ITEM.title,
        ITEM.description,
        ITEM.tags,
        ITEM.categoryId,
        FIXED_SALT,
        ADDRESS,
        1,
        1_000_000n,
        3n,
        1n,
        0n,
      ],
    ),
  );
}

describe("runSubmit", () => {
  it("uses the reserved submission flow before submitting a context-backed question", async () => {
    const submitCommand = await loadSubmitCommand();

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewQuestionSubmissionKey",
        args: [ITEM.contextUrl, [], "", ITEM.title, ITEM.description, ITEM.tags, ITEM.categoryId],
      }),
    );
    expect(submitCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "submissionKeyUsed",
        args: [SUBMISSION_KEY],
      }),
    );
    expect(submitCommand.mocks.sleep).toHaveBeenCalledWith(1_100);
    expect(submitCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: "approve",
        args: [REWARD_ESCROW, 1_000_000n],
      }),
    );
    expect(submitCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "reserveSubmission",
        args: [buildExpectedRevealCommitment()],
      }),
    );
    expect(submitCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        functionName: "submitQuestionWithReward",
        args: [
          ITEM.contextUrl,
          [],
          "",
          ITEM.title,
          ITEM.description,
          ITEM.tags,
          ITEM.categoryId,
          FIXED_SALT,
          1,
          1_000_000n,
          3n,
          1n,
          0n,
        ],
      }),
    );
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith(`Processing youtube item 1/1: "${ITEM.title}"`);
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith(
      `Waiting for reservation receipt for "${ITEM.title}": 0xreserve`,
    );
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith(`Waiting for submit receipt for "${ITEM.title}": 0xsubmit`);
    expect(submitCommand.mocks.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: "0xreserve",
      timeout: 180_000,
    });
    expect(submitCommand.mocks.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: "0xsubmit",
      timeout: 180_000,
    });
  });

  it("reuses an existing submission allowance when it is already sufficient", async () => {
    const submitCommand = await loadSubmitCommand({ allowance: 1_000_000n });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "approve",
      }),
    );
    expect(submitCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: "reserveSubmission",
      }),
    );
  });

  it("skips questions that are already submitted", async () => {
    const submitCommand = await loadSubmitCommand({ submissionKeyUsed: true });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.log.debug).toHaveBeenCalledWith(`Skipping "${ITEM.title}" (question already submitted)`);
  });

  it("skips invalid context URLs before reserving", async () => {
    const submitCommand = await loadSubmitCommand({
      sources: [
        {
          name: "youtube",
          categoryId: ITEM.categoryId,
          categoryName: "Media",
          items: [{ ...ITEM, contextUrl: "http://www.themoviedb.org/movie/603", url: "http://www.themoviedb.org/movie/603" }],
        },
      ],
    });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(
      `Skipping "${ITEM.title}" (context URL must be a valid HTTPS URL)`,
    );
  });

  it("skips items whose resolved category no longer matches the source mapping", async () => {
    const submitCommand = await loadSubmitCommand({ previewCategoryId: 9n });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(
      `Skipping "${ITEM.title}" (resolved category 9 does not match requested category 5)`,
    );
  });

  it("cancels the reservation when submitQuestionWithReward fails after reserving", async () => {
    const submitCommand = await loadSubmitCommand({ submitError: new Error("submit failed") });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        functionName: "cancelReservedSubmission",
        args: [buildExpectedRevealCommitment()],
      }),
    );
    expect(submitCommand.mocks.log.error).toHaveBeenCalledWith(`Failed to submit "${ITEM.title}": submit failed`);
  });

  it("cancels the reservation when the submit receipt reverts", async () => {
    const submitCommand = await loadSubmitCommand({
      receiptStatusByHash: { "0xsubmit": "reverted" },
    });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        functionName: "cancelReservedSubmission",
        args: [buildExpectedRevealCommitment()],
      }),
    );
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith(
      `Waiting for cancel reservation receipt for "${ITEM.title}": 0xcancel`,
    );
    expect(submitCommand.mocks.log.error).toHaveBeenCalledWith(
      `Failed to submit "${ITEM.title}": submit transaction reverted: 0xsubmit`,
    );
  });

  it("retries once when the reservation is still too new", async () => {
    const submitCommand = await loadSubmitCommand({
      submitError: new Error("Reservation too new"),
      submitErrorCount: 1,
    });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.sleep).toHaveBeenNthCalledWith(1, 1_100);
    expect(submitCommand.mocks.sleep).toHaveBeenNthCalledWith(2, 1_100);
    expect(
      submitCommand.mocks.writeContract.mock.calls.filter(
        ([call]) => call.functionName === "submitQuestionWithReward",
      ),
    ).toHaveLength(2);
    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "cancelReservedSubmission" }),
    );
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(`Retrying "${ITEM.title}" after reservation age check`);
  });

  it("supports category filtering and uses the explicit max for a single selected source", async () => {
    const youtubeItem = { ...ITEM };
    const secondYoutubeItem = {
      ...ITEM,
      url: "https://www.youtube.com/watch?v=9bZkp7q19f0",
      title: "Gangnam Style",
    };
    const thirdYoutubeItem = {
      ...ITEM,
      url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
      title: "Despacito",
    };
    const submitCommand = await loadSubmitCommand({
      sources: [
        {
          name: "youtube",
          categoryId: 5n,
          categoryName: "Media",
          items: [youtubeItem, secondYoutubeItem, thirdYoutubeItem],
        },
        {
          name: "archive",
          categoryId: 10n,
          categoryName: "General",
          items: [{ ...ITEM, url: "https://example.com/archive.jpg", title: "Archive", categoryId: 10n }],
        },
      ],
    });

    await submitCommand.runSubmit({ category: "Media", maxSubmissions: 2 });

    expect(
      submitCommand.mocks.writeContract.mock.calls.filter(
        ([call]) => call.functionName === "submitQuestionWithReward",
      ),
    ).toHaveLength(2);
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith("Category filter: Media");
  });

  it("submits discovered questions through x402 without broadcasting direct write calls", async () => {
    const submitCommand = await loadSubmitCommand();

    await submitCommand.runSubmit({ transport: "x402" });

    expect(submitCommand.mocks.wrapFetchWithPayment).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ clientId: "thirdweb-client" }),
      expect.objectContaining({ id: "inApp" }),
      expect.objectContaining({ maxValue: 1_000_000n }),
    );
    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.paidFetch).toHaveBeenCalledWith(
      "https://curyo.example/api/x402/questions",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const requestBody = JSON.parse(String(submitCommand.mocks.paidFetch.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      bounty: {
        amount: "1000000",
        asset: "USDC",
        requiredSettledRounds: "1",
        requiredVoters: "3",
        rewardPoolExpiresAt: "0",
      },
      chainId: 42220,
      clientRequestId: "youtube:abcdabcdabcdabcdabcdabcdabcdabcd",
      question: {
        categoryId: "5",
        contextUrl: ITEM.contextUrl,
        title: ITEM.title,
      },
    });
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith(
      `Submitted "${ITEM.title}" [youtube] via x402 content=123 rewardPool=456 operation=0xx402`,
    );
  });
});
