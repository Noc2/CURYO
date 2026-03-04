import {
  approveCREP,
  approveFrontend,
  deregisterFrontend,
  getFrontendInfoOnChain,
  registerFrontend,
  slashFrontend,
  transferCREP,
  unslashFrontend,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getFrontend } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Frontend lifecycle tests (contract-level).
 * Triggers Ponder events: FrontendRegistered, FrontendApproved, FrontendSlashed,
 * FrontendDeregistered.
 *
 * Account allocation:
 * - Account #8 (VoterID #106, unlocked on Anvil) — registers as frontend operator
 * - Account #9 (deployer = governance in local dev) — funds, approves, slashes
 *
 * Flow: cleanup prior state → register → approve → slash → deregister.
 * Idempotent: if already registered from a prior run, deregisters first.
 */
test.describe("Frontend lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const FRONTEND_REGISTRY = CONTRACT_ADDRESSES.FrontendRegistry;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const OPERATOR = ANVIL_ACCOUNTS.account8.address;
  let registered = false;
  let approved = false;
  let slashed = false;

  test("register frontend and verify in Ponder", async () => {
    test.setTimeout(90_000);

    // Check on-chain if already registered from a prior test run
    const info = await getFrontendInfoOnChain(OPERATOR, FRONTEND_REGISTRY);
    if (info.registered) {
      // Clean up: unslash if needed, then deregister
      if (info.slashed) {
        await unslashFrontend(OPERATOR, DEPLOYER.address, FRONTEND_REGISTRY);
      }
      await deregisterFrontend(OPERATOR, FRONTEND_REGISTRY);
      // Wait for Ponder to index the deregistration
      await waitForPonderIndexed(async () => {
        const chainInfo = await getFrontendInfoOnChain(OPERATOR, FRONTEND_REGISTRY);
        return !chainInfo.registered;
      }, 15_000);
    }

    // Transfer cREP from deployer — need enough for the 1000 stake.
    // After a prior slash + deregister, account #8 may have as few as ~500 cREP,
    // so transfer a full 1000 to guarantee sufficient balance.
    const xferOk = await transferCREP(OPERATOR, BigInt(1000e6), DEPLOYER.address, CREP_TOKEN);
    expect(xferOk, "Transferring cREP from deployer should succeed").toBe(true);

    // Approve cREP for FrontendRegistry (1000 cREP = 1000e6)
    const approveOk = await approveCREP(FRONTEND_REGISTRY, BigInt(1000e6), OPERATOR, CREP_TOKEN);
    expect(approveOk, "Approving cREP should succeed").toBe(true);

    // Register as frontend operator
    const regOk = await registerFrontend(OPERATOR, FRONTEND_REGISTRY);
    expect(regOk, "Frontend registration should succeed").toBe(true);

    // Verify Ponder indexed the registration
    const indexed = await waitForPonderIndexed(async () => {
      try {
        const { frontend } = await getFrontend(OPERATOR);
        return frontend !== undefined && BigInt(frontend.stakedAmount) > 0n;
      } catch {
        return false;
      }
    });
    expect(indexed, "Ponder should index the frontend registration").toBe(true);

    const { frontend } = await getFrontend(OPERATOR);
    expect(frontend.approved).toBe(false);
    expect(frontend.slashed).toBe(false);
    expect(BigInt(frontend.stakedAmount)).toBeGreaterThan(0n);
    registered = true;
  });

  test("admin approves frontend and Ponder indexes approval", async () => {
    test.skip(!registered, "Frontend not registered in previous test");
    test.setTimeout(60_000);

    const success = await approveFrontend(OPERATOR, DEPLOYER.address, FRONTEND_REGISTRY);
    expect(success).toBe(true);

    const indexed = await waitForPonderIndexed(async () => {
      try {
        const { frontend } = await getFrontend(OPERATOR);
        return frontend.approved === true;
      } catch {
        return false;
      }
    });
    expect(indexed, "Ponder should index the frontend approval").toBe(true);

    const { frontend } = await getFrontend(OPERATOR);
    expect(frontend.approved).toBe(true);
    expect(frontend.slashed).toBe(false);
    approved = true;
  });

  test("governance slashes frontend and Ponder indexes slash", async () => {
    test.skip(!approved, "Frontend not approved in previous test");
    test.setTimeout(60_000);

    // Slash 500 cREP
    const slashOk = await slashFrontend(
      OPERATOR,
      BigInt(500e6),
      "E2E test: policy violation",
      DEPLOYER.address,
      FRONTEND_REGISTRY,
    );
    expect(slashOk).toBe(true);

    const indexed = await waitForPonderIndexed(async () => {
      try {
        const { frontend } = await getFrontend(OPERATOR);
        return frontend.slashed === true;
      } catch {
        return false;
      }
    });
    expect(indexed, "Ponder should index the frontend slash").toBe(true);

    const { frontend } = await getFrontend(OPERATOR);
    expect(frontend.slashed).toBe(true);
    expect(frontend.approved).toBe(false);
    // Stake reduced by 500 cREP (500e6)
    expect(BigInt(frontend.stakedAmount)).toBe(BigInt(500e6));
    slashed = true;
  });

  test("operator deregisters frontend and Ponder indexes deregistration", async () => {
    test.skip(!slashed, "Frontend not slashed in previous test");
    test.setTimeout(60_000);

    // deregister() requires !slashed — unslash first
    const unslashOk = await unslashFrontend(OPERATOR, DEPLOYER.address, FRONTEND_REGISTRY);
    expect(unslashOk, "Unslashing frontend should succeed").toBe(true);

    const success = await deregisterFrontend(OPERATOR, FRONTEND_REGISTRY);
    expect(success).toBe(true);

    const indexed = await waitForPonderIndexed(async () => {
      try {
        const { frontend } = await getFrontend(OPERATOR);
        return frontend.stakedAmount === "0";
      } catch {
        return false;
      }
    });
    expect(indexed, "Ponder should index the frontend deregistration").toBe(true);

    const { frontend } = await getFrontend(OPERATOR);
    expect(BigInt(frontend.stakedAmount)).toBe(0n);
  });
});
