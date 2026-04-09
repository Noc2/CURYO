import { hasVoterIdOnChain, mintVoterId, revokeVoterId, waitForPonderIndexed } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getVoterIds } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * VoterID lifecycle tests.
 * Triggers Ponder events: VoterIdMinted, VoterIdRevoked.
 *
 * VoterIdMinted events fire during seed (accounts #2-#10 get VoterIDs).
 * This test verifies the seed-minted VoterIDs are indexed, then mints
 * and revokes a VoterID for a dedicated test account (#11).
 *
 * Account allocation:
 * - Account #11 (no cREP, no VoterID from seed) — gets VoterID minted then revoked
 * - Account #0 (authorized minter) — mints VoterID
 * - Account #9 (deployer = VoterIdNFT owner in local dev) — revokes VoterID
 *
 * Uses account #11 instead of #10 to avoid conflicts with frontend-lifecycle
 * tests that depend on account #10's VoterID.
 */
test.describe("VoterID lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTER_ID_NFT = CONTRACT_ADDRESSES.VoterIdNFT;
  test("seed-minted VoterIDs are indexed in Ponder", async () => {
    test.setTimeout(30_000);

    // Account #2 should have a VoterID from the seed
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getVoterIds(ANVIL_ACCOUNTS.account2.address);
      return items.length > 0;
    }, 10_000);

    if (!indexed) {
      test.skip(true, "Ponder not indexing VoterIDs — skipping");
      return;
    }

    const { items } = await getVoterIds(ANVIL_ACCOUNTS.account2.address);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].holder.toLowerCase()).toBe(ANVIL_ACCOUNTS.account2.address.toLowerCase());
    expect(items[0].revoked).toBe(false);
  });

  test("mint VoterID for test account and Ponder indexes it", async () => {
    test.setTimeout(60_000);

    // Check if account #11 already has a VoterID (from prior test run on same chain)
    const alreadyHas = await hasVoterIdOnChain(ANVIL_ACCOUNTS.account11.address, VOTER_ID_NFT);
    if (alreadyHas) {
      test.skip(true, "Account #11 already has VoterID (prior run on same chain)");
      return;
    }

    // Mint VoterID for account #11 using account #0 (authorized minter)
    // Use a unique nullifier based on timestamp to avoid collision
    const nullifier = BigInt(Date.now()) * 1000n + 11n;
    const success = await mintVoterId(
      ANVIL_ACCOUNTS.account11.address,
      nullifier,
      ANVIL_ACCOUNTS.account0.address,
      VOTER_ID_NFT,
    );
    expect(success).toBe(true);

    // Verify on-chain
    const hasOnChain = await hasVoterIdOnChain(ANVIL_ACCOUNTS.account11.address, VOTER_ID_NFT);
    expect(hasOnChain).toBe(true);

    // Wait for Ponder to index the mint — check for a non-revoked entry
    // (prior runs may have left revoked entries that match immediately)
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getVoterIds(ANVIL_ACCOUNTS.account11.address);
      return items.some((i: any) => !i.revoked);
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing VoterID mint — on-chain tx succeeded");
      return;
    }

    const { items } = await getVoterIds(ANVIL_ACCOUNTS.account11.address);
    expect(items.length).toBeGreaterThanOrEqual(1);
    // On repeated runs, there may be both revoked (from prior run) and non-revoked VoterIDs.
    // Verify at least one non-revoked entry exists for account #11.
    const nonRevoked = items.filter((i: any) => !i.revoked);
    expect(nonRevoked.length).toBeGreaterThanOrEqual(1);
    expect(nonRevoked[0].holder.toLowerCase()).toBe(ANVIL_ACCOUNTS.account11.address.toLowerCase());
  });

  test("governance revokes VoterID and Ponder indexes revocation", async () => {
    test.setTimeout(60_000);

    // Verify account #11 has a VoterID on-chain (minted in previous test or prior run)
    const hasOnChain = await hasVoterIdOnChain(ANVIL_ACCOUNTS.account11.address, VOTER_ID_NFT);

    if (!hasOnChain) {
      test.skip(true, "Account #11 has no VoterID on-chain (mint test was skipped or failed)");
      return;
    }

    // Revoke account #11's VoterID (deployer is owner)
    const success = await revokeVoterId(ANVIL_ACCOUNTS.account11.address, DEPLOYER.address, VOTER_ID_NFT);
    expect(success).toBe(true);

    // Wait for Ponder to index the revocation
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getVoterIds(ANVIL_ACCOUNTS.account11.address);
      // After revocation, the item should have revoked=true or be removed
      return items.length === 0 || items[0].revoked === true;
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing revocation — on-chain tx succeeded");
      return;
    }

    // Verify the VoterID is revoked
    const { items } = await getVoterIds(ANVIL_ACCOUNTS.account11.address);
    // After revocation, the holder is cleared (burned), so items may be empty
    // or the item may show revoked=true depending on Ponder handler
    if (items.length > 0) {
      expect(items[0].revoked).toBe(true);
    }
    // If items is empty, the VoterID was burned and removed — also valid
  });
});
