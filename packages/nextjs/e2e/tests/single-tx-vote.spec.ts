import {
  approveCREP,
  commitVoteWithTransferAndCallDirect,
  getActiveRoundId,
  submitContentDirect,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

test.describe("Single-transaction vote flow", () => {
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const STAKE = BigInt(5e6);

  test("transferAndCall commits a vote without a prior approval tx", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;
    const voter = ANVIL_ACCOUNTS.account4;
    const submitStakeApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitStakeApproved, "Submission stake approval failed").toBe(true);

    const uniqueId = Date.now();
    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=single_tx_vote_${uniqueId}`,
      `Single Tx Vote ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    let contentId: string | null = null;
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`single_tx_vote_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 60_000);
    expect(indexed, "Content was not indexed by Ponder").toBe(true);
    expect(contentId).toBeTruthy();

    const commit = await commitVoteWithTransferAndCallDirect(
      BigInt(contentId!),
      true,
      STAKE,
      ZERO_ADDRESS,
      voter.address,
      CREP_TOKEN,
      VOTING_ENGINE,
    );
    expect(commit.success, "Single-transaction transferAndCall vote should succeed").toBe(true);

    const roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId > 0n, "Vote should create or join an active round").toBe(true);
  });
});
