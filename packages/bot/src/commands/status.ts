import { publicClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { ponder } from "../ponder.js";
import { formatEther } from "viem";
import { ProtocolConfigAbi } from "@curyo/contracts/abis";
import type { BotIdentityConfig } from "../config.js";

async function showIdentity(label: string, identity: BotIdentityConfig) {
  let account: { address: `0x${string}` } | null = null;
  try {
    account = getAccount(identity);
  } catch {
    // No wallet configured
  }

  console.log(`=== ${label} ===`);
  if (!account) {
    console.log(`  Address:  NOT CONFIGURED`);
    console.log(`  Voter ID: —`);
    console.log(`  cREP:     —`);
    console.log(`  CELO:     —`);
    console.log("");
    return;
  }

  console.log(`  Address:  ${account.address}`);

  try {
    const hasVoterId = await publicClient.readContract({
      ...contractConfig.voterIdNFT,
      functionName: "hasVoterId",
      args: [account.address],
    });
    console.log(`  Voter ID: ${hasVoterId ? "YES" : "NO (required for voting and submission)"}`);
  } catch (err: any) {
    console.log(`  Voter ID: ERROR (${err.message})`);
  }

  try {
    const curyoBalance = await publicClient.readContract({
      ...contractConfig.token,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`  cREP:     ${Number(curyoBalance) / 1e6} cREP`);
  } catch (err: any) {
    console.log(`  cREP:     ERROR (${err.message})`);
  }

  try {
    const celoBalance = await publicClient.getBalance({ address: account.address });
    console.log(`  CELO:     ${formatEther(celoBalance)} CELO`);
  } catch (err: any) {
    console.log(`  CELO:     ERROR (${err.message})`);
  }

  console.log("");
}

async function readRoundConfig() {
  const protocolConfigAddress = (await publicClient.readContract({
    ...contractConfig.votingEngine,
    functionName: "protocolConfig",
    args: [],
  })) as `0x${string}`;

  return publicClient.readContract({
    address: protocolConfigAddress,
    abi: ProtocolConfigAbi,
    functionName: "config",
    args: [],
  });
}

export async function runStatus() {
  console.log(`\n=== Curyo Bot Status ===\n`);
  console.log(`RPC:      ${config.rpcUrl}`);
  console.log(`Chain ID: ${config.chainId}`);
  console.log("");

  await showIdentity("Submission Bot", config.submitBot);
  await showIdentity("Rating Bot", config.rateBot);

  // Round config
  try {
    const [epochDuration, maxDuration, minVoters, maxVoters] = await readRoundConfig();

    console.log(`=== Round Config ===`);
    console.log(`Epoch dur:  ${Number(epochDuration) / 60}m (tlock tier window)`);
    console.log(`Max dur:  ${Number(maxDuration) / 86400} days`);
    console.log(`Min vote: ${minVoters} voters to settle`);
    console.log(`Max vote: ${maxVoters} voters per round`);
    console.log(`Cooldown: 24 hours`);
  } catch (err: any) {
    console.log(`Round config: ERROR (${err.message})`);
  }

  // Ponder
  console.log("");
  const ponderAvailable = await ponder.isAvailable();
  console.log(`Ponder:   ${ponderAvailable ? "ONLINE" : "OFFLINE"} (${config.ponderUrl})`);

  // Config summary
  console.log("");
  console.log(`=== Config ===`);
  console.log(`Vote stake:      ${Number(config.voteStake) / 1e6} cREP`);
  console.log(`Vote threshold:  ${config.voteThreshold}`);
  console.log(`Max votes/run:   ${config.maxVotesPerRun}`);
  console.log(`Max submit/run:  ${config.maxSubmissionsPerRun}`);
  console.log(`Max submit/cat:  ${config.maxSubmissionsPerCategory}`);
  console.log(`TMDB API key:    ${config.tmdbApiKey ? "set" : "NOT SET"}`);
  console.log(`YouTube API key: ${config.youtubeApiKey ? "set" : "NOT SET"}`);
  console.log(`Twitch client:   ${config.twitchClientId ? "set" : "NOT SET"}`);
  console.log(`GitHub token:    ${config.githubToken ? "set" : "NOT SET"}`);
  console.log("");
}
