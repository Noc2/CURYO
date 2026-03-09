/**
 * Direct contract call helpers for admin/governance E2E tests.
 *
 * On local Anvil (chain 31337, local dev), the deployer (account #0)
 * serves as governance and holds all roles: ADMIN_ROLE, GOVERNANCE_ROLE,
 * CONFIG_ROLE. No impersonation needed.
 *
 * Pattern follows cancelExpiredRoundDirect() in keeper.ts — ABI-encode
 * the call with viem and send via eth_sendTransaction.
 */

const ANVIL_RPC = "http://localhost:8545";

/** Send a raw transaction to the Anvil RPC, return true if it succeeded on-chain. */
async function sendTx(from: string, to: string, data: `0x${string}`): Promise<boolean> {
  // Impersonate the sender so accounts beyond Anvil's default 10 can send txs
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_impersonateAccount", params: [from], id: Date.now() }),
  });

  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_sendTransaction",
      params: [{ from, to, data, gas: "0x1E8480" }], // 2M gas
      id: Date.now(),
    }),
  });
  const json = await res.json();

  // Stop impersonation (non-fatal if it fails)
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_stopImpersonatingAccount", params: [from], id: Date.now() }),
  });

  if (json.error) {
    console.error(`[sendTx] RPC error from=${from} to=${to}: ${JSON.stringify(json.error)}`);
    return false;
  }

  // Anvil auto-mines, but the receipt may not be available instantly when
  // the keeper is also sending transactions. Retry a few times.
  const txHash = json.result;
  for (let attempt = 0; attempt < 5; attempt++) {
    const receiptRes = await fetch(ANVIL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: Date.now(),
      }),
    });
    const receiptJson = await receiptRes.json();
    const status = receiptJson.result?.status;
    if (status === "0x1") return true;
    if (status === "0x0") {
      // Log revert data for debugging
      const revertData = receiptJson.result?.revertReason || "no revert reason";
      console.error(`[sendTx] Tx reverted from=${from} to=${to} hash=${txHash} reason=${revertData}`);
      return false;
    }
    // Receipt not yet available — wait and retry
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function readCall(to: string, data: `0x${string}`): Promise<`0x${string}`> {
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || "eth_call failed");
  }
  return json.result as `0x${string}`;
}

/**
 * Approve a pending category via the timelock.
 * Calls CategoryRegistry.approveCategory(uint256 categoryId).
 * In local dev, deployer == timelock so account #0 can call directly.
 */
