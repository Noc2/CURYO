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
EPOCH_DURATION_SECONDS="${EPOCH_DURATION_SECONDS:-1200}"

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
VOTING_ENGINE=$(grep -o '"0x[^"]*": "RoundVotingEngine"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)

if [ -z "$TOKEN" ] || [ -z "$REGISTRY" ]; then
  echo "ERROR: Could not read contract addresses from $DEPLOY_JSON"
  exit 1
fi

echo "CuryoReputation:         $TOKEN"
echo "ContentRegistry:   $REGISTRY"
echo "RoundVotingEngine: $VOTING_ENGINE"
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
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"  # Account 8 (reused for Spotify)
)

# Example content from multiple platforms: (url, title, description, tags, categoryId)
# CategoryIds: 1=YouTube, 2=Twitch, 3=MTG, 4=Movies (TMDB), 5=People (Wikipedia), 6=Games (RAWG), 7=Books (Open Library), 8=AI (HuggingFace), 9=Crypto Tokens (CoinGecko), 10=Tweets (X), 11=GitHub Repos, 12=Spotify Podcasts
URLS=(
  "https://www.youtube.com/watch?v=rUCAdMnb1Oc"
  "https://www.youtube.com/watch?v=M7lc1UVf-VE"
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
  "https://open.spotify.com/show/5eXZwvvxt3K2dxha3BSaAe"
)

TITLES=(
  "Ethereum in Practice"
  "YouTube Player API Demo"
  "Neural Networks, Visualized"
  "Black Lotus"
  "The Godfather"
  "Lionel Messi"
  "Marie Curie"
  "Elden Ring"
  "Baldur's Gate 3"
  "Fantastic Mr. Fox"
  "The Hitchhiker's Guide to the Galaxy"
  "Bitcoin"
  "Ethereum"
  "go-ethereum"
  "Foundry"
  "Spotify Engineering Stories"
)

DESCRIPTIONS=(
  "Learn how Ethereum works under the hood — from transactions to the EVM."
  "Official demo video used for testing YouTube embeds and player integrations."
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
  "Engineering stories and behind-the-scenes conversations from Spotify's own podcast feed."
)

TAGS=(
  "Technology,Education"
  "Technology,Testing,Video"
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
  "Technology,Culture"
)

# CategoryIds mapping to URLs (1=YouTube, 2=Twitch, 3=MTG, 4=Movies, 5=People, 6=Games, 7=Books, 8=AI, 9=Crypto, 10=Tweets, 11=GitHub, 12=Spotify)
CATEGORY_IDS=(
  1   # YouTube
  1   # YouTube
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
  12  # Spotify Podcasts
)

echo "=== Seeding example content from multiple platforms ==="
echo "(Test accounts were pre-funded with cREP during deployment)"
echo ""

TOTAL_ITEMS="${#URLS[@]}"

# Submit content from accounts 2-10 (some reused for later categories)
for ((i = 0; i < TOTAL_ITEMS; i++)); do
  KEY="${KEYS[$i]}"
  URL="${URLS[$i]}"
  TITLE="${TITLES[$i]}"
  DESCRIPTION="${DESCRIPTIONS[$i]}"
  TAG="${TAGS[$i]}"
  CATEGORY_ID="${CATEGORY_IDS[$i]}"

  ADDR=$(cast wallet address "$KEY")
  echo "[$((i+1))/$TOTAL_ITEMS] Account: $ADDR"

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
  cast send "$REGISTRY" "submitContent(string,string,string,string,uint256)" "$URL" "$TITLE" "$DESCRIPTION" "$TAG" "$CATEGORY_ID" --private-key "$KEY" --rpc-url "$RPC" > /dev/null 2>&1 || true
  echo "  Done!"
  echo ""
done

echo "=== Seed complete: $TOTAL_ITEMS content items submitted ==="
echo ""

# --- Voting Section ---
if [ -z "$VOTING_ENGINE" ]; then
  echo "Skipping voting: RoundVotingEngine not found"
  exit 0
fi

ZERO_ADDR="0x0000000000000000000000000000000000000000"

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

# Vote on content items 1, 2, and 3 using commitVote (tlock commit-reveal).
# commitVote(uint256 contentId, bytes32 commitHash, bytes ciphertext, uint256 stakeAmount, address frontend)
# commitHash = keccak256(abi.encodePacked(isUp, salt, contentId, keccak256(ciphertext)))
#
# Voter 1 (account #9) votes UP on content 1 and 2
# Voter 2 (account #10) votes DOWN on content 1, UP on content 3

# Helper: generate tlock ciphertext and submit commitVote
# Usage: seed_commit <contentId> <isUp:true|false> <salt_hex> <private_key>
seed_commit() {
  local contentId="$1"
  local isUp="$2"
  local salt="$3"
  local privKey="$4"
  local commitHash
  local ciphertext
  local artifacts
  artifacts=$(node "$SCRIPT_DIR/../scripts-js/generateTlockCommit.js" \
    "$contentId" "$isUp" "0x${salt}" "$EPOCH_DURATION_SECONDS") || {
    echo "  (Failed to build tlock ciphertext)"
    return 1
  }
  commitHash=$(printf '%s\n' "$artifacts" | sed -n '1p')
  ciphertext=$(printf '%s\n' "$artifacts" | sed -n '2p')

  cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" \
    --private-key "$privKey" --rpc-url "$RPC" > /dev/null 2>&1

  cast send "$VOTING_ENGINE" \
    "commitVote(uint256,bytes32,bytes,uint256,address)" \
    "$contentId" "$commitHash" "$ciphertext" "$VOTE_STAKE" "$ZERO_ADDR" \
    --private-key "$privKey" --rpc-url "$RPC" > /dev/null 2>&1 || { echo "  (Commit may have failed)"; return 1; }
}

# Use deterministic salts for reproducibility
SALT1A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SALT1B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
SALT2A="cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
SALT2B="dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

echo "Voter 1 committing UP on content 1..."
seed_commit 1 true "$SALT1A" "$VOTER1_KEY"
echo "  Done!"

echo "Voter 1 committing UP on content 2..."
seed_commit 2 true "$SALT1B" "$VOTER1_KEY"
echo "  Done!"

echo "Voter 2 committing DOWN on content 1..."
seed_commit 1 false "$SALT2A" "$VOTER2_KEY"
echo "  Done!"

echo "Voter 2 committing UP on content 3..."
seed_commit 3 true "$SALT2B" "$VOTER2_KEY"
echo "  Done!"

echo ""
echo "=== Voting complete: 4 commit-reveal votes submitted ==="
echo "  Content 1: 2 commits (1 up, 1 down)"
echo "  Content 2: 1 commit (1 up)"
echo "  Content 3: 1 commit (1 up)"
