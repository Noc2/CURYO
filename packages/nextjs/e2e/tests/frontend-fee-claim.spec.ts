import {
  approveCREP,
  approveFrontend,
  claimFrontendFee,
  claimFrontendFees,
  commitVoteDirect,
  evmIncreaseTime,
  getActiveRoundId,
  getFrontendAccumulatedFees,
  mintVoterId,
  readTokenBalance,
  registerFrontend,
  revealVoteDirect,
  setTestConfig,
  settleRoundDirect,
  slashFrontend,
  submitContentDirect,
  transferCREP,
  unslashFrontend,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Frontend fee claims after settlement.
 *
 * Uses fresh impersonated frontend addresses per test run so the suite does not
 * depend on the frontend lifecycle spec's registration state or unbonding flow.
 */
test.describe("Frontend fee claim lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const FRONTEND_REGISTRY = CONTRACT_ADDRESSES.FrontendRegistry;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const VOTER_ID_NFT = CONTRACT_ADDRESSES.VoterIdNFT;
  const STAKE = BigInt(10e6);
  const FRONTEND_STAKE = BigInt(1000e6);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const EPOCH_DURATION = 300;

  // Shared across serial tests — set by test 1, consumed by test 3.
  let withdrawableFrontend: `0x${string}` | null = null;

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  function frontendAddressFor(seed: number): `0x${string}` {
    return `0x${seed.toString(16).padStart(40, "0")}` as `0x${string}`;
  }

  async function setupApprovedFrontend(frontendAddress: `0x${string}`, nullifier: bigint): Promise<void> {
    // Fund the impersonated frontend address with ETH for gas
    await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "anvil_setBalance",
        params: [frontendAddress, "0x21E19E0C9BAB2400000"], // 10,000 ETH
        id: Date.now(),
      }),
    });

    const minted = await mintVoterId(frontendAddress, nullifier, ANVIL_ACCOUNTS.account0.address, VOTER_ID_NFT);
    expect(minted, `Failed to mint Voter ID for ${frontendAddress}`).toBe(true);

    const funded = await transferCREP(frontendAddress, FRONTEND_STAKE, DEPLOYER.address, CREP_TOKEN);
    expect(funded, `Failed to fund frontend ${frontendAddress}`).toBe(true);

    const approved = await approveCREP(FRONTEND_REGISTRY, FRONTEND_STAKE, frontendAddress, CREP_TOKEN);
    expect(approved, `Failed to approve cREP for frontend ${frontendAddress}`).toBe(true);

    const registered = await registerFrontend(frontendAddress, FRONTEND_REGISTRY);
    expect(registered, `Failed to register frontend ${frontendAddress}`).toBe(true);

    const governanceApproved = await approveFrontend(frontendAddress, DEPLOYER.address, FRONTEND_REGISTRY);
    expect(governanceApproved, `Failed to approve frontend ${frontendAddress}`).toBe(true);
  }

  async function settleRoundWithFrontend(
    frontendAddress: `0x${string}`,
    uniqueId: number,
  ): Promise<{
    contentId: string;
    roundId: bigint;
  }> {
    const submitter = ANVIL_ACCOUNTS.account10;
    const submitApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitApproved, "Content submission approval failed").toBe(true);

    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=frontend_fee_${uniqueId}`,
      `Frontend Fee ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    let contentId: string | null = null;
    const indexedContent = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`frontend_fee_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);
    expect(indexedContent, "Ponder did not index the frontend-fee test content").toBe(true);
    expect(contentId).toBeTruthy();

    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account7, isUp: false },
    ];

    const commits: { commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }[] = [];

    for (const voter of voters) {
      const approved = await approveCREP(VOTING_ENGINE, STAKE, voter.account.address, CREP_TOKEN);
      expect(approved, `Vote approval failed for ${voter.account.address}`).toBe(true);

      const commit = await commitVoteDirect(
        BigInt(contentId!),
        voter.isUp,
        STAKE,
        frontendAddress,
        voter.account.address,
        VOTING_ENGINE,
      );
      expect(commit.success, `Vote commit failed for ${voter.account.address}`).toBe(true);
      commits.push({ commitKey: commit.commitKey, isUp: commit.isUp, salt: commit.salt });
    }

    const roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    await evmIncreaseTime(EPOCH_DURATION + 1);

    for (const commit of commits) {
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        roundId,
        commit.commitKey,
        commit.isUp,
        commit.salt,
        ANVIL_ACCOUNTS.account1.address,
        VOTING_ENGINE,
      );
      expect(revealed).toBe(true);
    }

    await evmIncreaseTime(EPOCH_DURATION + 1);
    const settled = await settleRoundDirect(
      BigInt(contentId!),
      roundId,
      ANVIL_ACCOUNTS.account1.address,
      VOTING_ENGINE,
    );
    expect(settled, "Frontend-fee round did not settle").toBe(true);

    return { contentId: contentId!, roundId };
  }

  test("approved frontend accrues claimable fees after settlement", async () => {
    test.setTimeout(180_000);

    const uniqueId = Date.now();
    const frontendAddress = frontendAddressFor(uniqueId);
    await setupApprovedFrontend(frontendAddress, BigInt(uniqueId));

    const { contentId, roundId } = await settleRoundWithFrontend(frontendAddress, uniqueId);

    const feesBefore = await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY);
    const claimed = await claimFrontendFee(
      BigInt(contentId),
      roundId,
      frontendAddress,
      DEPLOYER.address,
      VOTING_ENGINE,
    );
    expect(claimed, "Frontend fee claim should succeed for an approved frontend").toBe(true);

    const feesAfter = await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY);
    expect(feesAfter).toBeGreaterThan(feesBefore);

    // Save for the claimFees withdrawal test
    withdrawableFrontend = frontendAddress;

    const doubleClaim = await claimFrontendFee(
      BigInt(contentId),
      roundId,
      frontendAddress,
      DEPLOYER.address,
      VOTING_ENGINE,
    );
    expect(doubleClaim, "Frontend fee should not be claimable twice").toBe(false);
  });

  test("slashed frontend fees stay frozen until unslashed", async () => {
    test.setTimeout(180_000);

    const uniqueId = Date.now() + 1;
    const frontendAddress = frontendAddressFor(uniqueId);
    await setupApprovedFrontend(frontendAddress, BigInt(uniqueId));

    const { contentId, roundId } = await settleRoundWithFrontend(frontendAddress, uniqueId);

    const slashOk = await slashFrontend(
      frontendAddress,
      BigInt(100e6),
      "E2E test: slash before fee claim",
      DEPLOYER.address,
      FRONTEND_REGISTRY,
    );
    expect(slashOk, "Frontend slash should succeed").toBe(true);

    const feesBefore = await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY);
    const claimed = await claimFrontendFee(
      BigInt(contentId),
      roundId,
      frontendAddress,
      DEPLOYER.address,
      VOTING_ENGINE,
    );
    expect(claimed, "Slashed frontend fee claim should fail").toBe(false);
    expect(await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY)).toBe(feesBefore);

    const unslashed = await unslashFrontend(frontendAddress, DEPLOYER.address, FRONTEND_REGISTRY);
    expect(unslashed, "Frontend unslash should succeed").toBe(true);

    const claimedAfterUnslash = await claimFrontendFee(
      BigInt(contentId),
      roundId,
      frontendAddress,
      DEPLOYER.address,
      VOTING_ENGINE,
    );
    expect(claimedAfterUnslash, "Frontend fee claim should succeed after unslash").toBe(true);
    // claimFrontendFee credits fees to FrontendRegistry (pull-based), not directly to the wallet.
    expect(await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY)).toBeGreaterThan(feesBefore);
  });

  test("operator withdraws accumulated fees via claimFees()", async () => {
    test.setTimeout(60_000);

    // Uses the frontend from test 1 which already has credited fees.
    expect(withdrawableFrontend, "No frontend with credited fees from prior test").toBeTruthy();
    const frontendAddress = withdrawableFrontend!;

    const accumulatedBefore = await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY);
    expect(accumulatedBefore, "Frontend should have accumulated fees to withdraw").toBeGreaterThan(0n);

    const walletBefore = await readTokenBalance(frontendAddress, CREP_TOKEN);

    const withdrawn = await claimFrontendFees(frontendAddress, FRONTEND_REGISTRY);
    expect(withdrawn, "claimFees() should succeed for approved frontend with fees").toBe(true);

    // Accumulated fees should be zeroed after withdrawal
    const accumulatedAfter = await getFrontendAccumulatedFees(frontendAddress, FRONTEND_REGISTRY);
    expect(accumulatedAfter).toBe(0n);

    // Operator wallet should have received the cREP
    const walletAfter = await readTokenBalance(frontendAddress, CREP_TOKEN);
    expect(walletAfter - walletBefore).toBe(accumulatedBefore);

    // Double withdrawal should revert (no fees remaining)
    const doubleWithdraw = await claimFrontendFees(frontendAddress, FRONTEND_REGISTRY);
    expect(doubleWithdraw, "claimFees() should revert when no fees remain").toBe(false);
  });
});
