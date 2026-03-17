import { timelockDecrypt, mainnetClient } from "tlock-js";

const tlockClient = mainnetClient();

/**
 * Decrypt a tlock-encrypted ciphertext using the drand beacon.
 * Ciphertext on-chain is hex-encoded UTF-8 armored AGE string.
 * Plaintext is 33 bytes: [uint8 isUp (0|1), bytes32 salt].
 */
export async function decryptTlockCiphertext(
  ciphertext: `0x${string}`,
): Promise<{ isUp: boolean; salt: `0x${string}` } | null> {
  const hex = ciphertext.startsWith("0x") ? ciphertext.slice(2) : ciphertext;
  const armored = Buffer.from(hex, "hex").toString("utf-8");

  const plaintext = await timelockDecrypt(armored, tlockClient);
  if (plaintext.length !== 33) return null;

  const isUp = plaintext[0] === 1;
  const salt = `0x${plaintext.subarray(1, 33).toString("hex")}` as `0x${string}`;
  return { isUp, salt };
}
