import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256, type Hex } from "viem";

const ADDRESS = "0x9999999999999999999999999999999999999999" as const;
const SUBMISSION_KEY = `0x${"aa".repeat(32)}` as const;
const FIXED_SALT = `0x${"11".repeat(32)}` as const;
const CONTENT_REGISTRY = "0x2222222222222222222222222222222222222222" as const;
const ITEM = {
  url: "https://image.tmdb.org/t/p/original/matrix.jpg",
  title: "The Matrix",
  description: "A computer hacker learns the truth.",
  tags: "Sci-Fi",
  categoryId: 5n,
};

type SubmitCommandOptions = {
  allowance?: bigint;
  balance?: bigint;
  hasVoterId?: boolean;
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
};

async function loadSubmitCommand(options: SubmitCommandOptions = {}) {
  vi.resetModules();

  const sleep = vi.fn().mockResolvedValue(undefined);
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "hasVoterId":
        return options.hasVoterId ?? true;
      case "balanceOf":
        return options.balance ?? 20_000_000n;
      case "allowance":
        return options.allowance ?? 0n;
      case "previewQuestionMediaSubmissionKey":
        return [options.previewCategoryId ?? ITEM.categoryId, SUBMISSION_KEY] as const;
      case "submissionKeyUsed":
        return options.submissionKeyUsed ?? false;
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
      functionName === "submitQuestionWithMedia" &&
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
      case "submitQuestionWithMedia":
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

  vi.doMock("node:crypto", () => ({
    randomBytes: vi.fn(() => Buffer.from(FIXED_SALT.slice(2), "hex")),
  }));
  vi.doMock("../client.js", () => ({
    getAccount: vi.fn(() => ({ address: ADDRESS })),
    getWalletClient: vi.fn(() => ({ writeContract })),
    publicClient: {
      readContract,
      waitForTransactionReceipt,
    },
  }));
  vi.doMock("../contracts.js", () => ({
    contractConfig: {
      registry: { address: CONTENT_REGISTRY, abi: [] },
      token: { address: "0x1111111111111111111111111111111111111111", abi: [] },
      voterIdNFT: { address: "0x4444444444444444444444444444444444444444", abi: [] },
    },
  }));
  vi.doMock("../config.js", () => ({
    config: {
      submitBot: {},
      contracts: { contentRegistry: CONTENT_REGISTRY },
      maxSubmissionsPerRun: 5,
      maxSubmissionsPerCategory: 3,
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
          name: "tmdb",
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
      ],
      [SUBMISSION_KEY, ITEM.title, ITEM.description, ITEM.tags, ITEM.categoryId, FIXED_SALT, ADDRESS],
    ),
  );
}

describe("runSubmit", () => {
  it("uses the reserved submission flow before submitting a media-backed question", async () => {
    const submitCommand = await loadSubmitCommand();

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewQuestionMediaSubmissionKey",
        args: [[ITEM.url], "", ITEM.title, ITEM.description, ITEM.tags, ITEM.categoryId],
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
        args: [CONTENT_REGISTRY, 10_000_000n],
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
        functionName: "submitQuestionWithMedia",
        args: [[ITEM.url], "", ITEM.title, ITEM.description, ITEM.tags, ITEM.categoryId, FIXED_SALT],
      }),
    );
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith(`Processing tmdb item 1/1: "${ITEM.title}"`);
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
    const submitCommand = await loadSubmitCommand({ allowance: 10_000_000n });

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

  it("skips unsupported submission URLs before reserving", async () => {
    const submitCommand = await loadSubmitCommand({
      sources: [
        {
          name: "tmdb",
          categoryId: ITEM.categoryId,
          categoryName: "Media",
          items: [{ ...ITEM, url: "https://www.themoviedb.org/movie/603" }],
        },
      ],
    });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(
      `Skipping "${ITEM.title}" (submission URL must be a direct image or YouTube video)`,
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

  it("cancels the reservation when submitQuestionWithMedia fails after reserving", async () => {
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
        ([call]) => call.functionName === "submitQuestionWithMedia",
      ),
    ).toHaveLength(2);
    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "cancelReservedSubmission" }),
    );
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(`Retrying "${ITEM.title}" after reservation age check`);
  });

  it("supports category filtering and uses the explicit max for a single selected source", async () => {
    const tmdbItem = { ...ITEM };
    const secondTmdbItem = {
      ...ITEM,
      url: "https://image.tmdb.org/t/p/original/matrix-reloaded.jpg",
      title: "The Matrix Reloaded",
    };
    const thirdTmdbItem = {
      ...ITEM,
      url: "https://image.tmdb.org/t/p/original/matrix-revolutions.jpg",
      title: "The Matrix Revolutions",
    };
    const submitCommand = await loadSubmitCommand({
      sources: [
        {
          name: "tmdb",
          categoryId: 5n,
          categoryName: "Media",
          items: [tmdbItem, secondTmdbItem, thirdTmdbItem],
        },
        {
          name: "coingecko",
          categoryId: 1n,
          categoryName: "Products",
          items: [{ ...ITEM, url: "https://www.coingecko.com/en/coins/bitcoin", title: "Bitcoin", categoryId: 1n }],
        },
      ],
    });

    await submitCommand.runSubmit({ category: "Media", maxSubmissions: 2 });

    expect(
      submitCommand.mocks.writeContract.mock.calls.filter(
        ([call]) => call.functionName === "submitQuestionWithMedia",
      ),
    ).toHaveLength(2);
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith("Category filter: Media");
  });
});
