import {
  approveCREP,
  commitVoteDirect,
  evmIncreaseTime,
  evmSetTimestamp,
  getActiveRoundId,
  setTestConfig,
  submitContentDirect,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import "../helpers/fetch-shim";
import { getContentById, getContentList, getVotes } from "../helpers/ponder-api";
import { deriveKeeperDecryptWaitMs } from "../helpers/tlockRuntime";
import { ProtocolConfigAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { expect, test } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";

/**
 * Keeper-backed settlement lifecycle.
 *
 * Unlike the direct-call settlement specs, this test does not invoke reveal or
 * settle helpers. It aligns chain time with a short tlock epoch, then waits for
 * the live keeper service to decrypt, reveal, and settle the round.
 */
test.describe("Keeper-backed settlement lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const EPOCH_DURATION = 300;
  const TLOCK_EPOCH = 30;
  const CHAIN_TIME_OFFSET = EPOCH_DURATION - TLOCK_EPOCH;
  const KEEPER_HEALTH_URL = "http://localhost:9090/health";
  const KEEPER_INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 30_000);
  const KEEPER_DECRYPT_BUFFER_MS = 10_000;
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http("http://localhost:8545"),
  });

  test.beforeAll(async () => {
    const keeperRes = await fetch(KEEPER_HEALTH_URL).catch(() => null);
    expect(keeperRes?.ok, "Keeper health check failed. Start it with: yarn keeper:dev").toBe(true);

    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  test("keeper reveals and settles a short-tlock round end to end", async () => {
    test.setTimeout(600_000);

    await evmSetTimestamp(Math.floor(Date.now() / 1000) - CHAIN_TIME_OFFSET);

    const submitter = ANVIL_ACCOUNTS.account10;
    const submitApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitApproved, "Content submission approval failed").toBe(true);

    const uniqueId = Date.now();
    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=keeper_settlement_${uniqueId}`,
      `Keeper Settlement ${uniqueId}`,
      `Keeper settlement description ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    let contentId: string | null = null;
    const indexedContent = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`keeper_settlement_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);
    expect(indexedContent, "Ponder did not index the keeper-backed test content").toBe(true);
    expect(contentId).toBeTruthy();

    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account7, isUp: false },
    ];

    for (const voter of voters) {
      const approved = await approveCREP(VOTING_ENGINE, STAKE, voter.account.address, CREP_TOKEN);
      expect(approved, `Vote approval failed for ${voter.account.address}`).toBe(true);

      const commit = await commitVoteDirect(
        BigInt(contentId!),
        voter.isUp,
        STAKE,
        ZERO_ADDRESS,
        voter.account.address,
        VOTING_ENGINE,
        TLOCK_EPOCH,
      );
      expect(commit.success, `Vote commit failed for ${voter.account.address}`).toBe(true);
    }

    const roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    // Move chain time past the revealable window. The short tlock epoch means
    // the ciphertext should become decryptable shortly after the epoch ends.
    //
    // On heavily seeded Anvil chains, `evmSetTimestamp(realNow - 270s)` cannot move
    // block.timestamp backwards behind the current head, so the later +301s jump can
    // still leave the round a few real minutes ahead of drand wall-clock time.
    // Wait for the latest commit's actual target round instead of assuming the rewind stuck.
    await evmIncreaseTime(EPOCH_DURATION + 1);

    const protocolConfig = await publicClient.readContract({
      address: VOTING_ENGINE,
      abi: RoundVotingEngineAbi,
      functionName: "protocolConfig",
      args: [],
    });
    const [drandGenesisTime, drandPeriod] = await Promise.all([
      publicClient.readContract({
        address: protocolConfig,
        abi: ProtocolConfigAbi,
        functionName: "drandGenesisTime",
        args: [],
      }),
      publicClient.readContract({
        address: protocolConfig,
        abi: ProtocolConfigAbi,
        functionName: "drandPeriod",
        args: [],
      }),
    ]);

    let keeperDecryptWaitMs = 0;
    for (let i = 0n; i < BigInt(voters.length); i++) {
      const commitKey = await publicClient.readContract({
        address: VOTING_ENGINE,
        abi: RoundVotingEngineAbi,
        functionName: "roundCommitHashes",
        args: [BigInt(contentId!), roundId, i],
      });
      const commit = await publicClient.readContract({
        address: VOTING_ENGINE,
        abi: RoundVotingEngineAbi,
        functionName: "commits",
        args: [BigInt(contentId!), roundId, commitKey],
      });

      keeperDecryptWaitMs = Math.max(
        keeperDecryptWaitMs,
        deriveKeeperDecryptWaitMs({
          wallClockNowSeconds: Math.floor(Date.now() / 1000),
          revealableAfterSeconds: commit[6],
          targetRound: commit[3],
          drandGenesisTimeSeconds: drandGenesisTime,
          drandPeriodSeconds: drandPeriod,
          keeperIntervalMs: KEEPER_INTERVAL_MS,
          extraBufferMs: KEEPER_DECRYPT_BUFFER_MS,
        }),
      );
    }

    if (keeperDecryptWaitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, keeperDecryptWaitMs));
    }

    const settledIndexed = await waitForPonderIndexed(
      async () => {
        const data = await getContentById(contentId!);
        const round = data.rounds.find(item => item.roundId === String(roundId));
        return round !== undefined && round.state === 1;
      },
      150_000,
      2_000,
      "keeper-settlement:settled",
    );
    expect(settledIndexed, "Keeper did not settle the round within the timeout").toBe(true);

    const revealedVotesIndexed = await waitForPonderIndexed(
      async () => {
        const { items } = await getVotes({ contentId: contentId! });
        return items.filter(item => item.roundId === String(roundId)).length === voters.length;
      },
      60_000,
      2_000,
      "keeper-settlement:revealedVotes",
    );
    expect(revealedVotesIndexed, "Ponder did not index the keeper-revealed votes").toBe(true);

    const data = await getContentById(contentId!);
    const round = data.rounds.find(item => item.roundId === String(roundId));

    expect(round).toBeTruthy();
    expect(round!.state).toBe(1);
    expect(round!.upWins).toBe(true);
    expect(Number(round!.voteCount)).toBe(voters.length);
    expect(data.ratings.length).toBeGreaterThanOrEqual(1);
  });
});
