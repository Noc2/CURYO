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
      categoryId: 1n,
      description: "first description",
      submissionKey: SUBMISSION_KEY,
      tags: "alpha,beta",
      title: "First title",
      url: "https://example.com/demo",
    },
    SALT,
    ADDRESS,
  );

  const edited = buildSubmissionRevealCommitment(
    {
      categoryId: 1n,
      description: "edited description",
      submissionKey: SUBMISSION_KEY,
      tags: "alpha,beta",
      title: "First title",
      url: "https://example.com/demo",
    },
    SALT,
    ADDRESS,
  );

  assert.notEqual(initial, edited);
});

test("submissionReservationMatchesDraft only reuses reservations for the exact same draft", () => {
  const reservation = createStoredSubmissionReservation(
    {
      categoryId: 1n,
      description: "first description",
      submissionKey: SUBMISSION_KEY,
      tags: "alpha,beta",
      title: "First title",
      url: "https://example.com/demo",
    },
    SALT,
    buildSubmissionRevealCommitment(
      {
        categoryId: 1n,
        description: "first description",
        submissionKey: SUBMISSION_KEY,
        tags: "alpha,beta",
        title: "First title",
        url: "https://example.com/demo",
      },
      SALT,
      ADDRESS,
    ),
    CHAIN_ID,
  );

  assert.equal(
    submissionReservationMatchesDraft(reservation, {
      categoryId: 1n,
      description: "first description",
      submissionKey: SUBMISSION_KEY,
      tags: "alpha,beta",
      title: "First title",
      url: "https://example.com/demo",
    }),
    true,
  );

  assert.equal(
    submissionReservationMatchesDraft(reservation, {
      categoryId: 1n,
      description: "first description",
      submissionKey: SUBMISSION_KEY,
      tags: "alpha,beta",
      title: "Edited title",
      url: "https://example.com/demo",
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
      categoryId: 1n,
      description: "first description",
      submissionKey: SUBMISSION_KEY,
      tags: "alpha,beta",
      title: "First title",
      url: "https://example.com/demo",
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
