import { Buffer } from "buffer";
import { mainnetClient, roundAt, timelockEncrypt } from "tlock-js";

const client = mainnetClient();

/**
 * Encrypt a vote direction + salt using drand tlock.
 * Payload: 33 bytes = [uint8 isUp (0|1), bytes32 salt]
 * contentId is omitted — already bound to the commitHash.
 *
 * @param isUp - Vote direction
 * @param salt - 32-byte hex salt (0x-prefixed)
 * @param epochDurationSeconds - Epoch duration from contract config
 * @returns hex-encoded ciphertext (armored AGE string as UTF-8 bytes)
 */
export async function tlockEncryptVote(
  isUp: boolean,
  salt: `0x${string}`,
  epochDurationSeconds: number,
): Promise<`0x${string}`> {
  // Build 33-byte plaintext: [uint8 direction, bytes32 salt]
  const plaintext = Buffer.alloc(33);
  plaintext[0] = isUp ? 1 : 0;
  const saltBytes = Buffer.from(salt.slice(2), "hex");
  saltBytes.copy(plaintext, 1);

  // Target drand round: current time + epoch duration
  const chainInfo = await client.chain().info();
  const targetTime = Date.now() + epochDurationSeconds * 1000;
  const targetRound = roundAt(targetTime, chainInfo);

  // Encrypt — returns armored AGE string
  const armored = await timelockEncrypt(targetRound, plaintext, client);

  // Encode armored string as hex bytes for on-chain storage
  const armoredBytes = Buffer.from(armored, "utf-8");
  return `0x${armoredBytes.toString("hex")}` as `0x${string}`;
}
