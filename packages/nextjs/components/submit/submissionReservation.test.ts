import {
  buildSubmissionReservationStorageKey,
  buildSubmissionRevealCommitment,
  createStoredSubmissionReservation,
  deriveSubmissionReservationSalt,
  submissionReservationMatchesDraft,
} from "./submissionReservation";
import assert from "node:assert/strict";
import test from "node:test";

const ADDRESS = "0x00000000000000000000000000000000000000aa" as const;
const CHAIN_ID = 11142220;
const SUBMISSION_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const SALT = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const DEFAULT_DRAFT = {
  categoryId: 1n,
  contextUrl: "https://example.com/demo.jpg",
  description: "first description",
  imageUrls: ["https://example.com/demo.jpg"],
  rewardPoolExpiresAt: 0n,
  rewardAmount: 1_000_000n,
  rewardAsset: 0,
  requiredSettledRounds: 1n,
  requiredVoters: 3n,
  submissionKey: SUBMISSION_KEY,
  tags: "alpha,beta",
  title: "First title",
  videoUrl: "",
};

test("buildSubmissionReservationStorageKey stays stable when mutable metadata changes", () => {
  const first = buildSubmissionReservationStorageKey(ADDRESS, CHAIN_ID, SUBMISSION_KEY);
  const second = buildSubmissionReservationStorageKey(ADDRESS, CHAIN_ID, SUBMISSION_KEY);

  assert.equal(first, second);
});

test("buildSubmissionReservationStorageKey is chain-scoped", () => {
  const celo = buildSubmissionReservationStorageKey(ADDRESS, 42220, SUBMISSION_KEY);
  const sepolia = buildSubmissionReservationStorageKey(ADDRESS, 11142220, SUBMISSION_KEY);

  assert.notEqual(celo, sepolia);
});

test("buildSubmissionRevealCommitment changes when the reserved metadata changes", () => {
  const initial = buildSubmissionRevealCommitment(
    {
      ...DEFAULT_DRAFT,
    },
    SALT,
    ADDRESS,
  );

  const edited = buildSubmissionRevealCommitment(
    {
      ...DEFAULT_DRAFT,
      description: "edited description",
    },
    SALT,
    ADDRESS,
  );

  assert.notEqual(initial, edited);
});

test("buildSubmissionRevealCommitment changes when bounty terms change", () => {
  const initial = buildSubmissionRevealCommitment(
    {
      ...DEFAULT_DRAFT,
    },
    SALT,
    ADDRESS,
  );

  const edited = buildSubmissionRevealCommitment(
    {
      ...DEFAULT_DRAFT,
      requiredVoters: 5n,
    },
    SALT,
    ADDRESS,
  );

  assert.notEqual(initial, edited);
});

test("submissionReservationMatchesDraft only reuses reservations for the exact same draft", () => {
  const reservation = createStoredSubmissionReservation(
    {
      ...DEFAULT_DRAFT,
    },
    SALT,
    buildSubmissionRevealCommitment(
      {
        ...DEFAULT_DRAFT,
      },
      SALT,
      ADDRESS,
    ),
    CHAIN_ID,
  );

  assert.equal(
    submissionReservationMatchesDraft(reservation, {
      ...DEFAULT_DRAFT,
    }),
    true,
  );

  assert.equal(
    submissionReservationMatchesDraft(reservation, {
      ...DEFAULT_DRAFT,
      title: "Edited title",
    }),
    false,
  );

  assert.equal(
    submissionReservationMatchesDraft(reservation, {
      ...DEFAULT_DRAFT,
      requiredVoters: 4n,
    }),
    false,
  );
});

test("deriveSubmissionReservationSalt recreates the same salt for the same draft on the same chain", () => {
  const storage = new Map<string, string>();
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const mockWindow = {
    crypto: {
      getRandomValues(target: Uint8Array) {
        target.fill(7);
        return target;
      },
    },
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  try {
    const draft = {
      ...DEFAULT_DRAFT,
    };

    const first = deriveSubmissionReservationSalt(draft, ADDRESS, CHAIN_ID);
    const second = deriveSubmissionReservationSalt(draft, ADDRESS, CHAIN_ID);
    const otherChain = deriveSubmissionReservationSalt(draft, ADDRESS, 42220);

    assert.equal(first, second);
    assert.notEqual(first, otherChain);
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});
