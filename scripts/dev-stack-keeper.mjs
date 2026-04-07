export function getMissingKeeperEnvVars(env) {
  const missing = [];

  if (!env.RPC_URL?.trim()) {
    missing.push("RPC_URL");
  }
  if (!env.CHAIN_ID?.trim()) {
    missing.push("CHAIN_ID");
  }

  const hasKeystoreAccount = Boolean(env.KEYSTORE_ACCOUNT?.trim());
  const hasKeystorePassword = Boolean(env.KEYSTORE_PASSWORD?.trim());
  const hasPrivateKey = Boolean(env.KEEPER_PRIVATE_KEY?.trim());

  if (!hasKeystoreAccount && !hasPrivateKey) {
    missing.push("KEYSTORE_ACCOUNT or KEEPER_PRIVATE_KEY");
  }
  if (hasKeystoreAccount && !hasKeystorePassword && !hasPrivateKey) {
    missing.push("KEYSTORE_PASSWORD");
  }

  return missing;
}
