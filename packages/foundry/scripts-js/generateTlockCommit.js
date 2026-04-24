import { Buffer } from "buffer";
import {
  createPublicClient,
  encodePacked,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from "viem";
import { mainnetClient, timelockEncrypt } from "tlock-js";

function usage() {
  console.error(
    "Usage: node scripts-js/generateTlockCommit.js <rpcUrl> <votingEngine> <contentRegistry> <contentId> <isUp:true|false> <saltHex> <voterAddress>"
  );
  process.exit(1);
}

const [rpcUrlArg, votingEngineArg, contentRegistryArg, contentIdArg, isUpArg, saltArg, voterArg] =
  process.argv.slice(2);

if (!rpcUrlArg || !votingEngineArg || !contentRegistryArg || !contentIdArg || !isUpArg || !saltArg || !voterArg) {
  usage();
}

if (isUpArg !== "true" && isUpArg !== "false") {
  usage();
}

const votingEngineAbi = parseAbi([
  "function protocolConfig() view returns (address)",
  "function currentRoundId(uint256 contentId) view returns (uint256)",
  "function previewCommitRoundId(uint256 contentId) view returns (uint256)",
  "function previewCommitReferenceRatingBps(uint256 contentId) view returns (uint16)",
  "function roundConfigSnapshot(uint256 contentId, uint256 roundId) view returns (uint32 epochDuration, uint32 maxDuration, uint16 minVoters, uint16 maxVoters)",
  "function rounds(uint256 contentId, uint256 roundId) view returns (uint48 startTime, uint8 state, uint16 voteCount, uint16 revealedCount, uint64 totalStake, uint64 upPool, uint64 downPool, uint16 upCount, uint16 downCount, bool upWins, uint48 settledAt, uint48 thresholdReachedAt, uint64 weightedUpPool, uint64 weightedDownPool)",
]);
const contentRegistryAbi = parseAbi([
  "function getContentRoundConfig(uint256 contentId) view returns (uint32 epochDuration, uint32 maxDuration, uint16 minVoters, uint16 maxVoters)",
]);
const protocolConfigAbi = parseAbi([
  "function drandChainHash() view returns (bytes32)",
  "function drandGenesisTime() view returns (uint64)",
  "function drandPeriod() view returns (uint64)",
]);

const rpcUrl = rpcUrlArg;
const votingEngine = getAddress(votingEngineArg);
const contentRegistry = getAddress(contentRegistryArg);
const contentId = BigInt(contentIdArg);
const isUp = isUpArg === "true";
const salt = saltArg.startsWith("0x") ? saltArg : `0x${saltArg}`;
const voter = getAddress(voterArg);

if (salt.length !== 66) {
  throw new Error("saltHex must be 32 bytes");
}

function roundAt(timestamp, genesisTime, period) {
  if (period <= 0n || timestamp < genesisTime) return 0n;
  return ((timestamp - genesisTime) / period) + 1n;
}

function roundAtOrAfter(timestamp, genesisTime, period) {
  if (period <= 0n || timestamp < genesisTime) return 0n;
  const elapsed = timestamp - genesisTime;
  return ((elapsed + period - 1n) / period) + 1n;
}

const chainClient = createPublicClient({ transport: http(rpcUrl) });
const protocolConfig = await chainClient.readContract({
  address: votingEngine,
  abi: votingEngineAbi,
  functionName: "protocolConfig",
});
const drandChainHash = await chainClient.readContract({
  address: protocolConfig,
  abi: protocolConfigAbi,
  functionName: "drandChainHash",
});
const drandGenesisTimeRaw = await chainClient.readContract({
  address: protocolConfig,
  abi: protocolConfigAbi,
  functionName: "drandGenesisTime",
});
const drandGenesisTime = BigInt(drandGenesisTimeRaw);
const drandPeriodRaw = await chainClient.readContract({
  address: protocolConfig,
  abi: protocolConfigAbi,
  functionName: "drandPeriod",
});
const drandPeriod = BigInt(drandPeriodRaw);
const roundReferenceRatingBps = await chainClient.readContract({
  address: votingEngine,
  abi: votingEngineAbi,
  functionName: "previewCommitReferenceRatingBps",
  args: [contentId],
});
const previewRoundId = await chainClient.readContract({
  address: votingEngine,
  abi: votingEngineAbi,
  functionName: "previewCommitRoundId",
  args: [contentId],
});
const currentRoundId = await chainClient.readContract({
  address: votingEngine,
  abi: votingEngineAbi,
  functionName: "currentRoundId",
  args: [contentId],
});
const latestBlock = await chainClient.getBlock({ blockTag: "latest" });

let activeRoundStartTime = null;
let epochDuration = 0n;
if (currentRoundId === previewRoundId && currentRoundId > 0n) {
  const round = await chainClient.readContract({
    address: votingEngine,
    abi: votingEngineAbi,
    functionName: "rounds",
    args: [contentId, currentRoundId],
  });
  const [startTime, state] = round;
  if (BigInt(state) === 0n && BigInt(startTime) > 0n) {
    activeRoundStartTime = BigInt(startTime);
  }

  const [snapshotEpochDuration] = await chainClient.readContract({
    address: votingEngine,
    abi: votingEngineAbi,
    functionName: "roundConfigSnapshot",
    args: [contentId, previewRoundId],
  });
  epochDuration = BigInt(snapshotEpochDuration);
}

if (epochDuration === 0n) {
  const [contentEpochDuration] = await chainClient.readContract({
    address: contentRegistry,
    abi: contentRegistryAbi,
    functionName: "getContentRoundConfig",
    args: [contentId],
  });
  epochDuration = BigInt(contentEpochDuration);
}

if (epochDuration <= 0n) {
  throw new Error("Round epochDuration must be greater than zero");
}

if (drandPeriod <= 0n) {
  throw new Error("drandPeriod must be greater than zero");
}

function computeRevealableAfter(timestamp) {
  const roundStartTime = activeRoundStartTime ?? timestamp;
  const elapsed = timestamp > roundStartTime ? timestamp - roundStartTime : 0n;
  const epochIndex = elapsed / epochDuration;
  return roundStartTime + (epochIndex + 1n) * epochDuration;
}

// Match TlockVoteLib.validateCommitData: the target must be between the
// first drand round at/after revealableAfter and the last round within the
// next epoch-duration window. Choose a round from the intersection of the
// latest-block and next-block windows so both gas estimation and mining see
// valid tlock metadata.
let minAcceptedTargetRound = 0n;
let maxAcceptedTargetRound = 0n;
for (const timestamp of [latestBlock.timestamp, latestBlock.timestamp + 1n]) {
  const revealableAfter = computeRevealableAfter(timestamp);
  if (revealableAfter < drandGenesisTime) {
    throw new Error(
      `Revealable timestamp ${revealableAfter} is before drand genesis ${drandGenesisTime}`
    );
  }

  const minTargetRound = roundAtOrAfter(revealableAfter, drandGenesisTime, drandPeriod);
  const maxTargetRound = roundAt(revealableAfter + epochDuration, drandGenesisTime, drandPeriod);
  if (minTargetRound === 0n || maxTargetRound === 0n || minTargetRound > maxTargetRound) {
    throw new Error(
      `No valid drand target round for revealableAfter=${revealableAfter}, epochDuration=${epochDuration}, genesis=${drandGenesisTime}, period=${drandPeriod}`
    );
  }
  if (minTargetRound > minAcceptedTargetRound) minAcceptedTargetRound = minTargetRound;
  if (maxAcceptedTargetRound === 0n || maxTargetRound < maxAcceptedTargetRound) maxAcceptedTargetRound = maxTargetRound;
}

if (minAcceptedTargetRound === 0n || minAcceptedTargetRound > maxAcceptedTargetRound) {
  throw new Error(
    `No shared drand target round for latest and next-block commit windows, min=${minAcceptedTargetRound}, max=${maxAcceptedTargetRound}`
  );
}
const targetRound =
  minAcceptedTargetRound + 1n <= maxAcceptedTargetRound
    ? minAcceptedTargetRound + 1n
    : minAcceptedTargetRound;

const plaintext = Buffer.alloc(33);
plaintext[0] = isUp ? 1 : 0;
Buffer.from(salt.slice(2), "hex").copy(plaintext, 1);

const client = mainnetClient();
const chainInfo = await client.chain().info();
const liveDrandChainHash = `0x${chainInfo.hash}`;
if (
  liveDrandChainHash.toLowerCase() !== drandChainHash.toLowerCase() ||
  BigInt(chainInfo.genesis_time) !== drandGenesisTime ||
  BigInt(chainInfo.period) !== drandPeriod
) {
  throw new Error(
    `On-chain drand config (${drandChainHash}, ${drandGenesisTime}, ${drandPeriod}) does not match tlock-js mainnet chain (${liveDrandChainHash}, ${chainInfo.genesis_time}, ${chainInfo.period})`
  );
}
const armored = await timelockEncrypt(Number(targetRound), plaintext, client);

const ciphertext = `0x${Buffer.from(armored, "utf-8").toString("hex")}`;
const commitHash = keccak256(
  encodePacked(
    ["bool", "bytes32", "address", "uint256", "uint256", "uint16", "uint64", "bytes32", "bytes32"],
    [isUp, salt, voter, contentId, previewRoundId, roundReferenceRatingBps, targetRound, drandChainHash, keccak256(ciphertext)]
  )
);

process.stdout.write(`${commitHash}\n${ciphertext}\n${targetRound}\n${drandChainHash}\n${roundReferenceRatingBps}\n`);
