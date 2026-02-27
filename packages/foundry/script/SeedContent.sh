#!/usr/bin/env bash
# Seed script: submits example content from different accounts and platforms.
# Uses foundry's default anvil/hardhat accounts (indices 2-10 for content, 9-10 also for voting).
# Only runs on localhost (chain 31337).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_JSON="$SCRIPT_DIR/../deployments/31337.json"

RPC="http://127.0.0.1:8545"
SUBMITTER_STAKE="10000000" # 10 cREP in 6 decimals (MIN_SUBMITTER_STAKE)
VOTE_STAKE="5000000" # 5 cREP for votes

# Check if localhost deployment exists
if [ ! -f "$DEPLOY_JSON" ]; then
  echo "Skipping seed: no localhost deployment found (31337.json)"
  exit 0
fi

# Check if anvil/localhost is running
if ! cast chain-id --rpc-url "$RPC" > /dev/null 2>&1; then
  echo "Skipping seed: localhost RPC not available"
  exit 0
fi

# Read contract addresses from deployment file
TOKEN=$(grep -o '"0x[^"]*": "CuryoReputation"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
REGISTRY=$(grep -o '"0x[^"]*": "ContentRegistry"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
VOTING_ENGINE=$(grep -o '"0x[^"]*": "EpochVotingEngine"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)

if [ -z "$TOKEN" ] || [ -z "$REGISTRY" ]; then
  echo "ERROR: Could not read contract addresses from $DEPLOY_JSON"
  exit 1
fi

echo "CuryoReputation:         $TOKEN"
echo "ContentRegistry:   $REGISTRY"
echo "EpochVotingEngine: $VOTING_ENGINE"
echo ""

# Anvil/hardhat default private keys
# Accounts 2-10 for content submission (2-5 reused for Games & Books), 9-10 also for voting
# Note: These accounts are pre-funded with cREP during deployment (see DeployCuryo.s.sol)
KEYS=(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"  # Account 2
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"  # Account 3
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"  # Account 4
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"  # Account 5
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"  # Account 6
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"  # Account 7
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"  # Account 8
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"  # Account 9 (voter)
  "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897"  # Account 10 (voter)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"  # Account 2 (reused)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"  # Account 3 (reused)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"  # Account 4 (reused for Crypto)
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"  # Account 5 (reused for Crypto)
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"  # Account 6 (reused for GitHub)
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"  # Account 7 (reused for GitHub)
)

# Example content from multiple platforms: (url, goal, tags, categoryId)
# CategoryIds: 1=YouTube, 2=Twitch, 3=MTG, 4=Movies (TMDB), 5=People (Wikipedia), 6=Games (RAWG), 7=Books (Open Library), 8=AI (HuggingFace), 9=Crypto Tokens (CoinGecko), 10=Tweets (X), 11=GitHub Repos
URLS=(
  "https://www.youtube.com/watch?v=rUCAdMnb1Oc"
  "https://www.twitch.tv/videos/2aborhwf"
  "https://www.youtube.com/watch?v=aircAruvnKk"
  "https://scryfall.com/card/lea/232/black-lotus"
  "https://www.themoviedb.org/movie/238-the-godfather"
  "https://en.wikipedia.org/wiki/Lionel_Messi"
  "https://en.wikipedia.org/wiki/Marie_Curie"
  "https://rawg.io/games/elden-ring"
  "https://rawg.io/games/baldurs-gate-3"
  "https://openlibrary.org/works/OL45883W/Fantastic_Mr_Fox"
  "https://openlibrary.org/works/OL27516W/The_Hitchhikers_Guide_to_the_Galaxy"
  "https://www.coingecko.com/en/coins/bitcoin"
  "https://www.coingecko.com/en/coins/ethereum"
  "https://github.com/ethereum/go-ethereum"
  "https://github.com/foundry-rs/foundry"
)

GOALS=(
  "Learn how Ethereum works under the hood — from transactions to the EVM."
  "Gaming highlights and community moments from popular streamers."
  "A visual introduction to neural networks and deep learning fundamentals."
  "The most iconic and valuable card in Magic history — the legendary Black Lotus."
  "Francis Ford Coppola's masterpiece — widely considered one of the greatest films ever made."
  "Widely regarded as one of the greatest footballers of all time."
  "Pioneer in radioactivity research and the first person to win two Nobel Prizes."
  "FromSoftware's epic open-world action RPG — a landmark in modern game design."
  "Larian Studios' critically acclaimed RPG — a masterclass in player choice and storytelling."
  "Roald Dahl's beloved tale of a clever fox outsmarting three mean farmers."
  "Douglas Adams' comedic sci-fi classic — the answer is 42."
  "The original cryptocurrency — a peer-to-peer electronic cash system that pioneered decentralized finance."
  "The world's leading smart contract platform — powering DeFi, NFTs, and decentralized applications."
  "Official Go implementation of Ethereum — the backbone of most Ethereum nodes worldwide."
  "Blazing-fast Solidity toolkit — forge, cast, anvil, and chisel for smart contract development."
)

TAGS=(
  "Technology,Education"
  "Gaming,Entertainment"
  "Science,Education,Technology"
  "Artifacts,Commanders"
  "Drama,Crime"
  "Athletes,Sports"
  "Scientists,History"
  "Action,RPG"
  "RPG,Adventure"
  "Fiction,Fantasy"
  "Science Fiction,Fiction"
  "Layer 1,Infrastructure"
  "Layer 1,DeFi"
  "Infrastructure,DeFi/Web3"
  "Developer Tools,Infrastructure"
)

# CategoryIds mapping to URLs (1=YouTube, 2=Twitch, 3=MTG, 4=Movies, 5=People, 6=Games, 7=Books, 8=AI, 9=Crypto, 10=Tweets, 11=GitHub)
CATEGORY_IDS=(
  1   # YouTube
  2   # Twitch
  1   # YouTube
  3   # MTG (Scryfall)
  4   # Movies (TMDB)
  5   # People (Wikipedia)
  5   # People (Wikipedia)
  6   # Games (RAWG)
  6   # Games (RAWG)
  7   # Books (Open Library)
  7   # Books (Open Library)
  9   # Crypto Tokens (CoinGecko)
  9   # Crypto Tokens (CoinGecko)
  11  # GitHub Repos
  11  # GitHub Repos
)

echo "=== Seeding example content from multiple platforms ==="
echo "(Test accounts were pre-funded with cREP during deployment)"
echo ""

# Submit content from accounts 2-10 (some reused for Games & Books)
for i in {0..14}; do
  KEY="${KEYS[$i]}"
  URL="${URLS[$i]}"
  GOAL="${GOALS[$i]}"
  TAG="${TAGS[$i]}"
  CATEGORY_ID="${CATEGORY_IDS[$i]}"

  ADDR=$(cast wallet address "$KEY")
  echo "[$((i+1))/15] Account: $ADDR"

  # Ensure account has ETH for gas (Anvil only pre-funds first 10 accounts)
  ETH_BAL=$(cast balance "$ADDR" --rpc-url "$RPC" 2>/dev/null || echo "0")
  if [ "$ETH_BAL" = "0" ]; then
    echo "  Funding with ETH..."
    cast rpc anvil_setBalance "$ADDR" "0x8AC7230489E80000" --rpc-url "$RPC" > /dev/null 2>&1
  fi

  # 1. Approve registry to spend cREP for submission stake
  echo "  Approving cREP..."
  cast send "$TOKEN" "approve(address,uint256)" "$REGISTRY" "$SUBMITTER_STAKE" --private-key "$KEY" --rpc-url "$RPC" > /dev/null 2>&1

  # 2. Submit content with categoryId (cREP-only model, no stakeToken param)
  echo "  Submitting: $URL (categoryId: $CATEGORY_ID)"
  cast send "$REGISTRY" "submitContent(string,string,string,uint256)" "$URL" "$GOAL" "$TAG" "$CATEGORY_ID" --private-key "$KEY" --rpc-url "$RPC" > /dev/null 2>&1 || true
  echo "  Done!"
  echo ""
done

echo "=== Seed complete: 15 content items submitted ==="
echo ""

# --- Voting Section ---
if [ -z "$VOTING_ENGINE" ]; then
  echo "Skipping voting: EpochVotingEngine not found"
  exit 0
fi

echo "=== Adding votes from two accounts ==="
echo ""

# Voter accounts (indices 7 and 8 in KEYS array = accounts 9 and 10)
VOTER1_KEY="${KEYS[7]}"
VOTER2_KEY="${KEYS[8]}"
VOTER1_ADDR=$(cast wallet address "$VOTER1_KEY")
VOTER2_ADDR=$(cast wallet address "$VOTER2_KEY")

echo "Voter 1: $VOTER1_ADDR"
echo "Voter 2: $VOTER2_ADDR"

# Ensure voter accounts have ETH for gas
for VADDR in "$VOTER1_ADDR" "$VOTER2_ADDR"; do
  ETH_BAL=$(cast balance "$VADDR" --rpc-url "$RPC" 2>/dev/null || echo "0")
  if [ "$ETH_BAL" = "0" ]; then
    echo "  Funding $VADDR with ETH..."
    cast rpc anvil_setBalance "$VADDR" "0x8AC7230489E80000" --rpc-url "$RPC" > /dev/null 2>&1
  fi
done
echo ""

# Mine 5 blocks for flash-loan protection (MIN_HOLD_BLOCKS = 5)
echo "Mining blocks for flash-loan protection..."
for _ in {1..5}; do
  cast rpc anvil_mine --rpc-url "$RPC" > /dev/null 2>&1
done

# Function to compute commit hash: keccak256(abi.encodePacked(isUp, salt, contentId))
compute_commit_hash() {
  local is_up=$1      # "true" or "false"
  local salt=$2       # bytes32 hex string
  local content_id=$3 # uint256

  # Convert isUp to single byte (0x01 for true, 0x00 for false)
  local is_up_byte
  if [ "$is_up" = "true" ]; then
    is_up_byte="01"
  else
    is_up_byte="00"
  fi

  # Remove 0x prefix from salt if present
  salt="${salt#0x}"

  # Convert contentId to 32-byte hex (pad to 64 hex chars)
  local content_id_hex
  content_id_hex=$(printf "%064x" "$content_id")

  # Concatenate: isUp (1 byte) + salt (32 bytes) + contentId (32 bytes)
  local packed="0x${is_up_byte}${salt}${content_id_hex}"

  # Compute keccak256
  cast keccak "$packed"
}

# Vote on content items 1, 2, and 3
# Voter 1 votes UP on content 1 and 2
# Voter 2 votes DOWN on content 1, UP on content 3

echo "Voter 1 voting UP on content 1..."
SALT1="0x$(openssl rand -hex 32)"
COMMIT_HASH1=$(compute_commit_hash "true" "$SALT1" 1)
cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" --private-key "$VOTER1_KEY" --rpc-url "$RPC" > /dev/null 2>&1
# commitVote(uint256 contentId, bytes32 commitHash, bytes ciphertext, uint256 stakeAmount, address frontend)
cast send "$VOTING_ENGINE" "commitVote(uint256,bytes32,bytes,uint256,address)" 1 "$COMMIT_HASH1" "0x" "$VOTE_STAKE" "0x0000000000000000000000000000000000000000" --private-key "$VOTER1_KEY" --rpc-url "$RPC" > /dev/null 2>&1 || echo "  (Vote may have failed - epoch might not be active)"
echo "  Done!"

echo "Voter 1 voting UP on content 2..."
SALT2="0x$(openssl rand -hex 32)"
COMMIT_HASH2=$(compute_commit_hash "true" "$SALT2" 2)
cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" --private-key "$VOTER1_KEY" --rpc-url "$RPC" > /dev/null 2>&1
cast send "$VOTING_ENGINE" "commitVote(uint256,bytes32,bytes,uint256,address)" 2 "$COMMIT_HASH2" "0x" "$VOTE_STAKE" "0x0000000000000000000000000000000000000000" --private-key "$VOTER1_KEY" --rpc-url "$RPC" > /dev/null 2>&1 || echo "  (Vote may have failed - epoch might not be active)"
echo "  Done!"

echo "Voter 2 voting DOWN on content 1..."
SALT3="0x$(openssl rand -hex 32)"
COMMIT_HASH3=$(compute_commit_hash "false" "$SALT3" 1)
cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" --private-key "$VOTER2_KEY" --rpc-url "$RPC" > /dev/null 2>&1
cast send "$VOTING_ENGINE" "commitVote(uint256,bytes32,bytes,uint256,address)" 1 "$COMMIT_HASH3" "0x" "$VOTE_STAKE" "0x0000000000000000000000000000000000000000" --private-key "$VOTER2_KEY" --rpc-url "$RPC" > /dev/null 2>&1 || echo "  (Vote may have failed - epoch might not be active)"
echo "  Done!"

echo "Voter 2 voting UP on content 3..."
SALT4="0x$(openssl rand -hex 32)"
COMMIT_HASH4=$(compute_commit_hash "true" "$SALT4" 3)
cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" --private-key "$VOTER2_KEY" --rpc-url "$RPC" > /dev/null 2>&1
cast send "$VOTING_ENGINE" "commitVote(uint256,bytes32,bytes,uint256,address)" 3 "$COMMIT_HASH4" "0x" "$VOTE_STAKE" "0x0000000000000000000000000000000000000000" --private-key "$VOTER2_KEY" --rpc-url "$RPC" > /dev/null 2>&1 || echo "  (Vote may have failed - epoch might not be active)"
echo "  Done!"

echo ""
echo "=== Voting complete: 4 votes committed ==="
echo "  Content 1: 2 votes (1 up, 1 down)"
echo "  Content 2: 1 vote (1 up)"
echo "  Content 3: 1 vote (1 up)"
