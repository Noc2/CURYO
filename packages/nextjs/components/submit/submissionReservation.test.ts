import {
  buildSubmissionReservationStorageKey,
  buildSubmissionRevealCommitment,
  createStoredSubmissionReservation,
  submissionReservationMatchesDraft,
} from "./submissionReservation";
import assert from "node:assert/strict";
import test from "node:test";

const ADDRESS = "0x00000000000000000000000000000000000000aa" as const;
const SUBMISSION_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const SALT = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

test("buildSubmissionReservationStorageKey stays stable when mutable metadata changes", () => {
  const first = buildSubmissionReservationStorageKey(ADDRESS, SUBMISSION_KEY);
  const second = buildSubmissionReservationStorageKey(ADDRESS, SUBMISSION_KEY);

  assert.equal(first, second);
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
