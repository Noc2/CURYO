import { getRecoveryReason, shouldRecover } from "./devWithRecovery.mjs";

describe("devWithRecovery", () => {
  test("recovers from PGlite corruption", () => {
    const output = "RuntimeError: Aborted()\n@electric-sql/pglite\nInitWalRecovery";

    expect(shouldRecover(output)).toBe(true);
    expect(getRecoveryReason(output)).toBe("corrupted PGlite state");
  });

  test("recovers from local hardhat chain rewind errors", () => {
    const output = 'BlockNotFoundError: Block at number "235" could not be found.';

    expect(
      shouldRecover(output, {
        PONDER_NETWORK: "hardhat",
        PONDER_RPC_URL_31337: "http://127.0.0.1:8545",
      }),
    ).toBe(true);
    expect(
      getRecoveryReason(output, {
        PONDER_NETWORK: "hardhat",
        PONDER_RPC_URL_31337: "http://127.0.0.1:8545",
      }),
    ).toBe("stale local Ponder sync state after the hardhat/anvil chain was reset");
  });

  test("does not auto-reset for block-not-found on non-local networks", () => {
    const output = 'BlockNotFoundError: Block at number "235" could not be found.';

    expect(
      shouldRecover(output, {
        PONDER_NETWORK: "celoSepolia",
        PONDER_RPC_URL_11142220: "https://forno.celo-sepolia.celo-testnet.org",
      }),
    ).toBe(false);
    expect(
      getRecoveryReason(output, {
        PONDER_NETWORK: "celoSepolia",
        PONDER_RPC_URL_11142220: "https://forno.celo-sepolia.celo-testnet.org",
      }),
    ).toBeNull();
  });
});
