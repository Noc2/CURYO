import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256, type Hex } from "viem";

const ADDRESS = "0x9999999999999999999999999999999999999999" as const;
const SUBMISSION_KEY = `0x${"aa".repeat(32)}` as const;
const FIXED_SALT = `0x${"11".repeat(32)}` as const;
const CONTENT_REGISTRY = "0x2222222222222222222222222222222222222222" as const;
const ITEM = {
  url: "https://www.themoviedb.org/movie/603",
  title: "The Matrix",
  description: "A computer hacker learns the truth.",
  tags: "Sci-Fi",
  categoryId: 4n,
};

type SubmitCommandOptions = {
  balance?: bigint;
  hasVoterId?: boolean;
  isUrlSubmitted?: boolean;
  previewCategoryId?: bigint;
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
      case "isUrlSubmitted":
        return options.isUrlSubmitted ?? false;
      case "previewSubmissionKey":
        return [options.previewCategoryId ?? ITEM.categoryId, SUBMISSION_KEY] as const;
      default:
        throw new Error(`Unexpected readContract: ${functionName}`);
    }
  });
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });
  let submitAttempts = 0;
  const writeContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "submitContent" && options.submitError && submitAttempts < (options.submitErrorCount ?? 1)) {
      submitAttempts += 1;
      throw options.submitError;
    }

    switch (functionName) {
      case "approve":
        return "0xapprove";
      case "reserveSubmission":
        return "0xreserve";
      case "submitContent":
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
          categoryName: "Movies",
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
  it("uses the reserved submission flow before submitting content", async () => {
    const submitCommand = await loadSubmitCommand();

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewSubmissionKey",
        args: [ITEM.url, ITEM.categoryId],
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
        functionName: "submitContent",
        args: [ITEM.url, ITEM.title, ITEM.description, ITEM.tags, ITEM.categoryId, FIXED_SALT],
      }),
    );
  });

  it("skips URLs that are already submitted", async () => {
    const submitCommand = await loadSubmitCommand({ isUrlSubmitted: true });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.log.debug).toHaveBeenCalledWith(`Skipping "${ITEM.title}" (URL already submitted)`);
  });

  it("skips items whose resolved category no longer matches the source mapping", async () => {
    const submitCommand = await loadSubmitCommand({ previewCategoryId: 9n });

    await submitCommand.runSubmit();

    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(
      `Skipping "${ITEM.title}" (resolved category 9 does not match requested category 4)`,
    );
  });

  it("cancels the reservation when submitContent fails after reserving", async () => {
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
        ([call]) => call.functionName === "submitContent",
      ),
    ).toHaveLength(2);
    expect(submitCommand.mocks.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "cancelReservedSubmission" }),
    );
    expect(submitCommand.mocks.log.warn).toHaveBeenCalledWith(`Retrying "${ITEM.title}" after reservation age check`);
  });

  it("supports category filtering and uses the explicit max for a single selected source", async () => {
    const tmdbItem = { ...ITEM };
    const secondTmdbItem = { ...ITEM, url: "https://www.themoviedb.org/movie/604", title: "The Matrix Reloaded" };
    const thirdTmdbItem = { ...ITEM, url: "https://www.themoviedb.org/movie/605", title: "The Matrix Revolutions" };
    const submitCommand = await loadSubmitCommand({
      sources: [
        {
          name: "tmdb",
          categoryId: 4n,
          categoryName: "Movies",
          items: [tmdbItem, secondTmdbItem, thirdTmdbItem],
        },
        {
          name: "coingecko",
          categoryId: 9n,
          categoryName: "Crypto Tokens",
          items: [{ ...ITEM, url: "https://www.coingecko.com/en/coins/bitcoin", title: "Bitcoin", categoryId: 9n }],
        },
      ],
    });

    await submitCommand.runSubmit({ category: "Movies", maxSubmissions: 2 });

    expect(
      submitCommand.mocks.writeContract.mock.calls.filter(
        ([call]) => call.functionName === "submitContent",
      ),
    ).toHaveLength(2);
    expect(submitCommand.mocks.log.info).toHaveBeenCalledWith("Category filter: Movies");
  });
});
