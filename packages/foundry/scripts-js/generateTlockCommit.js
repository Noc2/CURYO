import { Buffer } from "buffer";
import { encodePacked, keccak256 } from "viem";
import { mainnetClient, roundAt, timelockEncrypt } from "tlock-js";

function usage() {
  console.error(
    "Usage: node scripts-js/generateTlockCommit.js <contentId> <isUp:true|false> <saltHex> [epochDurationSeconds]"
  );
  process.exit(1);
}

const [contentIdArg, isUpArg, saltArg, epochDurationArg = "1200"] =
  process.argv.slice(2);

if (!contentIdArg || !isUpArg || !saltArg) {
  usage();
}

if (isUpArg !== "true" && isUpArg !== "false") {
  usage();
}

const contentId = BigInt(contentIdArg);
const isUp = isUpArg === "true";
const salt = saltArg.startsWith("0x") ? saltArg : `0x${saltArg}`;
const epochDurationSeconds = Number.parseInt(epochDurationArg, 10);

if (!Number.isInteger(epochDurationSeconds) || epochDurationSeconds <= 0) {
  usage();
}

if (salt.length !== 66) {
  throw new Error("saltHex must be 32 bytes");
}

const plaintext = Buffer.alloc(33);
plaintext[0] = isUp ? 1 : 0;
Buffer.from(salt.slice(2), "hex").copy(plaintext, 1);

const client = mainnetClient();
const chainInfo = await client.chain().info();
const targetRound = roundAt(
  Date.now() + epochDurationSeconds * 1000,
  chainInfo
);
const armored = await timelockEncrypt(targetRound, plaintext, client);

const ciphertext = `0x${Buffer.from(armored, "utf-8").toString("hex")}`;
const commitHash = keccak256(
  encodePacked(
    ["bool", "bytes32", "uint256", "bytes32"],
    [isUp, salt, contentId, keccak256(ciphertext)]
  )
);

process.stdout.write(`${commitHash}\n${ciphertext}\n`);
