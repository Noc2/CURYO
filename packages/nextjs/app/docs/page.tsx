import Link from "next/link";
import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">The Reputation Game for the Age of AI.</p>

      <h2>Mission</h2>
      <p>
        The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of
        content, the flood of low-effort material will only accelerate — making trustworthy quality signals more
        critical than ever. Curyo fights back by tying every vote to a verified reputation. When you stake real tokens
        on your judgment, low-quality content loses and high-quality content rises — no algorithms, no ads, no
        manipulation.
      </p>

      <h2>What is Curyo?</h2>
      <p>
        Curyo replaces passive likes with <strong>prediction games</strong>. Voters predict whether content&apos;s
        rating will go UP or DOWN and back their predictions with cREP token stakes. The majority side wins and the
        losing side&apos;s stakes are distributed to the winners.
      </p>

      <h2>Key Principles</h2>
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
        <FeatureCard
          title="Skin in the Game"
          description="Every vote requires a token stake, aligning incentives. Points come from the losing side's stakes."
        />
        <FeatureCard
          title="Voter ID (Sybil Resistance)"
          description="Each verified human gets one soulbound Voter ID NFT, limiting stake to 100 cREP per content per round."
        />
        <FeatureCard
          title="Per-Content Rounds"
          description="Each content item accumulates public votes within a round. A bonding curve rewards early conviction with more shares. Settlement is probabilistic, triggered after a minimum block count."
        />
        <FeatureCard
          title="Contributor Rewards"
          description="Content submitters receive 10%, category submitters 1%, and frontend operators 1% of the losing pool."
        />
      </div>

      <h2>Voting Flow</h2>
      <p>
        Voters predict whether content&apos;s rating will go <strong>UP</strong> or <strong>DOWN</strong> and back their
        prediction with a cREP stake. Votes are immediately public and price-moving &mdash; a bonding curve determines
        how many shares each voter receives, rewarding early conviction.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose UP or DOWN, select stake (1&ndash;100 cREP per Voter ID). Your vote is public
          and immediately recorded on-chain.
        </li>
        <li>
          <strong>Accumulate:</strong> Votes accumulate within the round. Live tallies are visible at all times.
        </li>
        <li>
          <strong>Settlement:</strong> After the minimum epoch length has passed and enough votes have been cast, anyone
          can trigger settlement via <code>trySettle()</code>. Settlement is probabilistic, using{" "}
          <code>block.prevrandao</code> randomness. The majority side wins and the losing side&apos;s stakes become the
          reward pool.
        </li>
      </ol>
      <p>The losing pool is split:</p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>
      <p>
        Winners always get their original stake back plus their share of the pools. See{" "}
        <Link href="/docs/how-it-works">How It Works</Link> for full details.
      </p>

      <h2>Content Rating</h2>
      <p>
        Every content item has a <strong>rating from 0 to 100</strong>, starting at 50. After each round settles, the
        winning side moves the rating UP or DOWN by 1&ndash;5 points depending on the total stake and number of voters.
      </p>
      <p>
        Each category (platform) has a <strong>ranking question</strong> set by its creator &mdash; for example,
        &ldquo;Is this content good enough to score above 75 out of 100?&rdquo;. When you vote UP or DOWN, you are
        answering this question for the current content. The question is displayed on the voting card.
      </p>
      <p>
        <strong>When to downvote:</strong> Illegal content, content that doesn&apos;t load, or content with an incorrect
        description should always be downvoted, regardless of the ranking question. Content that falls below a rating of
        10 after its grace period results in the submitter&apos;s stake being slashed.
      </p>
    </article>
  );
};

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-base text-base-content/50 leading-relaxed">{description}</p>
    </div>
  );
}

export default DocsIntro;
