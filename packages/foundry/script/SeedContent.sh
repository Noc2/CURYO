#!/usr/bin/env bash
# Seed script: submits example question-first content from different accounts.
# Uses foundry's default anvil/hardhat accounts (indices 2-10 for content, 9-10 also for voting).
# Only runs on localhost (chain 31337).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_JSON="$SCRIPT_DIR/../deployments/31337.json"
CATEGORY_ID_RESOLVER="$SCRIPT_DIR/../scripts-js/resolveCategoryId.js"

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
VOTING_ENGINE=$(grep -o '"0x[^"]*": "RoundVotingEngine"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
CATEGORY_REGISTRY=$(grep -o '"0x[^"]*": "CategoryRegistry"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)

if [ -z "$TOKEN" ] || [ -z "$REGISTRY" ] || [ -z "$CATEGORY_REGISTRY" ]; then
  echo "ERROR: Could not read contract addresses from $DEPLOY_JSON"
  exit 1
fi

echo "CuryoReputation:         $TOKEN"
echo "ContentRegistry:   $REGISTRY"
echo "RoundVotingEngine: $VOTING_ENGINE"
echo "CategoryRegistry:  $CATEGORY_REGISTRY"
echo ""

# Anvil/hardhat default private keys
# Accounts 2-10 for question submission (some reused for later questions), 9-10 also for voting
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
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"  # Account 4 (reused)
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"  # Account 5 (reused)
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"  # Account 6 (reused)
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"  # Account 7 (reused)
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"  # Account 8 (reused)
)

# Example Curyo 2 questions use either a direct image URL or a YouTube URL.
# Curyo 2 default categoryIds:
# 1=Products, 2=Local Places, 3=Travel, 4=Apps, 5=Media,
# 6=Design, 7=AI Answers, 8=Developer Docs, 9=Trust, 10=General
URLS=(
  "https://picsum.photos/seed/curyo-refund-policy/1200/800.jpg"
  "https://picsum.photos/seed/curyo-workspace/1200/800.jpg"
  "https://picsum.photos/seed/curyo-api-docs/1200/800.jpg"
  "https://picsum.photos/seed/curyo-product-label/1200/800.jpg"
  "https://picsum.photos/seed/curyo-cafe-review/1200/800.jpg"
  "https://picsum.photos/seed/curyo-hotel-room/1200/800.jpg"
  "https://www.youtube.com/watch?v=jNQXAC9IVRw"
  "https://picsum.photos/seed/curyo-app-onboarding/1200/800.jpg"
  "https://picsum.photos/seed/curyo-event-poster/1200/800.jpg"
  "https://picsum.photos/seed/curyo-weeknight-dinner/1200/800.jpg"
  "https://picsum.photos/seed/curyo-media-hero/1200/800.jpg"
  "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
  "https://picsum.photos/seed/curyo-street-guide/1200/800.jpg"
  "https://picsum.photos/seed/curyo-accessibility-checklist/1200/800.jpg"
  "https://picsum.photos/seed/curyo-moderation-rules/1200/800.jpg"
  "https://picsum.photos/seed/curyo-product-photo/1200/800.jpg"
)

TITLES=(
  "Is this refund policy easy to understand?"
  "Does this workspace feel ready for deep work?"
  "Is this API quickstart beginner friendly?"
  "Is this product label readable on mobile?"
  "Would this cafe review help locals choose?"
  "Does this hotel room look clean and comfortable?"
  "Is this short video clear enough to share?"
  "Should this app onboarding copy be shorter?"
  "Does this poster make the event easy to grasp?"
  "Is this dinner plan practical for a weeknight?"
  "Does this image work as a hero visual?"
  "Does this animated clip hold attention?"
  "Does this street scene feel welcoming?"
  "Is this accessibility checklist launch ready?"
  "Does this moderation rule set clear voter expectations?"
  "Is this product photo useful enough to compare?"
)

DESCRIPTIONS=(
  "Voters should judge whether the plain-language summary explains refunds, timelines, and exceptions clearly enough for a first-time buyer."
  "Rate the image and context as a calm workspace for focused technical writing, not as a luxury interior shot."
  "Judge whether a new developer could complete the first request without missing setup, authentication, or error handling steps."
  "Focus on whether the label hierarchy, contrast, and key details would still be clear in a small shopping card."
  "The review mentions noise, service speed, seating, and price. Vote on whether it is specific enough to guide a nearby visitor."
  "Use the visible room condition and the written context to judge whether the listing earns a higher community rating."
  "Judge whether the clip has enough context, pacing, and visual clarity for a viewer to understand it without extra explanation."
  "The flow explains wallet connection, Voter ID, and staking in one screen. Judge whether the copy reduces friction or overloads new users."
  "Voters should judge hierarchy, contrast, and whether date, place, and purpose are legible at a glance."
  "Rate whether the plan balances prep time, nutrition, cleanup, and ingredient availability for a busy household."
  "Judge whether the image has enough focus, contrast, and mood to support a question about human review quality."
  "Vote on whether the movement, pacing, and visual focus make the clip engaging enough for a general audience."
  "Use the image as travel context. Vote on whether it would make a neighborhood guide feel inviting and credible."
  "Review the checklist for keyboard support, focus states, text contrast, reduced motion, and mobile overflow coverage."
  "Judge whether the rule tells voters when to downvote illegal, unsafe, misleading, or mismatched submissions."
  "Focus on scale, detail, lighting, and whether the photo helps a buyer compare the item without extra marketing claims."
)

TAGS=(
  "Policy,Clarity,Trust"
  "Photography,Usefulness,Atmosphere"
  "Getting Started,Readability,Examples"
  "Design,Usability,Quality"
  "Local Tips,Service,Value"
  "Hotels,Cleanliness,Comfort"
  "Video,Clarity,Context"
  "Onboarding,Trust,Usability"
  "Visual Design,Typography,Layout"
  "Usefulness,Clear,Worthwhile"
  "Images,Art,Photography"
  "Video,Animation,Engagement"
  "Location,Photography,Solo Travel"
  "Accessibility,Quality,Testing"
  "Moderation,Policy,Risk"
  "Quality,Design,Value"
)

# Stable category slugs for each seeded question. The deployed category names/ids may differ
# between local branches, so resolve IDs from slugs instead of assuming deploy order.
CATEGORY_SLUGS=(
  "trust"           # Trust
  "design"          # Design
  "developer-docs"  # Developer Docs
  "products"        # Products
  "local-places"    # Local Places
  "travel"          # Travel
  "media"           # Media
  "apps"            # Apps
  "design"          # Design
  "general"         # General
  "media"           # Media
  "media"           # Media
  "travel"          # Travel
  "apps"            # Apps
  "trust"           # Trust
  "products"        # Products
)

resolve_category_id() {
  local slug="$1"
  local category_id
  if ! category_id=$(node "$CATEGORY_ID_RESOLVER" "$CATEGORY_REGISTRY" "$slug" "$RPC"); then
    exit 1
  fi
  printf "%s" "$category_id"
}

CATEGORY_IDS=()
for CATEGORY_SLUG in "${CATEGORY_SLUGS[@]}"; do
  CATEGORY_IDS+=("$(resolve_category_id "$CATEGORY_SLUG")")
done

echo "=== Seeding example image and video questions ==="
echo "(Test accounts were pre-funded with cREP during deployment)"
echo ""

TOTAL_ITEMS="${#URLS[@]}"
if [ "$TOTAL_ITEMS" -ne "${#TITLES[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#DESCRIPTIONS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#TAGS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#CATEGORY_SLUGS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#CATEGORY_IDS[@]}" ]; then
  echo "ERROR: Seed content arrays must have the same length"
  exit 1
fi
if [ "$TOTAL_ITEMS" -gt "${#KEYS[@]}" ]; then
  echo "ERROR: Not enough seeded account keys for $TOTAL_ITEMS questions"
  exit 1
fi

# Submit questions from accounts 2-10 (some reused for later categories)
for ((i = 0; i < TOTAL_ITEMS; i++)); do
  KEY="${KEYS[$i]}"
  URL="${URLS[$i]}"
  TITLE="${TITLES[$i]}"
  DESCRIPTION="${DESCRIPTIONS[$i]}"
  TAG="${TAGS[$i]}"
  CATEGORY_ID="${CATEGORY_IDS[$i]}"
  CATEGORY_SLUG="${CATEGORY_SLUGS[$i]}"
  MEDIA_KIND="image"
  IMAGE_URLS_ARG="[\"$URL\"]"
  VIDEO_URL_ARG=""
  case "$URL" in
    *youtube.com*|*youtu.be*)
      MEDIA_KIND="video"
      IMAGE_URLS_ARG="[]"
      VIDEO_URL_ARG="$URL"
      ;;
    *)
      MEDIA_KIND="image"
      ;;
  esac

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

  # 2. Reserve the hidden submission commitment before revealing the question metadata
  printf -v SALT "%064x" "$((i + 1))"
  REVEAL_COMMITMENT=$(node "$SCRIPT_DIR/../scripts-js/buildSubmissionReservation.js" \
    "$RPC" "$REGISTRY" "$ADDR" "$URL" "$TITLE" "$DESCRIPTION" "$TAG" "$CATEGORY_ID" "0x$SALT")
  echo "  Reserving submission..."
  cast send "$REGISTRY" "reserveSubmission(bytes32)" "$REVEAL_COMMITMENT" \
    --private-key "$KEY" --rpc-url "$RPC" > /dev/null 2>&1

  # The registry enforces a small reveal delay to make front-running reservations harder.
  sleep 1

  # 3. Reveal the submission with the same deterministic salt used for the reservation
  echo "  Submitting question: $TITLE ($MEDIA_KIND: $URL, category: $CATEGORY_SLUG -> $CATEGORY_ID)"
  cast send "$REGISTRY" "submitQuestionWithMedia(string[],string,string,string,string,uint256,bytes32)" \
    "$IMAGE_URLS_ARG" "$VIDEO_URL_ARG" "$TITLE" "$DESCRIPTION" "$TAG" "$CATEGORY_ID" "0x$SALT" \
    --private-key "$KEY" --rpc-url "$RPC" > /dev/null 2>&1
  echo "  Done!"
  echo ""
