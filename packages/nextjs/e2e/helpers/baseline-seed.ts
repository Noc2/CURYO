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
    name: "getCategoryByDomain",
    type: "function",
    inputs: [{ name: "slug", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "name", type: "string" },
          { name: "domain", type: "string" },
          { name: "subcategories", type: "string[]" },
          { name: "submitter", type: "address" },
          { name: "stakeAmount", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "proposalId", type: "uint256" },
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
    functionName: "getCategoryByDomain",
    args: [slug],
  });
  const categoryId = "id" in category ? category.id : category[0];
  categoryIdBySlug.set(slug, categoryId);
  return categoryId;
}

const BASELINE_CONTENT = [
  {
    url: "https://picsum.photos/seed/curyo-refund-policy/1200/800.jpg",
    title: "Is this refund policy easy to understand?",
    description:
      "Voters should judge whether the plain-language summary explains refunds, timelines, and exceptions clearly enough for a first-time buyer.",
    tags: "Policy,Clarity,Trust",
    categorySlug: "trust",
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-workspace/1200/800.jpg",
    title: "Does this workspace feel ready for deep work?",
    description:
      "Rate the image and context as a calm workspace for focused technical writing, not as a luxury interior shot.",
    tags: "Photography,Usefulness,Atmosphere",
    categorySlug: "design",
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-api-docs/1200/800.jpg",
    title: "Is this API quickstart beginner friendly?",
    description:
      "Judge whether a new developer could complete the first request without missing setup, authentication, or error handling steps.",
    tags: "Getting Started,Readability,Examples",
    categorySlug: "developer-docs",
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-product-label/1200/800.jpg",
    title: "Is this product label readable on mobile?",
    description:
      "Focus on whether the label hierarchy, contrast, and key details would still be clear in a small shopping card.",
    tags: "Design,Usability,Quality",
    categorySlug: "products",
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-cafe-review/1200/800.jpg",
    title: "Would this cafe review help locals choose?",
    description:
      "The review mentions noise, service speed, seating, and price. Vote on whether it is specific enough to guide a nearby visitor.",
    tags: "Local Tips,Service,Value",
    categorySlug: "local-places",
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-hotel-room/1200/800.jpg",
    title: "Does this hotel room look clean and comfortable?",
    description:
      "Use the visible room condition and the written context to judge whether the listing earns a higher community rating.",
    tags: "Hotels,Cleanliness,Comfort",
    categorySlug: "travel",
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    title: "Is this short video clear enough to share?",
    description:
      "Judge whether the clip has enough context, pacing, and visual clarity for a viewer to understand it without extra explanation.",
    tags: "Video,Clarity,Context",
    categorySlug: "media",
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-app-onboarding/1200/800.jpg",
    title: "Should this app onboarding copy be shorter?",
    description:
      "The flow explains wallet connection, Voter ID, and staking in one screen. Judge whether the copy reduces friction or overloads new users.",
    tags: "Onboarding,Trust,Usability",
    categorySlug: "apps",
    submitter: ANVIL_ACCOUNTS.account9.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-event-poster/1200/800.jpg",
    title: "Does this poster make the event easy to grasp?",
    description:
      "Voters should judge hierarchy, contrast, and whether date, place, and purpose are legible at a glance.",
    tags: "Visual Design,Typography,Layout",
    categorySlug: "design",
    submitter: ANVIL_ACCOUNTS.account10.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-weeknight-dinner/1200/800.jpg",
    title: "Is this dinner plan practical for a weeknight?",
    description:
      "Rate whether the plan balances prep time, nutrition, cleanup, and ingredient availability for a busy household.",
    tags: "Usefulness,Clear,Worthwhile",
    categorySlug: "general",
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
    title: "Does this image set work as a hero gallery?",
    description:
      "Judge whether the image set has enough focus, contrast, variety, and mobile-safe composition to support a hero gallery.",
    tags: "Images,Gallery,Photography",
    categorySlug: "media",
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    title: "Does this animated clip hold attention?",
    description:
      "Vote on whether the movement, pacing, and visual focus make the clip engaging enough for a general audience.",
    tags: "Video,Animation,Engagement",
    categorySlug: "media",
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-street-guide/1200/800.jpg",
    title: "Does this street scene feel welcoming?",
    description:
      "Use the image as travel context. Vote on whether it would make a neighborhood guide feel inviting and credible.",
    tags: "Location,Photography,Solo Travel",
    categorySlug: "travel",
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-accessibility-checklist/1200/800.jpg",
    title: "Is this accessibility checklist launch ready?",
    description:
      "Review the checklist for keyboard support, focus states, text contrast, reduced motion, and mobile overflow coverage.",
    tags: "Accessibility,Quality,Testing",
    categorySlug: "apps",
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-moderation-rules/1200/800.jpg",
    title: "Does this moderation rule set clear voter expectations?",
    description:
      "Judge whether the rule tells voters when to downvote illegal, unsafe, misleading, or mismatched submissions.",
    tags: "Moderation,Policy,Risk",
    categorySlug: "trust",
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-product-photo/1200/800.jpg",
    title: "Is this product photo useful enough to compare?",
    description:
      "Focus on scale, detail, lighting, and whether the photo helps a buyer compare the item without extra marketing claims.",
    tags: "Quality,Design,Value",
    categorySlug: "products",
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
] as const;

const BASELINE_COMMITS = [
  {
    title: "Is this refund policy easy to understand?",
    voter: ANVIL_ACCOUNTS.account9.address,
    isUp: true,
  },
  {
    title: "Does this workspace feel ready for deep work?",
    voter: ANVIL_ACCOUNTS.account9.address,
    isUp: true,
  },
  {
    title: "Is this refund policy easy to understand?",
    voter: ANVIL_ACCOUNTS.account10.address,
    isUp: false,
  },
  {
    title: "Is this API quickstart beginner friendly?",
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
