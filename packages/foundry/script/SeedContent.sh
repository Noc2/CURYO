#!/usr/bin/env bash
# Seed script: submits example question-first content from different accounts.
# Uses foundry's default anvil/hardhat accounts (indices 2-10 for content, 9-10 also for voting).
# Only runs on localhost (chain 31337).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_JSON="$SCRIPT_DIR/../deployments/31337.json"
CATEGORY_ID_RESOLVER="$SCRIPT_DIR/../scripts-js/resolveCategoryId.js"

RPC="http://127.0.0.1:8545"
SUBMISSION_BOUNTY_AMOUNT="1000000" # 1 HREP in 6 decimals (default minimum submission Bounty)
SUBMISSION_BOUNTY_REQUIRED_VOTERS="3"
SUBMISSION_BOUNTY_REQUIRED_SETTLED_ROUNDS="1"
SUBMISSION_BOUNTY_EXPIRES_AT="0"
SUBMISSION_BUNDLE_BOUNTY_ASSET="1" # Mock USDC on localhost
SUBMISSION_BUNDLE_BOUNTY_AMOUNT="30000000" # 30 mock USDC in 6 decimals
SUBMISSION_BUNDLE_BOUNTY_DEADLINE_SECONDS=$((30 * 24 * 60 * 60))
BUNDLE_FUNDER_KEY_INDEX="1"
SUBMISSION_ROUND_EPOCH_DURATION="1200"
SUBMISSION_ROUND_MAX_DURATION="604800"
SUBMISSION_ROUND_MIN_VOTERS="3"
SUBMISSION_ROUND_MAX_VOTERS="1000"
VOTE_STAKE="5000000" # 5 HREP for votes

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
TOKEN=$(grep -o '"0x[^"]*": "HumanReputation"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
REGISTRY=$(grep -o '"0x[^"]*": "ContentRegistry"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
QUESTION_REWARD_POOL_ESCROW=$(grep -o '"0x[^"]*": "QuestionRewardPoolEscrow"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
FEEDBACK_BONUS_ESCROW=$(grep -o '"0x[^"]*": "FeedbackBonusEscrow"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
USDC_TOKEN=$(grep -o '"0x[^"]*": "MockERC20"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
VOTING_ENGINE=$(grep -o '"0x[^"]*": "RoundVotingEngine"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)
CATEGORY_REGISTRY=$(grep -o '"0x[^"]*": "CategoryRegistry"' "$DEPLOY_JSON" | grep -o '0x[^"]*' || true)

if [ -z "$TOKEN" ] || [ -z "$REGISTRY" ] || [ -z "$QUESTION_REWARD_POOL_ESCROW" ] || [ -z "$CATEGORY_REGISTRY" ]; then
  echo "ERROR: Could not read contract addresses from $DEPLOY_JSON"
  exit 1
fi

echo "HumanReputation:         $TOKEN"
echo "ContentRegistry:         $REGISTRY"
echo "QuestionRewardPoolEscrow: $QUESTION_REWARD_POOL_ESCROW"
echo "FeedbackBonusEscrow:     $FEEDBACK_BONUS_ESCROW"
echo "Mock USDC:               $USDC_TOKEN"
echo "RoundVotingEngine:       $VOTING_ENGINE"
echo "CategoryRegistry:        $CATEGORY_REGISTRY"
echo ""

# Anvil/hardhat default private keys
# Accounts 2-10 for question submission (some reused for later questions), 9-10 also for voting
# Note: These accounts are pre-funded with HREP during deployment (see DeployCuryo.s.sol)
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
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"  # Account 9 (reused)
)

# Example Curyo 2 questions always include a context URL. Preview media is optional.
# Curyo 2 default categoryIds:
# 1=Products, 2=Places & Travel, 3=Software, 4=Media, 5=Design,
# 6=AI Answers, 7=Text, 8=Trust, 9=General
CONTEXT_URLS=(
  "https://example.com/curyo-refund-policy"
  "https://picsum.photos/seed/curyo-workspace/1200/800.jpg"
  "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"
  "https://picsum.photos/seed/curyo-product-label/1200/800.jpg"
  "https://picsum.photos/seed/curyo-cafe-review/1200/800.jpg"
  "https://picsum.photos/seed/curyo-hotel-room/1200/800.jpg"
  "https://www.youtube.com/watch?v=jNQXAC9IVRw"
  "https://docs.celo.org/build"
  "https://picsum.photos/seed/curyo-event-poster/1200/800.jpg"
  "https://picsum.photos/seed/curyo-weeknight-dinner/1200/800.jpg"
  "https://picsum.photos/seed/curyo-media-hero-primary/1200/800.jpg"
  "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
  "https://picsum.photos/seed/curyo-street-guide/1200/800.jpg"
  "https://www.w3.org/WAI/standards-guidelines/wcag/"
  "https://example.com/curyo-moderation-rules"
  "https://picsum.photos/seed/curyo-product-photo/1200/800.jpg"
  "https://www.qualtrics.com/articles/strategy-research/synthetic-data-market-research/"
)

IMAGE_URLS=(
  "[]"
  "[]"
  "[]"
  "[]"
  "[]"
  "[]"
  "[]"
  "[]"
  "[]"
  "[]"
  '["https://picsum.photos/seed/curyo-media-hero-primary/1200/800.jpg","https://picsum.photos/seed/curyo-media-hero-detail/1200/800.jpg","https://picsum.photos/seed/curyo-media-hero-contrast/1200/800.jpg","https://picsum.photos/seed/curyo-media-hero-mobile/1200/800.jpg"]'
  "[]"
  "[]"
  "[]"
  "[]"
  '["https://picsum.photos/seed/curyo-product-photo/1200/800.jpg","https://picsum.photos/seed/curyo-product-photo-detail/1200/800.jpg"]'
  "[]"
)

SUBMISSION_BOUNTY_AMOUNTS=(
  "$SUBMISSION_BOUNTY_AMOUNT"
  "2500000"
  "5000000"
  "10000000"
  "1500000"
  "3000000"
  "4000000"
  "6000000"
  "2000000"
  "8000000"
  "12000000"
  "1000000"
  "7000000"
  "3500000"
  "5500000"
  "9000000"
  "15000000"
)

FEEDBACK_BONUS_CONTENT_IDS=(1 4 7 11)
FEEDBACK_BONUS_AMOUNTS=(
  "25000000"  # 25 USDC
  "50000000"  # 50 USDC
  "75000000"  # 75 USDC
  "100000000" # 100 USDC
)
FEEDBACK_BONUS_FUNDER_KEY_INDEXES=(1 4 8 7)
FEEDBACK_BONUS_ROUND_ID="1"
FEEDBACK_BONUS_DEADLINE_SECONDS=$((30 * 24 * 60 * 60))

VIDEO_URLS=(
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
  ""
)

TITLES=(
  "Should this support agent approve the refund?"
  "Can an agent trust this workspace photo?"
  "Does this source answer the agent's API question?"
  "Would an agent overrate this product label on mobile?"
  "Would this review help a travel agent recommend the cafe?"
  "Does this hotel photo look trustworthy enough to book?"
  "Should an agent share this short video?"
  "Does this onboarding explain managed budgets clearly?"
  "Would founders understand this launch poster at a glance?"
  "Is this answer actually useful for a busy household?"
  "Does this image set make the landing page feel credible?"
  "Does this demo clip make the product feel real?"
  "Does this street view help an agent judge the neighborhood?"
  "Is this accessibility checklist ready for an AI coding agent?"
  "Should this moderation policy block agent-submitted spam?"
  "Does this product photo make the offer feel trustworthy?"
  "Do these synthetic insights need human validation?"
)

DESCRIPTIONS=(
  "Use the policy summary to judge whether an automated support agent should approve the request without escalation."
  "Judge whether the image gives enough visual evidence for an agent to rate a remote-work listing as calm and credible."
  "Judge whether a new agent or developer could use this guide to make a first request without missing setup, auth, or error handling."
  "Focus on whether hierarchy, contrast, and key details stay readable enough for a shopping agent to recommend the item on mobile."
  "Judge whether the evidence about noise, service, seating, and price is specific enough for a local recommendation agent."
  "Use the visible room condition and context to judge whether a booking agent should treat this listing as clean, credible, and comfortable."
  "Judge whether the clip has enough context, pacing, and clarity for an agent to include it in a digest or recommendation."
  "The flow should help agents and operators understand wallet setup, spend caps, and when to ask humans instead of guessing."
  "Judge whether the headline, date, and purpose are clear enough for rapid launch-page or event validation."
  "Treat the plan like an AI-generated recommendation and judge whether it balances prep time, nutrition, cleanup, and ingredient availability."
  "Judge whether the gallery gives a product agent enough focus, contrast, and variety to support a trustworthy launch page."
  "Vote on whether the motion, pacing, and focal points make the launch clip feel believable rather than synthetic filler."
  "Use the image as local context and judge whether it makes a neighborhood guide feel welcoming, safe, and credible."
  "Judge whether the checklist is concrete enough for an agent to ship keyboard support, focus states, contrast, reduced motion, and mobile overflow safely."
  "Judge whether the rule gives clear guidance for unsafe, misleading, mismatched, or synthetic spammy submissions."
  "Focus on scale, detail, lighting, and whether the photo gives a shopping or research agent enough signal to compare the offer."
  "Use the research context to judge whether an AI-generated takeaway should be validated with verified humans before a product decision."
)

TAGS=(
  "Agent Review,Policy,Trust"
  "Workspace,Authenticity,Trust"
  "Evidence Quality,API,Docs"
  "Products,Mobile,Clarity"
  "Local Context,Travel Agent,Usefulness"
  "Booking,Travel,Trust"
  "Agent Share,Video,Clarity"
  "Onboarding,Agents,Budgets"
  "Message Test,Launch,Design"
  "AI Answer,Usefulness,Household"
  "Landing Page,Credibility,Images"
  "Demo Video,Authenticity,Launch"
  "Neighborhood,Local Context,Trust"
  "Accessibility,Coding Agent,Quality"
  "Moderation,Agents,Policy"
  "Products,Trust,Research"
  "Synthetic Research,Validation,AI Agents"
)

# Stable category slugs for each seeded question. The deployed category names/ids may differ
# between local branches, so resolve IDs from slugs instead of assuming deploy order.
CATEGORY_SLUGS=(
  "trust"           # Trust
  "trust"           # Trust
  "ai-answers"      # AI Answers
  "products"        # Products
  "places-travel"   # Places & Travel
  "places-travel"   # Places & Travel
  "media"           # Media
  "software"        # Software
  "design"          # Design
  "ai-answers"      # AI Answers
  "design"          # Design
  "media"           # Media
  "places-travel"   # Places & Travel
  "software"        # Software
  "trust"           # Trust
  "products"        # Products
  "ai-answers"      # AI Answers
)

BUNDLE_CONTEXT_URLS=(
  "https://example.com/curyo-bundled-agent-answer-review"
  "https://example.com/curyo-bundled-agent-answer-review"
  "https://example.com/curyo-bundled-agent-answer-review"
)

BUNDLE_IMAGE_URLS=(
  "[]"
  "[]"
  "[]"
)

BUNDLE_VIDEO_URLS=(
  ""
  ""
  ""
)

BUNDLE_TITLES=(
  "Which answer gives the safest user-facing recommendation?"
  "Which answer explains the source tradeoffs most clearly?"
  "Which answer should be escalated to a human reviewer?"
)

BUNDLE_DESCRIPTIONS=(
  "Review the same research brief and judge whether the agent's final recommendation is safe enough to show to users."
  "Use the shared context to compare how well the answer explains uncertainty, source quality, and missing evidence."
  "Decide whether the answer leaves enough risk or ambiguity that a human should review it before it ships."
)

BUNDLE_TAGS=(
  "Bundled Bounty,AI Answers,Trust"
  "Bundled Bounty,Source Quality,AI Answers"
  "Bundled Bounty,Escalation,Review"
)

BUNDLE_CATEGORY_SLUGS=(
  "ai-answers"
  "ai-answers"
  "ai-answers"
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

BUNDLE_CATEGORY_IDS=()
for BUNDLE_CATEGORY_SLUG in "${BUNDLE_CATEGORY_SLUGS[@]}"; do
  BUNDLE_CATEGORY_IDS+=("$(resolve_category_id "$BUNDLE_CATEGORY_SLUG")")
done

echo "=== Seeding example AI agent and research questions ==="
echo "(Test accounts were pre-funded with HREP during deployment; seeded Bounties use varied HREP amounts)"
echo ""

TOTAL_ITEMS="${#CONTEXT_URLS[@]}"
if [ "$TOTAL_ITEMS" -ne "${#TITLES[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#DESCRIPTIONS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#TAGS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#IMAGE_URLS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#VIDEO_URLS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#SUBMISSION_BOUNTY_AMOUNTS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#CATEGORY_SLUGS[@]}" ] ||
  [ "$TOTAL_ITEMS" -ne "${#CATEGORY_IDS[@]}" ]; then
  echo "ERROR: Seed content arrays must have the same length"
  exit 1
fi
if [ "$TOTAL_ITEMS" -gt "${#KEYS[@]}" ]; then
  echo "ERROR: Not enough seeded account keys for $TOTAL_ITEMS questions"
  exit 1
fi

BUNDLE_QUESTION_COUNT="${#BUNDLE_CONTEXT_URLS[@]}"
if [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_IMAGE_URLS[@]}" ] ||
  [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_VIDEO_URLS[@]}" ] ||
  [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_TITLES[@]}" ] ||
  [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_DESCRIPTIONS[@]}" ] ||
  [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_TAGS[@]}" ] ||
  [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_CATEGORY_SLUGS[@]}" ] ||
  [ "$BUNDLE_QUESTION_COUNT" -ne "${#BUNDLE_CATEGORY_IDS[@]}" ]; then
  echo "ERROR: Bundle seed content arrays must have the same length"
  exit 1
fi
if [ "$BUNDLE_QUESTION_COUNT" -lt 2 ]; then
  echo "ERROR: Bundle seed content must include multiple questions"
  exit 1
fi
if [ "$BUNDLE_FUNDER_KEY_INDEX" -ge "${#KEYS[@]}" ]; then
  echo "ERROR: Bundle funder key index is out of range"
  exit 1
fi

# Submit questions from accounts 2-10 (some reused for later categories)
for ((i = 0; i < TOTAL_ITEMS; i++)); do
  KEY="${KEYS[$i]}"
  CONTEXT_URL="${CONTEXT_URLS[$i]}"
  IMAGE_URLS_ARG="${IMAGE_URLS[$i]}"
  VIDEO_URL_ARG="${VIDEO_URLS[$i]}"
  TITLE="${TITLES[$i]}"
  DESCRIPTION="${DESCRIPTIONS[$i]}"
  TAG="${TAGS[$i]}"
  BOUNTY_AMOUNT="${SUBMISSION_BOUNTY_AMOUNTS[$i]}"
  CATEGORY_ID="${CATEGORY_IDS[$i]}"
  CATEGORY_SLUG="${CATEGORY_SLUGS[$i]}"
  MEDIA_KIND="context-only"
  if [ "$IMAGE_URLS_ARG" != "[]" ]; then
    MEDIA_KIND="preview-images"
  elif [ -n "$VIDEO_URL_ARG" ]; then
    MEDIA_KIND="preview-video"
  fi

  ADDR=$(cast wallet address "$KEY")
  echo "[$((i+1))/$TOTAL_ITEMS] Account: $ADDR"

  # Ensure account has ETH for gas (Anvil only pre-funds first 10 accounts)
  ETH_BAL=$(cast balance "$ADDR" --rpc-url "$RPC" 2>/dev/null || echo "0")
  if [ "$ETH_BAL" = "0" ]; then
    echo "  Funding with ETH..."
    cast rpc anvil_setBalance "$ADDR" "0x8AC7230489E80000" --rpc-url "$RPC" > /dev/null 2>&1
  fi

  # 1. Approve the Bounty escrow to pull the non-refundable HREP submission Bounty
  echo "  Approving HREP Bounty: $BOUNTY_AMOUNT"
  cast send "$TOKEN" "approve(address,uint256)" "$QUESTION_REWARD_POOL_ESCROW" "$BOUNTY_AMOUNT" --private-key "$KEY" --rpc-url "$RPC" > /dev/null

  # 2. Reserve the hidden submission commitment before revealing the question metadata
  printf -v SALT "%064x" "$((i + 1))"
  REVEAL_COMMITMENT=$(node "$SCRIPT_DIR/../scripts-js/buildSubmissionReservation.js" \
    "$RPC" "$REGISTRY" "$ADDR" "$CONTEXT_URL" "$IMAGE_URLS_ARG" "$VIDEO_URL_ARG" "$TITLE" "$DESCRIPTION" "$TAG" "$CATEGORY_ID" "0x$SALT" \
    "0" "$BOUNTY_AMOUNT" "$SUBMISSION_BOUNTY_REQUIRED_VOTERS" "$SUBMISSION_BOUNTY_REQUIRED_SETTLED_ROUNDS" "$SUBMISSION_BOUNTY_EXPIRES_AT" \
    "$SUBMISSION_ROUND_EPOCH_DURATION" "$SUBMISSION_ROUND_MAX_DURATION" "$SUBMISSION_ROUND_MIN_VOTERS" "$SUBMISSION_ROUND_MAX_VOTERS")
  echo "  Reserving submission..."
  cast send "$REGISTRY" "reserveSubmission(bytes32)" "$REVEAL_COMMITMENT" \
    --private-key "$KEY" --rpc-url "$RPC" > /dev/null

  # The registry enforces a small reveal delay to make front-running reservations harder.
  sleep 1

  # 3. Reveal the submission with the same deterministic salt used for the reservation
  echo "  Submitting question: $TITLE ($MEDIA_KIND, bounty: $BOUNTY_AMOUNT, context: $CONTEXT_URL, category: $CATEGORY_SLUG -> $CATEGORY_ID)"
  cast send "$REGISTRY" "submitQuestionWithRewardAndRoundConfig(string,string[],string,string,string,string,uint256,bytes32,(uint8,uint256,uint256,uint256,uint256,uint256),(uint32,uint32,uint16,uint16))" \
    "$CONTEXT_URL" "$IMAGE_URLS_ARG" "$VIDEO_URL_ARG" "$TITLE" "$DESCRIPTION" "$TAG" "$CATEGORY_ID" "0x$SALT" \
    "(0,$BOUNTY_AMOUNT,$SUBMISSION_BOUNTY_REQUIRED_VOTERS,$SUBMISSION_BOUNTY_REQUIRED_SETTLED_ROUNDS,$SUBMISSION_BOUNTY_EXPIRES_AT,$SUBMISSION_BOUNTY_EXPIRES_AT)" \
    "($SUBMISSION_ROUND_EPOCH_DURATION,$SUBMISSION_ROUND_MAX_DURATION,$SUBMISSION_ROUND_MIN_VOTERS,$SUBMISSION_ROUND_MAX_VOTERS)" \
    --private-key "$KEY" --rpc-url "$RPC" > /dev/null
  echo "  Done!"
  echo ""
done

BUNDLE_SUBMITTED_COUNT="0"
if [ -z "$USDC_TOKEN" ]; then
  echo "Skipping bundled question bounty: Mock USDC not found"
  echo ""
else
  echo "=== Seeding bundled question bounty ==="
  echo "(One mock-USDC bounty funds multiple questions from the same research context)"
  echo ""

  BUNDLE_FUNDER_KEY="${KEYS[$BUNDLE_FUNDER_KEY_INDEX]}"
  BUNDLE_FUNDER_ADDR=$(cast wallet address "$BUNDLE_FUNDER_KEY")
  echo "Bundle funder: $BUNDLE_FUNDER_ADDR"

  ETH_BAL=$(cast balance "$BUNDLE_FUNDER_ADDR" --rpc-url "$RPC" 2>/dev/null || echo "0")
  if [ "$ETH_BAL" = "0" ]; then
    echo "  Funding with ETH..."
    cast rpc anvil_setBalance "$BUNDLE_FUNDER_ADDR" "0x8AC7230489E80000" --rpc-url "$RPC" > /dev/null 2>&1
  fi

  CURRENT_BLOCK_TIMESTAMP=$(cast block latest --field timestamp --rpc-url "$RPC" | tr -d '[:space:]')
  BUNDLE_BOUNTY_CLOSES_AT=$((CURRENT_BLOCK_TIMESTAMP + SUBMISSION_BUNDLE_BOUNTY_DEADLINE_SECONDS))
  BUNDLE_QUESTION_ARGS=()
  for ((i = 0; i < BUNDLE_QUESTION_COUNT; i++)); do
    printf -v BUNDLE_SALT "%064x" "$((100 + i + 1))"
    BUNDLE_QUESTION_ARGS+=(
      "${BUNDLE_CONTEXT_URLS[$i]}"
      "${BUNDLE_IMAGE_URLS[$i]}"
      "${BUNDLE_VIDEO_URLS[$i]}"
      "${BUNDLE_TITLES[$i]}"
      "${BUNDLE_DESCRIPTIONS[$i]}"
      "${BUNDLE_TAGS[$i]}"
      "${BUNDLE_CATEGORY_IDS[$i]}"
      "0x$BUNDLE_SALT"
    )
    echo "  - ${BUNDLE_TITLES[$i]} (${BUNDLE_CATEGORY_SLUGS[$i]} -> ${BUNDLE_CATEGORY_IDS[$i]})"
  done

  echo "  Approving mock USDC bundle bounty: $SUBMISSION_BUNDLE_BOUNTY_AMOUNT"
  cast send "$USDC_TOKEN" "approve(address,uint256)" "$QUESTION_REWARD_POOL_ESCROW" "$SUBMISSION_BUNDLE_BOUNTY_AMOUNT" \
    --private-key "$BUNDLE_FUNDER_KEY" --rpc-url "$RPC" > /dev/null

  BUNDLE_BUILD_OUTPUT=$(node "$SCRIPT_DIR/../scripts-js/buildQuestionBundleReservation.js" \
    "$BUNDLE_FUNDER_ADDR" "$SUBMISSION_BUNDLE_BOUNTY_ASSET" "$SUBMISSION_BUNDLE_BOUNTY_AMOUNT" \
    "$SUBMISSION_BOUNTY_REQUIRED_VOTERS" "$SUBMISSION_BOUNTY_REQUIRED_SETTLED_ROUNDS" \
    "$BUNDLE_BOUNTY_CLOSES_AT" "$BUNDLE_BOUNTY_CLOSES_AT" \
    "$SUBMISSION_ROUND_EPOCH_DURATION" "$SUBMISSION_ROUND_MAX_DURATION" "$SUBMISSION_ROUND_MIN_VOTERS" "$SUBMISSION_ROUND_MAX_VOTERS" \
    -- "${BUNDLE_QUESTION_ARGS[@]}")
  BUNDLE_REVEAL_COMMITMENT=$(printf '%s\n' "$BUNDLE_BUILD_OUTPUT" | sed -n '1p')
  BUNDLE_CALLDATA=$(printf '%s\n' "$BUNDLE_BUILD_OUTPUT" | sed -n '2p')

  echo "  Reserving bundled submission..."
  cast send "$REGISTRY" "reserveSubmission(bytes32)" "$BUNDLE_REVEAL_COMMITMENT" \
    --private-key "$BUNDLE_FUNDER_KEY" --rpc-url "$RPC" > /dev/null

  sleep 1

  echo "  Submitting bundled questions with one bounty..."
  cast send "$REGISTRY" "$BUNDLE_CALLDATA" \
    --private-key "$BUNDLE_FUNDER_KEY" --rpc-url "$RPC" > /dev/null

  BUNDLE_SUBMITTED_COUNT="$BUNDLE_QUESTION_COUNT"
  echo "  Done!"
  echo ""
fi

echo "=== Seed complete: $TOTAL_ITEMS standalone questions and $BUNDLE_SUBMITTED_COUNT bundled question items submitted ==="
echo ""

# --- Feedback Bonus Section ---
if [ -z "$FEEDBACK_BONUS_ESCROW" ] || [ -z "$USDC_TOKEN" ]; then
  echo "Skipping feedback bonuses: FeedbackBonusEscrow or Mock USDC not found"
  echo ""
else
  FEEDBACK_BONUS_COUNT="${#FEEDBACK_BONUS_CONTENT_IDS[@]}"
  if [ "$FEEDBACK_BONUS_COUNT" -ne "${#FEEDBACK_BONUS_AMOUNTS[@]}" ] ||
    [ "$FEEDBACK_BONUS_COUNT" -ne "${#FEEDBACK_BONUS_FUNDER_KEY_INDEXES[@]}" ]; then
    echo "ERROR: Feedback bonus arrays must have the same length"
    exit 1
  fi

  CURRENT_BLOCK_TIMESTAMP=$(cast block latest --field timestamp --rpc-url "$RPC" | tr -d '[:space:]')
  FEEDBACK_BONUS_AWARD_DEADLINE=$((CURRENT_BLOCK_TIMESTAMP + FEEDBACK_BONUS_DEADLINE_SECONDS))

  echo "=== Opening feedback bonus pools for selected questions ==="
  echo "(Only a subset of seeded questions gets feedback bonuses for local testing)"
  echo ""

  for ((i = 0; i < FEEDBACK_BONUS_COUNT; i++)); do
    CONTENT_ID="${FEEDBACK_BONUS_CONTENT_IDS[$i]}"
    BONUS_AMOUNT="${FEEDBACK_BONUS_AMOUNTS[$i]}"
    FUNDER_KEY_INDEX="${FEEDBACK_BONUS_FUNDER_KEY_INDEXES[$i]}"
    FUNDER_KEY="${KEYS[$FUNDER_KEY_INDEX]}"
    FUNDER_ADDR=$(cast wallet address "$FUNDER_KEY")

    echo "[$((i+1))/$FEEDBACK_BONUS_COUNT] Content $CONTENT_ID: funding feedback bonus of $BONUS_AMOUNT mock USDC from $FUNDER_ADDR"
    cast send "$USDC_TOKEN" "approve(address,uint256)" "$FEEDBACK_BONUS_ESCROW" "$BONUS_AMOUNT" \
      --private-key "$FUNDER_KEY" --rpc-url "$RPC" > /dev/null
    cast send "$FEEDBACK_BONUS_ESCROW" "createFeedbackBonusPool(uint256,uint256,uint256,uint256,address)" \
      "$CONTENT_ID" "$FEEDBACK_BONUS_ROUND_ID" "$BONUS_AMOUNT" "$FEEDBACK_BONUS_AWARD_DEADLINE" "$FUNDER_ADDR" \
      --private-key "$FUNDER_KEY" --rpc-url "$RPC" > /dev/null
    echo "  Done!"
    echo ""
  done

  echo "=== Feedback bonus setup complete: $FEEDBACK_BONUS_COUNT pools opened ==="
  echo ""
fi

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
# commitVote(uint256 contentId, uint16 roundReferenceRatingBps, uint64 targetRound, bytes32 drandChainHash, bytes32 commitHash, bytes ciphertext, uint256 stakeAmount, address frontend)
# commitHash = keccak256(abi.encodePacked(isUp, salt, contentId, roundReferenceRatingBps, targetRound, drandChainHash, keccak256(ciphertext)))
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
  local roundReferenceRatingBps
  local artifacts

  cast send "$TOKEN" "approve(address,uint256)" "$VOTING_ENGINE" "$VOTE_STAKE" \
    --private-key "$privKey" --rpc-url "$RPC" > /dev/null

  artifacts=$(node "$SCRIPT_DIR/../scripts-js/generateTlockCommit.js" \
    "$RPC" "$VOTING_ENGINE" "$contentId" "$isUp" "0x${salt}") || {
    echo "  (Failed to build tlock ciphertext)"
    return 1
  }
  commitHash=$(printf '%s\n' "$artifacts" | sed -n '1p')
  ciphertext=$(printf '%s\n' "$artifacts" | sed -n '2p')
  targetRound=$(printf '%s\n' "$artifacts" | sed -n '3p')
  drandChainHash=$(printf '%s\n' "$artifacts" | sed -n '4p')
  roundReferenceRatingBps=$(printf '%s\n' "$artifacts" | sed -n '5p')

  cast send "$VOTING_ENGINE" \
    "commitVote(uint256,uint16,uint64,bytes32,bytes32,bytes,uint256,address)" \
    "$contentId" "$roundReferenceRatingBps" "$targetRound" "$drandChainHash" "$commitHash" "$ciphertext" "$VOTE_STAKE" "$ZERO_ADDR" \
    --private-key "$privKey" --rpc-url "$RPC" > /dev/null || { echo "  (Commit may have failed)"; return 1; }
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