done

echo "=== Seed complete: $TOTAL_ITEMS question items submitted ==="
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

# Mine a few blocks so seeded voting happens after the initial setup transactions.
echo "Mining blocks before seeded votes..."
for _ in {1..5}; do
  cast rpc anvil_mine --rpc-url "$RPC" > /dev/null 2>&1
done

# Vote on content items 1, 2, and 3 using commitVote (tlock commit-reveal).
# commitVote(uint256 contentId, uint64 targetRound, bytes32 drandChainHash, bytes32 commitHash, bytes ciphertext, uint256 stakeAmount, address frontend)
# commitHash = keccak256(abi.encodePacked(isUp, salt, contentId, targetRound, drandChainHash, keccak256(ciphertext)))
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
  local targetRound
  local drandChainHash
  local artifacts

  cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" \
    --private-key "$privKey" --rpc-url "$RPC" > /dev/null 2>&1

  artifacts=$(node "$SCRIPT_DIR/../scripts-js/generateTlockCommit.js" \
    "$RPC" "$VOTING_ENGINE" "$contentId" "$isUp" "0x${salt}") || {
    echo "  (Failed to build tlock ciphertext)"
    return 1
  }
  commitHash=$(printf '%s\n' "$artifacts" | sed -n '1p')
  ciphertext=$(printf '%s\n' "$artifacts" | sed -n '2p')
  targetRound=$(printf '%s\n' "$artifacts" | sed -n '3p')
  drandChainHash=$(printf '%s\n' "$artifacts" | sed -n '4p')

  cast send "$VOTING_ENGINE" \
    "commitVote(uint256,uint64,bytes32,bytes32,bytes,uint256,address)" \
    "$contentId" "$targetRound" "$drandChainHash" "$commitHash" "$ciphertext" "$VOTE_STAKE" "$ZERO_ADDR" \
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
