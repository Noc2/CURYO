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
    inputs: [{ name: "domain", type: "string" }],
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
const categoryIdByDomain = new Map<string, bigint>();

async function resolveCategoryIdByDomain(domain: string): Promise<bigint> {
  const cached = categoryIdByDomain.get(domain);
  if (cached !== undefined) return cached;

  const [{ createPublicClient, http }, { foundry }] = await Promise.all([import("viem"), import("viem/chains")]);
  const publicClient = createPublicClient({ chain: foundry, transport: http(E2E_RPC_URL) });
  const category = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.CategoryRegistry as `0x${string}`,
    abi: CATEGORY_REGISTRY_ABI,
    functionName: "getCategoryByDomain",
    args: [domain],
  });
  const categoryId = "id" in category ? category.id : category[0];
  categoryIdByDomain.set(domain, categoryId);
  return categoryId;
}

const BASELINE_CONTENT = [
  {
    url: "",
    title: "Is this refund policy easy to understand?",
    description:
      "Voters should judge whether the plain-language summary explains refunds, timelines, and exceptions clearly enough for a first-time buyer.",
    tags: "Policy,Clarity,Trust",
    categoryDomain: "safety.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-workspace/1200/800.jpg",
    title: "Does this workspace feel ready for deep work?",
    description:
      "Rate the image and context as a calm workspace for focused technical writing, not as a luxury interior shot.",
    tags: "Photography,Usefulness,Atmosphere",
    categoryDomain: "design.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "",
    title: "Is this API quickstart beginner friendly?",
    description:
      "Judge whether a new developer could complete the first request without missing setup, authentication, or error handling steps.",
    tags: "Getting Started,Readability,Examples",
    categoryDomain: "docs.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-product-label/1200/800.jpg",
    title: "Is this product label readable on mobile?",
    description:
      "Focus on whether the label hierarchy, contrast, and key details would still be clear in a small shopping card.",
    tags: "Design,Usability,Quality",
    categoryDomain: "products.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "",
    title: "Would this cafe review help locals choose?",
    description:
      "The review mentions noise, service speed, seating, and price. Vote on whether it is specific enough to guide a nearby visitor.",
    tags: "Local Tips,Service,Value",
    categoryDomain: "local.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-hotel-room/1200/800.jpg",
    title: "Does this hotel room look clean and comfortable?",
    description:
      "Use the visible room condition and the written context to judge whether the listing earns a higher community rating.",
    tags: "Hotels,Cleanliness,Comfort",
    categoryDomain: "travel.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "",
    title: "Is this AI answer careful enough to publish?",
    description:
      "The answer gives a confident summary but leaves out uncertainty and source limits. Vote on helpfulness, clarity, and safety.",
    tags: "Helpfulness,Clarity,Safety",
    categoryDomain: "ai-answers.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
  {
    url: "",
    title: "Should this app onboarding copy be shorter?",
    description:
      "The flow explains wallet connection, Voter ID, and staking in one screen. Judge whether the copy reduces friction or overloads new users.",
    tags: "Onboarding,Trust,Usability",
    categoryDomain: "apps.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account9.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-event-poster/1200/800.jpg",
    title: "Does this poster make the event easy to grasp?",
    description:
      "Voters should judge hierarchy, contrast, and whether date, place, and purpose are legible at a glance.",
    tags: "Visual Design,Typography,Layout",
    categoryDomain: "design.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account10.address,
  },
  {
    url: "",
    title: "Is this dinner plan practical for a weeknight?",
    description:
      "Rate whether the plan balances prep time, nutrition, cleanup, and ingredient availability for a busy household.",
    tags: "Usefulness,Clear,Worthwhile",
    categoryDomain: "opinion.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-media-hero/1200/800.jpg",
    title: "Does this image work as a hero visual?",
    description:
      "Judge whether the image has enough focus, contrast, and mood to support a question about human review quality.",
    tags: "Images,Art,Photography",
    categoryDomain: "media.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "",
    title: "Would this failed-vote message reduce support tickets?",
    description:
      "The message explains gas, wallet RPC issues, and retry timing. Vote on whether it is actionable without being too technical.",
    tags: "Web Apps,Troubleshooting,Trust",
    categoryDomain: "apps.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-street-guide/1200/800.jpg",
    title: "Does this street scene feel welcoming?",
    description:
      "Use the image as travel context. Vote on whether it would make a neighborhood guide feel inviting and credible.",
    tags: "Location,Photography,Solo Travel",
    categoryDomain: "travel.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "",
    title: "Is this accessibility checklist launch ready?",
    description:
      "Review the checklist for keyboard support, focus states, text contrast, reduced motion, and mobile overflow coverage.",
    tags: "Accessibility,Quality,Testing",
    categoryDomain: "apps.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "",
    title: "Does this moderation rule set clear voter expectations?",
    description:
      "Judge whether the rule tells voters when to downvote illegal, unsafe, misleading, or mismatched submissions.",
    tags: "Moderation,Policy,Risk",
    categoryDomain: "safety.curyo.xyz",
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://picsum.photos/seed/curyo-product-photo/1200/800.jpg",
    title: "Is this product photo useful enough to compare?",
    description:
      "Focus on scale, detail, lighting, and whether the photo helps a buyer compare the item without extra marketing claims.",
    tags: "Quality,Design,Value",
    categoryDomain: "products.curyo.xyz",
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
    const categoryId = await resolveCategoryIdByDomain(item.categoryDomain);
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
