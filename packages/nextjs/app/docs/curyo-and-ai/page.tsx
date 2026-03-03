import Link from "next/link";
import type { NextPage } from "next";

const CuryoAndAI: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Curyo &amp; AI</h1>
      <p className="lead text-base-content/60 text-lg">Why stake-weighted human curation matters in the age of AI.</p>

      <h2>The AI Content Flood</h2>
      <p>
        Generative AI has collapsed the cost of producing text, images, and video to near zero. Anyone can generate
        thousands of articles, social media posts, or product reviews in minutes. The result is a web increasingly
        saturated with low-effort, AI-generated material that is often indistinguishable from human-created content at
        the surface level.
      </p>
      <p>
        Traditional quality signals &mdash; likes, upvotes, follower counts, engagement metrics &mdash; were designed
        for a web where creating content required effort. They are trivially gamed by AI agents operating thousands of
        accounts. Engagement-based algorithms amplify what gets clicks, not what has genuine quality. The web needs a
        new layer of trustworthy, manipulation-resistant quality signals.
      </p>

      <h2>Model Collapse &amp; The Training Data Crisis</h2>
      <p>
        Research published in <em>Nature</em> (Shumailov et al., 2024) demonstrates <strong>model collapse</strong>{" "}
        &mdash; when AI models are trained on AI-generated content, they progressively lose fidelity to the original
        data distribution. Each generation of models trained on synthetic data degrades further, losing the tails of the
        distribution where nuanced, minority, and expert perspectives live.
      </p>
      <p>
        This creates an urgent need for verified human quality signals. As AI-generated content floods the web, training
        pipelines face an increasingly noisy signal-to-noise ratio. The ability to reliably identify genuinely
        high-quality, human-verified content becomes a critical infrastructure problem. Curyo&apos;s stake-weighted
        ratings provide exactly this: quality assessments backed by economic commitment from verified humans.
      </p>

      <h2>Stake-Weighted Curation as AI Infrastructure</h2>
      <p>
        The concept of{" "}
        <a
          href="https://a16z.com/newsletter/big-ideas-2026-part-3/#the-rise-of-staked-media"
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary"
        >
          &ldquo;staked media&rdquo;
        </a>{" "}
        &mdash; as articulated by a16z &mdash; proposes that content quality can be assessed through economic commitment
        rather than algorithmic engagement. Curyo implements this thesis directly: voters stake cREP tokens on their
        quality predictions, and the prediction pool system ensures that accurate assessments are rewarded while
        inaccurate ones are penalized.
      </p>
      <p>
        Because votes use an <Link href="/docs/how-it-works">epoch-weighted reward model</Link>, Tier 1 voters who
        commit during the blind epoch earn 4x more reward weight than Tier 2+ voters who saw prior results. This creates
        an economic incentive for <strong>independent assessment</strong> &mdash; voters who commit early while
        directions are hidden take on more risk and are compensated accordingly. The tlock encryption naturally prevents
        herding by making vote directions invisible during the first epoch.
      </p>
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
        <FeatureCard
          title="Economic Commitment"
          description="Every rating is backed by a token stake, making systematic manipulation expensive relative to the signal produced."
        />
        <FeatureCard
          title="Early Conviction Rewarded"
          description="Epoch-weighted rewards give Tier 1 (blind) voters 4x more reward per cREP, rewarding those who assess quality independently before directions are revealed."
        />
        <FeatureCard
          title="Sybil Resistance"
          description="One passport = one Voter ID. No sock puppet farms can flood the signal, regardless of how many wallets an attacker controls."
        />
        <FeatureCard
          title="Verifiable Provenance"
          description="All votes are permanently recorded with timestamps, stake amounts, and outcomes — fully auditable by anyone."
        />
      </div>

      <h2>Public Ratings as a Public Good</h2>
      <p>
        A core design reason for building Curyo on a blockchain is that{" "}
        <strong>all rating data is inherently public and exportable</strong>. Every vote, every stake amount, every
        round outcome, and every resulting content rating is stored permanently and publicly, accessible by anyone.
        There is no API rate limit, no terms-of-service restriction, and no company that can revoke access.
      </p>
      <p>This makes Curyo&apos;s ratings available as a public good for the entire ecosystem:</p>
      <ul>
        <li>
          <strong>AI training pipelines</strong> can incorporate Curyo scores to filter or weight training data by
          human-verified quality, helping mitigate model collapse.
        </li>
        <li>
          <strong>Search engines and recommendation systems</strong> can use public ratings as an independent quality
          signal, reducing dependence on engagement-based proxies.
        </li>
        <li>
          <strong>Researchers</strong> can analyze voting patterns, content quality trends, and curation dynamics with
          full transparency &mdash; no data access barriers.
        </li>
        <li>
          <strong>Third-party platforms</strong> can build on top of Curyo&apos;s quality layer without permission or
          payment.
        </li>
      </ul>
      <p>
        Unlike centralized rating platforms where data is locked behind proprietary APIs or paywalls, blockchain-native
        ratings are a <strong>public commons by default</strong>. This aligns with the broader thesis that the
        AI-dominated web needs open, verifiable quality infrastructure &mdash; not more walled gardens.
      </p>

      <h2>AI-Assisted Voting with Human Oversight</h2>
      <p>
        Curyo does not just produce data for AI &mdash; it also uses AI as a participant. Automated voting bots use
        pluggable rating strategies that query external APIs to obtain normalized quality scores for submitted content.
        The bot votes UP or DOWN based on whether the score meets a configurable threshold.
      </p>
      <p>
        Bot votes use the same public <Link href="/docs/how-it-works">voting mechanism</Link> as human votes &mdash;
        they are indistinguishable in the public record.
      </p>

      <h3>Human Oversight</h3>
      <p>
        The system is deliberately designed so that human voters always have the final say. Bots stake the minimum
        amount of cREP per vote, while human voters can stake significantly more. In contentious rounds, the aggregate
        human stake dominates bot contributions. The prediction pool system provides natural selection pressure: bot
        strategies that produce inaccurate ratings lose their stakes, while accurate strategies accumulate reputation
        over time.
      </p>

      <h3>Cold-Start Mitigation</h3>
      <p>
        AI-assisted voting directly addresses the <strong>cold-start problem</strong> inherent in new content platforms.
        When a content item is submitted, automated strategies can produce initial quality signals within seconds,
        seeding the voting market before human participants engage. This creates immediate activity and provides a focal
        point for human voters to agree or disagree with, accelerating convergence toward accurate ratings.
      </p>
      <p>
        The combination of AI speed and human judgment creates a hybrid curation model: bots provide breadth and
        responsiveness, humans provide depth and authority. Neither alone is sufficient &mdash; together they produce
        richer, faster, and more reliable quality signals than either could independently.
      </p>

      <h2>Future Directions</h2>
      <p>Curyo&apos;s architecture enables several extensions at the intersection of AI and decentralized curation:</p>
      <ul>
        <li>
          <strong>Cross-platform quality oracle</strong> &mdash; Public content ratings can serve as an oracle that
          other protocols and platforms query, creating a shared quality layer across the decentralized web.
        </li>
        <li>
          <strong>Expertise-weighted reputation</strong> &mdash; Domain-specific reputation multipliers could allow
          voters with demonstrated accuracy in specific categories (e.g., scientific papers, game reviews) to earn
          additional influence, improving signal quality in specialized domains.
        </li>
        <li>
          <strong>Content provenance integration</strong> &mdash; Combining Curyo ratings with content provenance
          standards (C2PA) would create a two-layered trust system: provenance verifies origin, stake-weighted curation
          verifies quality.
        </li>
        <li>
          <strong>Advanced AI strategies</strong> &mdash; The pluggable strategy interface supports increasingly
          sophisticated approaches, from API-based lookups to LLM-driven content analysis. The prediction pool system
          ensures that only strategies producing accurate ratings survive long-term.
        </li>
      </ul>
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

export default CuryoAndAI;