export async function approveCategory(
  categoryId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "approveCategory",
        type: "function",
        inputs: [{ name: "categoryId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "approveCategory",
    args: [BigInt(categoryId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Add an approved category directly (admin fast-path, no stake required).
 * Calls CategoryRegistry.addApprovedCategory(string, string, string[], string).
 */
export async function addApprovedCategory(
  name: string,
  domain: string,
  subcategories: string[],
  rankingQuestion: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "addApprovedCategory",
        type: "function",
        inputs: [
          { name: "name", type: "string" },
          { name: "domain", type: "string" },
          { name: "subcategories", type: "string[]" },
          { name: "rankingQuestion", type: "string" },
        ],
        outputs: [{ name: "categoryId", type: "uint256" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "addApprovedCategory",
    args: [name, domain, subcategories, rankingQuestion],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Register the caller as a frontend operator.
 * Calls FrontendRegistry.register().
 * Caller must have approved 1000 cREP to the FrontendRegistry.
 */
export async function registerFrontend(fromAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "register",
        type: "function",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "register",
    args: [],
  });
  return sendTx(fromAddress, contractAddress, data);
}

export async function followProfile(
  targetAddress: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "follow",
        type: "function",
        inputs: [{ name: "target", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "follow",
    args: [targetAddress as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

export async function unfollowProfile(
  targetAddress: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "unfollow",
        type: "function",
        inputs: [{ name: "target", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "unfollow",
    args: [targetAddress as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

export async function isFollowingOnChain(
  followerAddress: string,
  targetAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "isFollowing",
      type: "function",
      inputs: [
        { name: "follower", type: "address" },
        { name: "target", type: "address" },
      ],
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "view",
    },
  ] as const;

  const data = encodeFunctionData({
    abi,
    functionName: "isFollowing",
    args: [followerAddress as `0x${string}`, targetAddress as `0x${string}`],
  });
  const result = await readCall(contractAddress, data);
  return decodeFunctionResult({ abi, functionName: "isFollowing", data: result });
}

/**
 * Approve a registered frontend to start earning fees.
 * Calls FrontendRegistry.approveFrontend(address frontend).
 * Requires GOVERNANCE_ROLE (deployer has it in local dev).
 */
export async function approveFrontend(
  frontendAddr: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "approveFrontend",
        type: "function",
        inputs: [{ name: "frontend", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "approveFrontend",
    args: [frontendAddr as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Submit content directly via contract call.
 * Caller must have approved MIN_SUBMITTER_STAKE (10 cREP = 10e6) to ContentRegistry.
 * Returns the transaction hash on success, or null on failure.
 */
export async function submitContentDirect(
  url: string,
  goal: string,
  tags: string,
  categoryId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "submitContent",
        type: "function",
        inputs: [
          { name: "url", type: "string" },
          { name: "goal", type: "string" },
          { name: "tags", type: "string" },
          { name: "categoryId", type: "uint256" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "submitContent",
    args: [url, goal, tags, BigInt(categoryId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Cancel content before any votes (submitter only).
 * Calls ContentRegistry.cancelContent(uint256 contentId).
 */
export async function cancelContent(
  contentId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "cancelContent",
        type: "function",
        inputs: [{ name: "contentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "cancelContent",
    args: [BigInt(contentId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Deregister a frontend (operator only — must call from the registered address).
 * Calls FrontendRegistry.deregister(). Returns stake + pending fees to caller.
 */
export async function deregisterFrontend(fromAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "deregister",
        type: "function",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "deregister",
    args: [],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Slash a registered frontend's stake.
 * Calls FrontendRegistry.slashFrontend(address, uint256, string).
 * Requires GOVERNANCE_ROLE (deployer has it in local dev).
 */
export async function slashFrontend(
  frontendAddr: string,
  amount: bigint,
  reason: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "slashFrontend",
        type: "function",
        inputs: [
          { name: "frontend", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "reason", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "slashFrontend",
    args: [frontendAddr as `0x${string}`, amount, reason],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Unslash a frontend so it can be deregistered.
 * Calls FrontendRegistry.unslashFrontend(address).
 * Requires GOVERNANCE_ROLE (deployer in local dev).
 */
export async function unslashFrontend(
  frontendAddr: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "unslashFrontend",
        type: "function",
        inputs: [{ name: "frontend", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "unslashFrontend",
    args: [frontendAddr as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Advance the Anvil chain time by a given number of seconds.
 * Calls evm_increaseTime + evm_mine.
 */
export async function evmIncreaseTime(seconds: number): Promise<void> {
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 1 }),
  });
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 2 }),
  });
}

/**
 * Mint a voter ID NFT for a holder.
 * Calls VoterIdNFT.mint(address to, uint256 nullifier).
 * Requires authorized minter (account #0 in local dev).
 */
export async function mintVoterId(
  holderAddress: string,
  nullifier: bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "mint",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "nullifier", type: "uint256" },
        ],
        outputs: [{ name: "tokenId", type: "uint256" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "mint",
    args: [holderAddress as `0x${string}`, nullifier],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Revoke a voter ID NFT from a holder.
 * Calls VoterIdNFT.revokeVoterId(address holder).
 * Requires owner (deployer in local dev).
 */
export async function revokeVoterId(
  holderAddress: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "revokeVoterId",
        type: "function",
        inputs: [{ name: "holder", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "revokeVoterId",
    args: [holderAddress as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Mark content as dormant after DORMANCY_PERIOD (30 days) of inactivity.
 * Calls ContentRegistry.markDormant(uint256 contentId).
 * Permissionless — anyone can call after the dormancy period expires.
 */
export async function markDormant(
  contentId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "markDormant",
        type: "function",
        inputs: [{ name: "contentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "markDormant",
    args: [BigInt(contentId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Revive dormant content by staking 5 cREP.
 * Calls ContentRegistry.reviveContent(uint256 contentId).
 * Requires caller to have approved 5 cREP (5e6) to the ContentRegistry.
 */
export async function reviveContent(
  contentId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "reviveContent",
        type: "function",
        inputs: [{ name: "contentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "reviveContent",
    args: [BigInt(contentId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Transfer cREP tokens from one address to another.
 * Calls CuryoReputation.transfer(address to, uint256 amount).
 */
export async function transferCREP(
  toAddress: string,
  amount: bigint,
  fromAddress: string,
  tokenAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "transfer",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "transfer",
    args: [toAddress as `0x${string}`, amount],
  });
  return sendTx(fromAddress, tokenAddress, data);
}

/**
 * Approve ERC20 token spending.
 * Calls CuryoReputation.approve(address spender, uint256 amount).
 */
export async function approveCREP(
  spender: string,
  amount: bigint,
  fromAddress: string,
  tokenAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "approve",
        type: "function",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "approve",
    args: [spender as `0x${string}`, amount],
  });
  return sendTx(fromAddress, tokenAddress, data);
}

/**
 * Claim submitter reward after round settlement.
 * Calls RoundRewardDistributor.claimSubmitterReward(uint256 contentId, uint256 roundId).
 * Permissionless but only the submitter gets the reward.
 */
export async function claimSubmitterReward(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimSubmitterReward",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimSubmitterReward",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Claim participation reward after round settlement.
 * Calls RoundVotingEngine.claimParticipationReward(uint256 contentId, uint256 roundId).
 * Any voter in the round can call — reverts with AlreadyClaimed on double claim.
 */
export async function claimParticipationReward(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimParticipationReward",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimParticipationReward",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Check if an address has a VoterID on-chain (not Ponder).
 * Calls holderToTokenId(address) — returns true if tokenId > 0.
 */
export async function hasVoterIdOnChain(holderAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: "holderToTokenId",
      type: "function",
      inputs: [{ name: "holder", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "holderToTokenId",
    args: [holderAddress as `0x${string}`],
  });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return false;
  const tokenId = decodeFunctionResult({ abi, functionName: "holderToTokenId", data: json.result });
  return tokenId > 0n;
}

/**
 * Check if an address is registered as a frontend on-chain (not Ponder).
 * Calls FrontendRegistry.getFrontendInfo(address) — returns true if operator != address(0).
 */
export async function isFrontendRegisteredOnChain(frontendAddr: string, contractAddress: string): Promise<boolean> {
  const info = await getFrontendInfoOnChain(frontendAddr, contractAddress);
  return info.registered;
}

/**
 * Get full frontend info from chain.
 * Calls FrontendRegistry.getFrontendInfo(address).
 */
export async function getFrontendInfoOnChain(
  frontendAddr: string,
  contractAddress: string,
): Promise<{ registered: boolean; stakedAmount: bigint; approved: boolean; slashed: boolean }> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: "getFrontendInfo",
      type: "function",
      inputs: [{ name: "frontend", type: "address" }],
      outputs: [
        { name: "operator", type: "address" },
        { name: "stakedAmount", type: "uint256" },
        { name: "approved", type: "bool" },
        { name: "slashed", type: "bool" },
      ],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "getFrontendInfo",
    args: [frontendAddr as `0x${string}`],
  });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return { registered: false, stakedAmount: 0n, approved: false, slashed: false };
  const [operator, stakedAmount, approved, slashed] = decodeFunctionResult({
    abi,
    functionName: "getFrontendInfo",
    data: json.result,
  });
  return {
    registered: operator !== "0x0000000000000000000000000000000000000000",
    stakedAmount,
    approved,
    slashed,
  };
}

// ============================================================
// ROUND VOTING ENGINE — tlock commit-reveal direct contract calls
// ============================================================

/**
 * Commit a vote directly via contract call (tlock commit-reveal).
 * Encrypts vote direction with drand tlock and computes commitHash/commitKey.
 * Caller must have approved stakeAmount of cREP to the RoundVotingEngine.
 *
 * Returns { success, commitKey, isUp, salt } for later reveal.
 */
export async function commitVoteDirect(
  contentId: number | bigint,
  isUp: boolean,
  stakeAmount: bigint,
  frontend: string,
  fromAddress: string,
  contractAddress: string,
  epochDurationSeconds = 1200,
): Promise<{ success: boolean; commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }> {
  const { encodeFunctionData, encodePacked, keccak256 } = await import("viem");
  const { timelockEncrypt, mainnetClient, roundAt } = await import("tlock-js");
  const { Buffer } = await import("buffer");

  // Generate deterministic salt from voter + contentId + timestamp
  const salt = keccak256(
    encodePacked(
      ["address", "uint256", "uint256"],
      [fromAddress as `0x${string}`, BigInt(contentId), BigInt(Date.now())],
    ),
  );

  // commitHash = keccak256(abi.encodePacked(isUp, salt, contentId))
  const chash = keccak256(encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, BigInt(contentId)]));

  // commitKey = keccak256(abi.encodePacked(voter, commitHash))
  const ckey = keccak256(encodePacked(["address", "bytes32"], [fromAddress as `0x${string}`, chash]));

  // tlock encrypt: 33-byte plaintext = [uint8 direction, bytes32 salt]
  const plaintext = Buffer.alloc(33);
  plaintext[0] = isUp ? 1 : 0;
  Buffer.from(salt.slice(2), "hex").copy(plaintext, 1);

  const client = mainnetClient();
  const chainInfo = await client.chain().info();
  const targetRound = roundAt(Date.now() + epochDurationSeconds * 1000, chainInfo);
  const armored = await timelockEncrypt(targetRound, plaintext, client);
  const ciphertext = `0x${Buffer.from(armored, "utf-8").toString("hex")}` as `0x${string}`;

  const data = encodeFunctionData({
    abi: [
      {
        name: "commitVote",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "commitHash", type: "bytes32" },
          { name: "ciphertext", type: "bytes" },
          { name: "stakeAmount", type: "uint256" },
          { name: "frontend", type: "address" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "commitVote",
    args: [BigInt(contentId), chash, ciphertext, stakeAmount, frontend as `0x${string}`],
  });

  const success = await sendTx(fromAddress, contractAddress, data);
  return { success, commitKey: ckey, isUp, salt };
}

/**
 * Reveal a committed vote via contract call.
 * Calls revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt).
 * Anyone can reveal — the keeper normally does this after epoch ends.
 */
export async function revealVoteDirect(
  contentId: number | bigint,
  roundId: number | bigint,
  commitKey: `0x${string}`,
  isUp: boolean,
  salt: `0x${string}`,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "revealVoteByCommitKey",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "commitKey", type: "bytes32" },
          { name: "isUp", type: "bool" },
          { name: "salt", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "revealVoteByCommitKey",
    args: [BigInt(contentId), BigInt(roundId), commitKey, isUp, salt],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Settle a round via contract call.
 * Calls settleRound(contentId, roundId).
 * Requires: ≥minVoters revealed.
 */
export async function settleRoundDirect(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "settleRound",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "settleRound",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  const ok = await sendTx(fromAddress, contractAddress, data);
  if (ok) return true;

  // The keeper may have already settled this round — check round state.
  // State 1 = Settled, 3 = Tied — both are acceptable outcomes.
  const stateData = encodeFunctionData({
    abi: [
      {
        name: "getRound",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [
          {
            name: "",
            type: "tuple",
            components: [
              { name: "startTime", type: "uint256" },
              { name: "state", type: "uint8" },
            ],
          },
        ],
        stateMutability: "view",
      },
    ],
    functionName: "getRound",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  try {
    const res = await fetch(ANVIL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: contractAddress, data: stateData }, "latest"],
        id: Date.now(),
      }),
    });
    const json = await res.json();
    if (json.result) {
      // state is at byte offset 32 (second word in the tuple)
      const stateHex = "0x" + json.result.slice(66, 130);
      const state = parseInt(stateHex, 16);
      if (state === 1 || state === 3) {
        console.log(`[settleRoundDirect] Round already settled by keeper (state=${state})`);
        return true;
      }
    }
  } catch {
    // Fall through — return false
  }
  return false;
}

/**
 * Process unrevealed votes after settlement.
 * Calls processUnrevealedVotes(contentId, roundId, startIndex, count).
 * Forfeits past-epoch stakes to treasury, refunds current-epoch stakes.
 */
export async function processUnrevealedVotes(
  contentId: number | bigint,
  roundId: number | bigint,
  startIndex: number,
  count: number,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "processUnrevealedVotes",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "startIndex", type: "uint256" },
          { name: "count", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "processUnrevealedVotes",
    args: [BigInt(contentId), BigInt(roundId), BigInt(startIndex), BigInt(count)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Claim refund from a cancelled round.
 * Calls claimCancelledRoundRefund(contentId, roundId).
 * Any voter who committed to the round can claim their full stake back.
 */
export async function claimCancelledRoundRefund(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimCancelledRoundRefund",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimCancelledRoundRefund",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Mine multiple blocks on Anvil. Uses anvil_mine for fast block advancement.
 */
export async function mineBlocks(count: number): Promise<void> {
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "anvil_mine",
      params: [`0x${count.toString(16)}`, `0x1`],
      id: Date.now(),
    }),
  });
}

/**
 * Claim voter reward for a settled round.
 * Only winning voters get a payout; losing voters are notified.
 */
export async function claimVoterReward(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimReward",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimReward",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Read a public uint256 view function from a contract (e.g. consensusReserve).
 */
export async function readUint256(functionName: string, contractAddress: string, args: bigint[] = []): Promise<bigint> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: functionName,
      type: "function",
      inputs: args.map((_, i) => ({ name: `arg${i}`, type: "uint256" })),
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({ abi, functionName, args });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return 0n;
  return decodeFunctionResult({ abi, functionName, data: json.result }) as bigint;
}

/**
 * Read the active round ID for a content item.
 */
export async function getActiveRoundId(contentId: number | bigint, contractAddress: string): Promise<bigint> {
  return readUint256("getActiveRoundId", contractAddress, [BigInt(contentId)]);
}

/**
 * Generic Ponder polling helper. Polls until the predicate returns true or timeout.
 */
export async function waitForPonderIndexed(
  pollFn: () => Promise<boolean>,
  maxWaitMs = 60_000,
  pollInterval = 2_000,
  label = "waitForPonderIndexed",
): Promise<boolean> {
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < maxWaitMs) {
    attempts++;
    try {
      if (await pollFn()) return true;
    } catch (err) {
      console.warn(`[${label}] attempt ${attempts} error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.warn(`[${label}] timed out after ${elapsed}s (${attempts} attempts)`);
  return false;
}

/**
 * Read the current RoundVotingEngine config tuple.
 * Returns the 4 fields from the config() public getter.
 */
export async function readRoundConfig(contractAddress: string): Promise<{
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
}> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: "config",
      type: "function",
      inputs: [],
      outputs: [
        { name: "epochDuration", type: "uint256" },
        { name: "maxDuration", type: "uint256" },
        { name: "minVoters", type: "uint256" },
        { name: "maxVoters", type: "uint256" },
      ],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({ abi, functionName: "config" });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) throw new Error(`readRoundConfig failed: ${JSON.stringify(json.error)}`);
  const [epochDuration, maxDuration, minVoters, maxVoters] = decodeFunctionResult({
    abi,
    functionName: "config",
    data: json.result,
  });
  return { epochDuration, maxDuration, minVoters, maxVoters };
}

/**
 * Set test-friendly config on the RoundVotingEngine.
 * Calls setConfig(epochDuration, maxDuration, minVoters, maxVoters).
 * Requires CONFIG_ROLE (account #9 / DEPLOYER in local dev).
 */
export async function setTestConfig(
  contractAddress: string,
  fromAddress: string,
  epochDuration = 300,
  maxDuration = 86400,
  minVoters = 3,
  maxVoters = 100,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "setConfig",
        type: "function",
        inputs: [
          { name: "_epochDuration", type: "uint256" },
          { name: "_maxDuration", type: "uint256" },
          { name: "_minVoters", type: "uint256" },
          { name: "_maxVoters", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "setConfig",
    args: [BigInt(epochDuration), BigInt(maxDuration), BigInt(minVoters), BigInt(maxVoters)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Wait for Ponder to catch up to the current chain block number.
 * Call this after mineBlocks() to ensure Ponder has processed all new blocks
 * before polling for specific indexed data.
 */
export async function waitForPonderSync(
  maxWaitMs = 120_000,
  pollInterval = 2_000,
  ponderURL = "http://localhost:42069",
): Promise<boolean> {
  // Get current chain block number
  const blockRes = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: Date.now() }),
  });
  const blockJson = await blockRes.json();
  const chainBlock = parseInt(blockJson.result, 16);

  const start = Date.now();
  let lastPonderBlock = 0;
  while (Date.now() - start < maxWaitMs) {
    try {
      const statusRes = await fetch(`${ponderURL}/status`);
      if (statusRes.ok) {
        const status = await statusRes.json();
        const ponderBlock = status?.hardhat?.block?.number ?? 0;
        lastPonderBlock = ponderBlock;
        if (ponderBlock >= chainBlock) return true;
      }
    } catch {
      // Ponder may not be ready yet
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.warn(
    `[waitForPonderSync] timed out after ${elapsed}s — chain block: ${chainBlock}, ponder block: ${lastPonderBlock}`,
  );
  return false;
}
