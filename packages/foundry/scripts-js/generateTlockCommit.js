import { Buffer } from "buffer";
import {
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  parseAbi,
} from "viem";
import { mainnetClient, timelockEncrypt } from "tlock-js";

function usage() {
  console.error(
    "Usage: node scripts-js/generateTlockCommit.js <rpcUrl> <votingEngine> <contentId> <isUp:true|false> <saltHex>"
  );
  process.exit(1);
}

const [rpcUrlArg, votingEngineArg, contentIdArg, isUpArg, saltArg] =
  process.argv.slice(2);

if (!rpcUrlArg || !votingEngineArg || !contentIdArg || !isUpArg || !saltArg) {
  usage();
}

if (isUpArg !== "true" && isUpArg !== "false") {
  usage();
}

const votingEngineAbi = parseAbi([
  "function protocolConfig() view returns (address)",
  "function currentRoundId(uint256 contentId) view returns (uint256)",
  "function rounds(uint256 contentId, uint256 roundId) view returns (uint48 startTime, uint8 state, uint16 voteCount, uint16 revealedCount, uint64 totalStake, uint64 upPool, uint64 downPool, uint16 upCount, uint16 downCount, bool upWins, uint48 settledAt, uint48 thresholdReachedAt, uint64 weightedUpPool, uint64 weightedDownPool)",
]);
const protocolConfigAbi = parseAbi([
  "function config() view returns (uint32 epochDuration, uint32 maxDuration, uint16 minVoters, uint16 maxVoters)",
  "function drandChainHash() view returns (bytes32)",
  "function drandGenesisTime() view returns (uint64)",
  "function drandPeriod() view returns (uint64)",
]);

const rpcUrl = rpcUrlArg;
const votingEngine = votingEngineArg;
const contentId = BigInt(contentIdArg);
const isUp = isUpArg === "true";
const salt = saltArg.startsWith("0x") ? saltArg : `0x${saltArg}`;

if (salt.length !== 66) {
  throw new Error("saltHex must be 32 bytes");
}

const chainClient = createPublicClient({ transport: http(rpcUrl) });
const protocolConfig = await chainClient.readContract({
  address: votingEngine,
  abi: votingEngineAbi,
  functionName: "protocolConfig",
});
const [epochDurationRaw] = await chainClient.readContract({
  address: protocolConfig,
  abi: protocolConfigAbi,
  functionName: "config",
});
const epochDuration = BigInt(epochDurationRaw);
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
const currentRoundId = await chainClient.readContract({
  address: votingEngine,
  abi: votingEngineAbi,
  functionName: "currentRoundId",
  args: [contentId],
});
const latestBlock = await chainClient.getBlock({ blockTag: "latest" });
const commitTimestamp = latestBlock.timestamp + 1n;

let roundStartTime = commitTimestamp;
if (currentRoundId > 0n) {
  const round = await chainClient.readContract({
    address: votingEngine,
    abi: votingEngineAbi,
    functionName: "rounds",
    args: [contentId, currentRoundId],
  });
  const [startTime, state] = round;
  if (BigInt(state) === 0n && BigInt(startTime) > 0n) {
    roundStartTime = BigInt(startTime);
  }
}

const elapsed = commitTimestamp - roundStartTime;
const epochIndex = elapsed / epochDuration;
const revealableAfter = roundStartTime + (epochIndex + 1n) * epochDuration;
if (revealableAfter < drandGenesisTime) {
  throw new Error(
    `Revealable timestamp ${revealableAfter} is before drand genesis ${drandGenesisTime}`
  );
}
const targetRound =
  ((revealableAfter - drandGenesisTime) / drandPeriod) + 1n;

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
    ["bool", "bytes32", "uint256", "uint64", "bytes32", "bytes32"],
    [isUp, salt, contentId, targetRound, drandChainHash, keccak256(ciphertext)]
  )
);

process.stdout.write(`${commitHash}\n${ciphertext}\n${targetRound}\n${drandChainHash}\n`);
