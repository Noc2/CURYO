import { approveCREP, commitVoteDirect, submitContentDirect, waitForPonderIndexed } from "./admin-helpers";
import { ANVIL_ACCOUNTS } from "./anvil-accounts";
import { CONTRACT_ADDRESSES } from "./contracts";
import { getContentById, getContentList } from "./ponder-api";
import { E2E_RPC_URL } from "./service-urls";

const SUBMIT_STAKE = BigInt(10e6);
const VOTE_STAKE = BigInt(5e6);
const DEFAULT_EPOCH_DURATION_SECONDS = 20 * 60;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CATEGORY_REGISTRY_ABI = [
  {
    name: "getCategoryBySlug",
    type: "function",
    inputs: [{ name: "slug", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "name", type: "string" },
          { name: "slug", type: "string" },
          { name: "subcategories", type: "string[]" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;
const categoryIdBySlug = new Map<string, bigint>();

async function resolveCategoryIdBySlug(slug: string): Promise<bigint> {
  const cached = categoryIdBySlug.get(slug);
  if (cached !== undefined) return cached;

  const [{ createPublicClient, http }, { foundry }] = await Promise.all([import("viem"), import("viem/chains")]);
  const publicClient = createPublicClient({ chain: foundry, transport: http(E2E_RPC_URL) });
  const category = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.CategoryRegistry as `0x${string}`,
    abi: CATEGORY_REGISTRY_ABI,
    functionName: "getCategoryBySlug",
    args: [slug],
  });
  const categoryId = "id" in category ? category.id : category[0];
  categoryIdBySlug.set(slug, categoryId);
  return categoryId;
}

const BASELINE_CONTENT = [
  {
    url: "https://example.com/curyo-refund-policy",
    title: "Should this support agent approve the refund?",
    description:
      "Use the policy summary to judge whether an automated support agent should approve the request without escalation.",
    tags: "Agent Review,Policy,Trust",
    categorySlug: "trust",
    bountyAmount: 1_000_000n,
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-workspace/1200/800.jpg",
    title: "Can an agent trust this workspace photo?",
    description:
      "Judge whether the image gives enough visual evidence for an agent to rate a remote-work listing as calm and credible.",
    tags: "Workspace,Authenticity,Trust",
    categorySlug: "trust",
    bountyAmount: 2_500_000n,
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    title: "Does this source answer the agent's API question?",
    description:
      "Judge whether a new agent or developer could use this guide to make a first request without missing setup, auth, or error handling.",
    tags: "Evidence Quality,API,Docs",
    categorySlug: "ai-answers",
    bountyAmount: 5_000_000n,
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-product-label/1200/800.jpg",
    title: "Would an agent overrate this product label on mobile?",
    description:
      "Focus on whether hierarchy, contrast, and key details stay readable enough for a shopping agent to recommend the item on mobile.",
    tags: "Products,Mobile,Clarity",
    categorySlug: "products",
    bountyAmount: 10_000_000n,
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-cafe-review/1200/800.jpg",
    title: "Would this review help a travel agent recommend the cafe?",
    description:
      "Judge whether the evidence about noise, service, seating, and price is specific enough for a local recommendation agent.",
    tags: "Local Context,Travel Agent,Usefulness",
    categorySlug: "places-travel",
    bountyAmount: 1_500_000n,
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-hotel-room/1200/800.jpg",
    title: "Does this hotel photo look trustworthy enough to book?",
    description:
      "Use the visible room condition and context to judge whether a booking agent should treat this listing as clean, credible, and comfortable.",
    tags: "Booking,Travel,Trust",
    categorySlug: "places-travel",
    bountyAmount: 3_000_000n,
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    title: "Should an agent share this short video?",
    description:
      "Judge whether the clip has enough context, pacing, and clarity for an agent to include it in a digest or recommendation.",
    tags: "Agent Share,Video,Clarity",
    categorySlug: "media",
    bountyAmount: 4_000_000n,
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
  {
    url: "https://docs.celo.org/build",
    title: "Does this onboarding explain managed budgets clearly?",
    description:
      "The flow should help agents and operators understand wallet setup, spend caps, and when to ask humans instead of guessing.",
    tags: "Onboarding,Agents,Budgets",
    categorySlug: "software",
    bountyAmount: 6_000_000n,
    submitter: ANVIL_ACCOUNTS.account9.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-event-poster/1200/800.jpg",
    title: "Would founders understand this launch poster at a glance?",
    description:
      "Judge whether the headline, date, and purpose are clear enough for rapid launch-page or event validation.",
    tags: "Message Test,Launch,Design",
    categorySlug: "design",
    bountyAmount: 2_000_000n,
    submitter: ANVIL_ACCOUNTS.account10.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-weeknight-dinner/1200/800.jpg",
    title: "Is this answer actually useful for a busy household?",
    description:
      "Treat the plan like an AI-generated recommendation and judge whether it balances prep time, nutrition, cleanup, and ingredient availability.",
    tags: "AI Answer,Usefulness,Household",
    categorySlug: "ai-answers",
    bountyAmount: 8_000_000n,
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-media-hero-primary/1200/800.jpg",
    imageUrls: [
      "https://picsum.photos/seed/curyo-media-hero-primary/1200/800.jpg",
      "https://picsum.photos/seed/curyo-media-hero-detail/1200/800.jpg",
      "https://picsum.photos/seed/curyo-media-hero-contrast/1200/800.jpg",
      "https://picsum.photos/seed/curyo-media-hero-mobile/1200/800.jpg",
    ],
    title: "Does this image set make the landing page feel credible?",
    description:
      "Judge whether the gallery gives a product agent enough focus, contrast, and variety to support a trustworthy launch page.",
    tags: "Landing Page,Credibility,Images",
    categorySlug: "design",
    bountyAmount: 12_000_000n,
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    title: "Does this demo clip make the product feel real?",
    description:
      "Vote on whether the motion, pacing, and focal points make the launch clip feel believable rather than synthetic filler.",
    tags: "Demo Video,Authenticity,Launch",
    categorySlug: "media",
    bountyAmount: 1_000_000n,
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-street-guide/1200/800.jpg",
    title: "Does this street view help an agent judge the neighborhood?",
    description:
      "Use the image as local context and judge whether it makes a neighborhood guide feel welcoming, safe, and credible.",
    tags: "Neighborhood,Local Context,Trust",
    categorySlug: "places-travel",
    bountyAmount: 7_000_000n,
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "https://www.w3.org/WAI/standards-guidelines/wcag/",
    title: "Is this accessibility checklist ready for an AI coding agent?",
    description:
      "Judge whether the checklist is concrete enough for an agent to ship keyboard support, focus states, contrast, reduced motion, and mobile overflow safely.",
    tags: "Accessibility,Coding Agent,Quality",
    categorySlug: "software",
    bountyAmount: 3_500_000n,
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://example.com/curyo-moderation-rules",
    title: "Should this moderation policy block agent-submitted spam?",
    description:
      "Judge whether the rule gives clear guidance for unsafe, misleading, mismatched, or synthetic spammy submissions.",
    tags: "Moderation,Agents,Policy",
    categorySlug: "trust",
    bountyAmount: 5_500_000n,
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-product-photo/1200/800.jpg",
    imageUrls: [
      "https://picsum.photos/seed/curyo-product-photo/1200/800.jpg",
      "https://picsum.photos/seed/curyo-product-photo-detail/1200/800.jpg",
    ],
    title: "Does this product photo make the offer feel trustworthy?",
    description:
      "Focus on scale, detail, lighting, and whether the photo gives a shopping or research agent enough signal to compare the offer.",
    tags: "Products,Trust,Research",
    categorySlug: "products",
    bountyAmount: 9_000_000n,
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
  {
    url: "https://www.qualtrics.com/articles/strategy-research/synthetic-data-market-research/",
    title: "Do these synthetic insights need human validation?",
    description:
      "Use the research context to judge whether an AI-generated takeaway should be validated with verified humans before a product decision.",
    tags: "Synthetic Research,Validation,AI Agents",
    categorySlug: "ai-answers",
    bountyAmount: 15_000_000n,
    submitter: ANVIL_ACCOUNTS.account10.address,
  },
] as const;

const BASELINE_COMMITS = [
  {
    title: "Should this support agent approve the refund?",
    voter: ANVIL_ACCOUNTS.account9.address,
    isUp: true,
  },
  {
    title: "Can an agent trust this workspace photo?",
    voter: ANVIL_ACCOUNTS.account9.address,
    isUp: true,
  },
  {
    title: "Should this support agent approve the refund?",
    voter: ANVIL_ACCOUNTS.account10.address,
    isUp: false,
  },
  {
    title: "Does this source answer the agent's API question?",
    voter: ANVIL_ACCOUNTS.account10.address,
    isUp: true,
  },
] as const;

async function getBaselineContentByTitle(): Promise<Map<string, { id: string; title: string }>> {
  const { items } = await getContentList({ status: "all", limit: 500 });
  return new Map(items.map(item => [item.title, { id: item.id, title: item.title }]));
}

export async function ensureBaselineSeedData(): Promise<void> {
  const baselineTitles = new Set(BASELINE_CONTENT.map(item => item.title));
  const existing = await getContentList({ status: "all", limit: 500 });
  const existingTitles = new Set(existing.items.map(item => item.title));
  const missingContent = BASELINE_CONTENT.filter(item => !existingTitles.has(item.title));

  if (missingContent.length > 0) {
    console.log(`  ⓘ Seeding ${missingContent.length} baseline content item(s) for E2E...`);
  }

  for (const item of missingContent) {
    const categoryId = await resolveCategoryIdBySlug(item.categorySlug);
    const approved = await approveCREP(
      CONTRACT_ADDRESSES.ContentRegistry,
      SUBMIT_STAKE,
      item.submitter,
      CONTRACT_ADDRESSES.CuryoReputation,
    );
    if (!approved) {
      throw new Error(`Failed to approve submit stake for ${item.title}`);
    }

    const submitted = await submitContentDirect(
      item.url,
      item.title,
      item.description,
      item.tags,
      categoryId,
      item.submitter,
      CONTRACT_ADDRESSES.ContentRegistry,
      "imageUrls" in item ? { imageUrls: item.imageUrls } : undefined,
      item.bountyAmount,
    );
    if (!submitted) {
      throw new Error(`Failed to seed baseline content: ${item.title}`);
    }
  }

  if (missingContent.length > 0) {
    const contentIndexed = await waitForPonderIndexed(
      async () => {
        const indexedByTitle = await getBaselineContentByTitle();
        return [...baselineTitles].every(title => indexedByTitle.has(title));
      },
      120_000,
      2_000,
      "seedBaselineContent",
    );
    if (!contentIndexed) {
      throw new Error("Baseline content did not finish indexing in Ponder");
    }
  }

  const contentByTitle = await getBaselineContentByTitle();
  const voteTargetsByTitle = new Map<string, bigint>();
  for (const vote of BASELINE_COMMITS) {
    const item = contentByTitle.get(vote.title);
    if (!item) throw new Error(`Missing baseline content for seeded vote: ${vote.title}`);
    voteTargetsByTitle.set(vote.title, BigInt(item.id));
  }

  const expectedVoteCountsById = new Map<bigint, number>();
  for (const contentId of voteTargetsByTitle.values()) {
    expectedVoteCountsById.set(
      contentId,
      BASELINE_COMMITS.filter(vote => voteTargetsByTitle.get(vote.title) === contentId).length,
    );
  }

  const seededVoteCounts = await Promise.all(
    [...expectedVoteCountsById.keys()].map(async contentId => {
      const { rounds } = await getContentById(contentId.toString());
      return Number(rounds[0]?.voteCount ?? "0");
    }),
  );
  const votesAlreadySeeded = seededVoteCounts.every(
    (count, index) => count >= [...expectedVoteCountsById.values()][index],
  );
  const hasPartialSeedVotes = seededVoteCounts.some(count => count > 0) && !votesAlreadySeeded;

  if (hasPartialSeedVotes) {
    throw new Error(
      `Baseline votes are partially seeded (${seededVoteCounts.join(", ")}). Reset the local chain before rerunning E2E.`,
    );
  }

  if (votesAlreadySeeded) {
    console.log(`  ✓ Baseline seed data already present (${existing.total} content items indexed)`);
    return;
  }

  const allowanceByVoter = new Map<string, bigint>();
  for (const vote of BASELINE_COMMITS) {
    allowanceByVoter.set(vote.voter, (allowanceByVoter.get(vote.voter) ?? 0n) + VOTE_STAKE);
  }

  for (const [voter, allowance] of allowanceByVoter.entries()) {
    const approved = await approveCREP(
      CONTRACT_ADDRESSES.RoundVotingEngine,
      allowance,
      voter,
      CONTRACT_ADDRESSES.CuryoReputation,
    );
    if (!approved) {
      throw new Error(`Failed to approve vote stake for ${voter}`);
    }
  }

  for (const vote of BASELINE_COMMITS) {
    const contentId = voteTargetsByTitle.get(vote.title);
    if (contentId === undefined) throw new Error(`Missing vote target for ${vote.title}`);

    const { success } = await commitVoteDirect(
      contentId,
      vote.isUp,
      VOTE_STAKE,
      ZERO_ADDRESS,
      vote.voter,
      CONTRACT_ADDRESSES.RoundVotingEngine,
      DEFAULT_EPOCH_DURATION_SECONDS,
    );
    if (!success) {
      throw new Error(`Failed to seed vote for content ${contentId.toString()}`);
    }
  }

  const votesIndexed = await waitForPonderIndexed(
    async () => {
      const updatedVoteCounts = await Promise.all(
        [...expectedVoteCountsById.keys()].map(async contentId => {
          const { rounds } = await getContentById(contentId.toString());
          return Number(rounds[0]?.voteCount ?? "0");
        }),
      );
      return updatedVoteCounts.every((count, index) => count >= [...expectedVoteCountsById.values()][index]);
    },
    120_000,
    2_000,
    "seedBaselineVotes",
  );
  if (!votesIndexed) {
    throw new Error("Baseline votes did not finish indexing in Ponder");
  }

  console.log(`  ✓ Seeded ${BASELINE_CONTENT.length} baseline content items and ${BASELINE_COMMITS.length} commits`);
}
