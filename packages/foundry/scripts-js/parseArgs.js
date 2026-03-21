import { spawnSync } from "child_process";
import { config } from "dotenv";
import { join, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import { parse } from "toml";
import { fileURLToPath } from "url";
import { DEPLOY_HELP_TEXT, parseDeployArgs } from "./deployArgs.js";
import { selectOrCreateKeystore } from "./selectOrCreateKeystore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

// Get all arguments after the script name
const args = process.argv.slice(2);
let network;
let keystoreArg;
let resume;

try {
  const parsedArgs = parseDeployArgs(args);
  if (parsedArgs.showHelp) {
    console.log(DEPLOY_HELP_TEXT);
    process.exit(0);
  }
  network = parsedArgs.network;
  keystoreArg = parsedArgs.keystoreArg;
  resume = parsedArgs.resume;
} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
}

// Function to check if a keystore exists
function validateKeystore(keystoreName) {
  if (keystoreName === "scaffold-eth-default") {
    return true; // Default keystore is always valid
  }

  const keystorePath = join(
    process.env.HOME,
    ".foundry",
    "keystores",
    keystoreName
  );
  return existsSync(keystorePath);
}

// Check if the network exists in rpc_endpoints
try {
  const foundryTomlPath = join(__dirname, "..", "foundry.toml");
  const tomlString = readFileSync(foundryTomlPath, "utf-8");
  const parsedToml = parse(tomlString);

  if (!parsedToml.rpc_endpoints[network]) {
    console.log(
      `\n❌ Error: Network '${network}' not found in foundry.toml!`,
      "\nPlease check `foundry.toml` for available networks in the [rpc_endpoints] section or add a new network."
    );
    process.exit(1);
  }
} catch (error) {
  console.error("\n❌ Error reading or parsing foundry.toml:", error);
  process.exit(1);
}

if (
  process.env.LOCALHOST_KEYSTORE_ACCOUNT !== "scaffold-eth-default" &&
  network === "localhost"
) {
  console.log(`
⚠️ Warning: Using ${process.env.LOCALHOST_KEYSTORE_ACCOUNT} keystore account on localhost.

You can either:
1. Enter the password for ${process.env.LOCALHOST_KEYSTORE_ACCOUNT} account
   OR
2. Set the localhost keystore account in your .env and re-run the command to skip password prompt:
   LOCALHOST_KEYSTORE_ACCOUNT='scaffold-eth-default'
`);
}

let selectedKeystore = process.env.LOCALHOST_KEYSTORE_ACCOUNT;
if (network !== "localhost") {
  if (keystoreArg) {
    // Use the keystore provided via command line argument
    if (!validateKeystore(keystoreArg)) {
      console.log(`\n❌ Error: Keystore '${keystoreArg}' not found!`);
      console.log(
        `Please check that the keystore exists in ~/.foundry/keystores/`
      );
      process.exit(1);
    }
    selectedKeystore = keystoreArg;
    console.log(`\n🔑 Using keystore: ${selectedKeystore}`);
  } else {
    try {
      selectedKeystore = await selectOrCreateKeystore();
    } catch (error) {
      console.error("\n❌ Error selecting keystore:", error);
      process.exit(1);
    }
  }
} else if (keystoreArg) {
  // Allow overriding the localhost keystore with --keystore flag
  if (!validateKeystore(keystoreArg)) {
    console.log(`\n❌ Error: Keystore '${keystoreArg}' not found!`);
    console.log(
      `Please check that the keystore exists in ~/.foundry/keystores/`
    );
    process.exit(1);
  }
  selectedKeystore = keystoreArg;
  console.log(
    `\n🔑 Using keystore: ${selectedKeystore} for localhost deployment`
  );
}

// Check for default account on live network
if (selectedKeystore === "scaffold-eth-default" && network !== "localhost") {
  console.log(`
❌ Error: Cannot deploy to live network using default keystore account!

To deploy to ${network}, please follow these steps:

1. If you haven't generated a keystore account yet:
   $ yarn generate

2. Run the deployment command again.

The default account (scaffold-eth-default) can only be used for localhost deployments.
`);
  process.exit(0);
}

// Set environment variables for the make command
process.env.DEPLOY_SCRIPT = "script/Deploy.s.sol";
process.env.RPC_URL = network;
process.env.ETH_KEYSTORE_ACCOUNT = selectedKeystore;
process.env.RESUME_FLAG = resume ? "--resume" : "";

// Blockscout networks — forge's built-in Celoscan URL returns 403 and the
// [etherscan] override in foundry.toml is ignored. Skip auto-verification;
// verify manually via: make verify-blockscout CONTRACT_ADDRESS=0x... CONTRACT_NAME=MyContract
const BLOCKSCOUT_NETWORKS = new Set(["celoSepolia", "celo"]);
const SLOW_BROADCAST_NETWORKS = new Set(["celoSepolia", "celo"]);
process.env.DEPLOY_FLOW_FLAGS = SLOW_BROADCAST_NETWORKS.has(network)
  ? "--slow"
  : "";

if (resume) {
  console.log("\n⏯️  Resuming previous broadcast state");
}

if (SLOW_BROADCAST_NETWORKS.has(network)) {
  console.log(
    `\n🐢 Using slow broadcast mode for ${network} to avoid sequencer nonce issues`
  );
}

// Determine verification flags based on network's explorer config
if (network !== "localhost") {
  if (BLOCKSCOUT_NETWORKS.has(network)) {
    process.env.VERIFY_FLAGS = "";
    // Suppress Forge's built-in etherscan lookups (Celoscan returns 403 for Celo chains)
    const existing = process.env.RUST_LOG || "";
    process.env.RUST_LOG = existing
      ? `${existing},etherscan=off`
      : "etherscan=off";
    console.log(
      `\n⚠️  Skipping auto-verification for ${network} (Celoscan returns 403)`
    );
    console.log(
      `   Verify after deploy: make verify-blockscout CONTRACT_ADDRESS=0x... CONTRACT_NAME=MyContract`
    );
  } else {
    try {
      const foundryTomlPath = join(__dirname, "..", "foundry.toml");
      const tomlString = readFileSync(foundryTomlPath, "utf-8");
      const parsedToml = parse(tomlString);
      const etherscanConfig = parsedToml.etherscan?.[network];

      if (etherscanConfig) {
        process.env.VERIFY_FLAGS = "--verify";
        console.log(`\n🔍 Verification: using Etherscan-compatible API`);
      } else {
        process.env.VERIFY_FLAGS = "";
        console.log(
          `\n⚠️  No explorer config for '${network}' — skipping verification`
        );
      }
    } catch {
      process.env.VERIFY_FLAGS = "";
    }
  }
} else {
  process.env.VERIFY_FLAGS = "";
}

// Pass target network so generateTsAbis.js can reorder scaffold.config.ts
process.env.DEPLOY_TARGET_NETWORK = network;

const result = spawnSync("make", ["deploy-and-generate-abis"], {
  stdio: "inherit",
  shell: true,
  cwd: join(__dirname, ".."),
});

if (result.status !== 0) {
  if (!resume && network !== "localhost") {
    console.log(
      "\n💡 If this was a partial broadcast, rerun the same deploy with --resume."
    );
  }
  process.exit(result.status);
}

// Run seed script for localhost deployments
if (network === "localhost") {
  const seedScript = join(__dirname, "..", "script", "SeedContent.sh");
  const seedResult = spawnSync("bash", [seedScript], {
    stdio: "inherit",
    shell: true,
    cwd: join(__dirname, ".."),
  });
  process.exit(seedResult.status);
}

process.exit(0);
