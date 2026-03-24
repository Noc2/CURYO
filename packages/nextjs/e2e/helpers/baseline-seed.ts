import { approveCREP, commitVoteDirect, submitContentDirect, waitForPonderIndexed } from "./admin-helpers";
import { ANVIL_ACCOUNTS } from "./anvil-accounts";
import { CONTRACT_ADDRESSES } from "./contracts";
import { getContentById, getContentList } from "./ponder-api";

const SUBMIT_STAKE = BigInt(10e6);
const VOTE_STAKE = BigInt(5e6);
const DEFAULT_EPOCH_DURATION_SECONDS = 20 * 60;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const BASELINE_CONTENT = [
  {
    url: "https://www.youtube.com/watch?v=rUCAdMnb1Oc",
    title: "Ethereum in Practice",
    description: "Learn how Ethereum works under the hood - from transactions to the EVM.",
    tags: "Technology,Education",
    categoryId: 1,
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    title: "YouTube Player API Demo",
    description: "Official demo video used for testing YouTube embeds and player integrations.",
    tags: "Technology,Testing,Video",
    categoryId: 1,
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "https://www.youtube.com/watch?v=aircAruvnKk",
    title: "Neural Networks, Visualized",
    description: "A visual introduction to neural networks and deep learning fundamentals.",
    tags: "Science,Education,Technology",
    categoryId: 1,
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://scryfall.com/card/lea/232/black-lotus",
    title: "Black Lotus",
    description: "The most iconic and valuable card in Magic history - the legendary Black Lotus.",
    tags: "Artifacts,Commanders",
    categoryId: 3,
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "https://www.themoviedb.org/movie/238-the-godfather",
    title: "The Godfather",
    description: "Francis Ford Coppola's masterpiece - widely considered one of the greatest films ever made.",
    tags: "Drama,Crime",
    categoryId: 4,
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://en.wikipedia.org/wiki/Lionel_Messi",
    title: "Lionel Messi",
    description: "Widely regarded as one of the greatest footballers of all time.",
    tags: "Athletes,Sports",
    categoryId: 5,
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://en.wikipedia.org/wiki/Marie_Curie",
    title: "Marie Curie",
    description: "Pioneer in radioactivity research and the first person to win two Nobel Prizes.",
    tags: "Scientists,History",
    categoryId: 5,
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
  {
    url: "https://rawg.io/games/elden-ring",
    title: "Elden Ring",
    description: "FromSoftware's epic open-world action RPG - a landmark in modern game design.",
    tags: "Action,RPG",
    categoryId: 6,
    submitter: ANVIL_ACCOUNTS.account9.address,
  },
  {
    url: "https://rawg.io/games/baldurs-gate-3",
    title: "Baldur's Gate 3",
    description: "Larian Studios' critically acclaimed RPG - a masterclass in player choice and storytelling.",
    tags: "RPG,Adventure",
    categoryId: 6,
    submitter: ANVIL_ACCOUNTS.account10.address,
  },
  {
    url: "https://openlibrary.org/works/OL45883W/Fantastic_Mr_Fox",
    title: "Fantastic Mr. Fox",
    description: "Roald Dahl's beloved tale of a clever fox outsmarting three mean farmers.",
    tags: "Fiction,Fantasy",
    categoryId: 7,
    submitter: ANVIL_ACCOUNTS.account2.address,
  },
  {
    url: "https://openlibrary.org/works/OL27516W/The_Hitchhikers_Guide_to_the_Galaxy",
    title: "The Hitchhiker's Guide to the Galaxy",
    description: "Douglas Adams' comedic sci-fi classic - the answer is 42.",
    tags: "Science Fiction,Fiction",
    categoryId: 7,
    submitter: ANVIL_ACCOUNTS.account3.address,
  },
  {
    url: "https://www.coingecko.com/en/coins/bitcoin",
    title: "Bitcoin",
    description:
      "The original cryptocurrency - a peer-to-peer electronic cash system that pioneered decentralized finance.",
    tags: "Layer 1,Infrastructure",
    categoryId: 9,
    submitter: ANVIL_ACCOUNTS.account4.address,
  },
  {
    url: "https://www.coingecko.com/en/coins/ethereum",
    title: "Ethereum",
    description:
      "The world's leading smart contract platform - powering DeFi, NFTs, and decentralized applications.",
    tags: "Layer 1,DeFi",
    categoryId: 9,
    submitter: ANVIL_ACCOUNTS.account5.address,
  },
  {
    url: "https://github.com/ethereum/go-ethereum",
    title: "go-ethereum",
    description: "Official Go implementation of Ethereum - the backbone of most Ethereum nodes worldwide.",
    tags: "Infrastructure,DeFi/Web3",
    categoryId: 11,
    submitter: ANVIL_ACCOUNTS.account6.address,
  },
  {
    url: "https://github.com/foundry-rs/foundry",
    title: "Foundry",
    description: "Blazing-fast Solidity toolkit - forge, cast, anvil, and chisel for smart contract development.",
    tags: "Developer Tools,Infrastructure",
    categoryId: 11,
    submitter: ANVIL_ACCOUNTS.account7.address,
  },
  {
    url: "https://open.spotify.com/show/5eXZwvvxt3K2dxha3BSaAe",
    title: "Spotify Engineering Stories",
    description: "Engineering stories and behind-the-scenes conversations from Spotify's own podcast feed.",
    tags: "Technology,Culture",
    categoryId: 12,
    submitter: ANVIL_ACCOUNTS.account8.address,
  },
] as const;

const BASELINE_COMMITS = [
  {
    contentId: 1n,
    voter: ANVIL_ACCOUNTS.account9.address,
    isUp: true,
  },
  {
    contentId: 2n,
    voter: ANVIL_ACCOUNTS.account9.address,
    isUp: true,
  },
  {
    contentId: 1n,
    voter: ANVIL_ACCOUNTS.account10.address,
    isUp: false,
  },
  {
    contentId: 3n,
    voter: ANVIL_ACCOUNTS.account10.address,
    isUp: true,
  },
] as const;

export async function ensureBaselineSeedData(): Promise<void> {
  const existing = await getContentList({ status: "all", limit: 100 });
  const existingUrls = new Set(existing.items.map(item => item.url));
  const missingContent = BASELINE_CONTENT.filter(item => !existingUrls.has(item.url));

  if (missingContent.length > 0) {
    console.log(`  ⓘ Seeding ${missingContent.length} baseline content item(s) for E2E...`);
  }

  for (const item of missingContent) {
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
      item.categoryId,
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
        const { items } = await getContentList({ status: "all", limit: 100 });
        return items.length >= BASELINE_CONTENT.length;
      },
      120_000,
      2_000,
      "seedBaselineContent",
    );
    if (!contentIndexed) {
      throw new Error("Baseline content did not finish indexing in Ponder");
    }
  }

  const [{ rounds: rounds1 }, { rounds: rounds2 }, { rounds: rounds3 }] = await Promise.all([
    getContentById(1),
    getContentById(2),
    getContentById(3),
  ]);
  const seededVoteCounts = [Number(rounds1[0]?.voteCount ?? "0"), Number(rounds2[0]?.voteCount ?? "0"), Number(rounds3[0]?.voteCount ?? "0")];
  const votesAlreadySeeded = seededVoteCounts[0] >= 2 && seededVoteCounts[1] >= 1 && seededVoteCounts[2] >= 1;
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
    const { success } = await commitVoteDirect(
      vote.contentId,
      vote.isUp,
      VOTE_STAKE,
      ZERO_ADDRESS,
      vote.voter,
      CONTRACT_ADDRESSES.RoundVotingEngine,
      DEFAULT_EPOCH_DURATION_SECONDS,
    );
    if (!success) {
      throw new Error(`Failed to seed vote for content ${vote.contentId.toString()}`);
    }
  }

  const votesIndexed = await waitForPonderIndexed(
    async () => {
      const [{ rounds: updatedRounds1 }, { rounds: updatedRounds2 }, { rounds: updatedRounds3 }] = await Promise.all([
        getContentById(1),
        getContentById(2),
        getContentById(3),
      ]);

      const voteCount = (rounds: Array<{ voteCount: string }>) => Number(rounds[0]?.voteCount ?? "0");
      return voteCount(updatedRounds1) >= 2 && voteCount(updatedRounds2) >= 1 && voteCount(updatedRounds3) >= 1;
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
