import Link from "next/link";
import type { NextPage } from "next";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";
const referenceAppSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/nextjs";
const keeperSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/keeper";
const ponderSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/ponder";
const contentModerationPolicySourceHref =
  "https://github.com/Noc2/CURYO/blob/main/packages/node-utils/src/contentModeration.ts";
const contentFilterSourceHref = "https://github.com/Noc2/CURYO/blob/main/packages/nextjs/utils/contentFilter.ts";
const ponderModerationSourceHref = "https://github.com/Noc2/CURYO/blob/main/packages/ponder/src/api/moderation.ts";
const submissionValidationSourceHref =
  "https://github.com/Noc2/CURYO/blob/main/packages/nextjs/lib/moderation/submissionValidation.ts";

const FrontendCodes: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Frontend Integrations</h1>
      <p className="lead text-base-content/60 text-lg">
        Add Curyo to an existing app with the SDK, then register a frontend operator if you want votes from your
        interface to accrue frontend fees.
      </p>

      <h2>Two Tracks</h2>
      <p>
        Most teams should think about integration in two layers. First, make the product work well in your app. Second,
        decide whether you also want to operate a registered frontend address and participate in the protocol&apos;s
        frontend-fee model.
      </p>

      <div className="not-prose grid gap-4 sm:grid-cols-2 my-6">
        <div className="surface-card rounded-xl p-4">
          <h3 className="mb-1.5 text-base font-semibold">Use the SDK</h3>
          <p className="text-base text-base-content/60 leading-relaxed">
            Use <code>@curyo/sdk</code> when you want hosted reads, vote helpers, and frontend attribution support in an
            existing website or app.
          </p>
          <Link href="/docs/sdk" className="link link-primary">
            Open SDK docs
          </Link>
        </div>

        <div className="surface-card rounded-xl p-4">
          <h3 className="mb-1.5 text-base font-semibold">Register an Operator</h3>
          <p className="text-base text-base-content/60 leading-relaxed">
            Register a frontend address when you want votes made through your interface to earn{" "}
            <strong>{protocolDocFacts.frontendShareLabel}</strong> from settled two-sided rounds.
          </p>
          <a href="#register-a-frontend-operator" className="link link-primary">
            Jump to operator setup
          </a>
        </div>
      </div>

      <h2>Start With the SDK</h2>
      <p>
        The SDK is the fastest path for integrating Curyo into an existing codebase. It packages the hosted read client
        and the vote/frontend helpers that the reference app already relies on.
      </p>
      <p>
        If you want implementation details, start with the{" "}
        <a href={sdkSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          SDK package
        </a>{" "}
        and the{" "}
        <a href={referenceAppSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          reference frontend
        </a>
        .
      </p>
      <ul>
        <li>Use it to fetch indexed content, profiles, rounds, votes, stats, categories, and frontend records.</li>
        <li>
          Use it to build vote commit payloads and transfer calldata without copying protocol plumbing into your app.
        </li>
        <li>
          Use <code>frontendCode</code> or <code>defaultFrontendCode</code> when your deployment should attribute votes
          to a registered frontend operator.
        </li>
      </ul>
      <p>
        The full implementation guide lives on the{" "}
        <Link href="/docs/sdk" className="link link-primary">
          SDK page
        </Link>
        .
      </p>

      <h2 id="register-a-frontend-operator">Register a Frontend Operator</h2>
      <p>
        Frontend operators who build frontends, mobile apps, or integrations receive{" "}
        <strong>{protocolDocFacts.frontendShareLabel}</strong> from settled two-sided rounds on votes made through their
        interface. Question Reward Pools also reserve a default 3% USDC share for the eligible frontend operator
        attributed at vote commit time.
      </p>
      <ol>
        <li>
          <strong>Stake 1,000 cREP</strong> to the FrontendRegistry contract.
        </li>
        <li>
          <strong>Integrate:</strong> Include your registered address in the vote payload, or configure it as the
          default frontend code in the SDK.
        </li>
        <li>
          <strong>Claim:</strong> First call{" "}
          <code>RoundRewardDistributor.claimFrontendFee(contentId, roundId, frontend)</code> from your operator address
          on each settled round, then withdraw your accumulated cREP from <code>FrontendRegistry.claimFees()</code>{" "}
          while active, or with <code>completeDeregister()</code> after exit. If governance slashes your frontend, you
          must restore the full 1,000 cREP bond before fee claims can accrue to you again. USDC reward-pool frontend
          shares are paid automatically when eligible voters claim.
        </li>
      </ol>

      <h2>Frontend Attribution</h2>
      <p>Include your frontend address in the payload you send through the single-transaction vote flow:</p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`CuryoReputation.transferAndCall(
    votingEngineAddress,
    stakeAmount,
    abi.encode(
        contentId,
        roundReferenceRatingBps,
        commitHash,
        ciphertext,
        frontend, // Your registered frontend address
        targetRound,
        drandChainHash
    )
)`}</code>
      </pre>
      <p>
        If you are using the SDK or the reference app, set <code>NEXT_PUBLIC_FRONTEND_CODE</code> to your operator
        address and the vote helpers will include it automatically.
      </p>

      <h2>Operator Responsibilities</h2>
      <p>
        Registering a frontend operator is more than adding one address to calldata. If you want to run a serious
        production integration, you should treat fee attribution, round resolution, indexed reads, and moderation as
        part of the operator surface.
      </p>

      <h3>Run a Resolution Service</h3>
      <p>
        Every frontend operator should also run a <strong>resolution service</strong>, a background service that keeps
        the protocol moving. It performs three critical tasks:
      </p>
      <ol>
        <li>
          <strong>Revealing votes:</strong> After each 20-minute epoch ends, the service decrypts tlock ciphertexts
          using the drand randomness beacon and calls{" "}
          <code>revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt)</code> for each unrevealed commit.
          Votes stay hidden until this step runs.
        </li>
        <li>
          <strong>Settling rounds:</strong> Once at least 3 votes are revealed and all past-epoch votes have been
          revealed (or the 60-minute reveal grace period has expired), the service calls{" "}
          <code>settleRound(contentId, roundId)</code> to finalize the round, update the content rating, and open
          rewards for claiming.
        </li>
        <li>
          <strong>Finalizing and cleanup:</strong> If commit quorum was reached but reveal quorum never materializes by
          the final grace deadline, the service can call <code>finalizeRevealFailedRound(contentId, roundId)</code>.
          After terminal states, it should also batch{" "}
          <code>processUnrevealedVotes(contentId, roundId, startIndex, count)</code> so unrevealed stakes are swept or
          refunded.
        </li>
      </ol>
      <p>
        Without resolution services, votes would never be revealed and rounds would never resolve. Running one alongside
        your frontend ensures a smooth experience for your users and contributes to the health of the network. Since
        these actions are permissionless, anyone can run a resolution service. Under the keeper-assisted/self-reveal
        model, reveal still relies on off-chain drand decryption and stanza validation rather than an on-chain proof
        that the stored ciphertext was honestly decryptable, so the keeper is a trust-minimized convenience layer rather
        than a cryptographic gatekeeper. The more independent services running, the more resilient the network becomes.
      </p>
      <p>
        The reference resolution runtime lives in{" "}
        <a href={keeperSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/keeper
        </a>
        .
      </p>

      <h3>Run an Indexer or Back-End</h3>
      <p>
        For the best user experience, frontend operators should run their own <strong>indexer</strong> and/or{" "}
        <strong>back-end service</strong>. Reading blockchain data directly from an RPC node for every page load is slow
        and expensive. An indexer listens to contract events and stores the data in a database so your frontend can
        query it instantly.
      </p>
      <ul>
        <li>
          <strong>Faster load times:</strong> Pre-indexed data means your UI doesn&apos;t wait for RPC calls to return
          historical state.
        </li>
        <li>
          <strong>Lower RPC costs:</strong> Batch-synced data reduces the number of calls to your RPC provider.
        </li>
        <li>
          <strong>Richer queries:</strong> An indexed database lets you filter, sort, and aggregate data in ways that
          direct blockchain reads alone cannot support efficiently.
        </li>
      </ul>
      <p>
        The reference implementation uses <strong>Ponder</strong> as its indexer. You are free to use any indexing stack
        (Ponder, The Graph, custom solutions) as long as your frontend can serve data quickly and reliably.
      </p>
      <p>
        The current indexing service code lives in{" "}
        <a href={ponderSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/ponder
        </a>
        .
      </p>

      <h3>Own Your Moderation Layer</h3>
      <p>
        Frontend operators are allowed and encouraged to implement their own <strong>frontend moderation layer</strong>{" "}
        to comply with local regulations and their own platform policies. Because Curyo is a decentralized protocol,
        there is no protocol-level censorship, and content submitted to the blockchain is permanent. However, each
        frontend is free to decide what it displays to its users.
      </p>
      <p>The reference implementation includes a policy-driven moderation layer that:</p>
      <ul>
        <li>
          <strong>Blocks submissions</strong> containing prohibited terms or blocked domains in URLs, titles,
          descriptions, seeded category names, category tags, or unsafe media embeds.
        </li>
        <li>
          <strong>Filters indexed reads centrally</strong> in the bundled Ponder query layer so blocked content stays
          hidden across feed loads, discovery modules, category reads, and direct requested-content lookups.
        </li>
        <li>
          <strong>Notifies users</strong> with inline validation and clear warning messages when their input is rejected
          or a requested item is hidden.
        </li>
      </ul>
      <p>Frontend operators can customize and extend their moderation approach in several ways:</p>
      <ul>
        <li>
          <strong>Keyword filtering</strong> - Expand or adjust the built-in blocklist of prohibited terms for URLs and
          text.
        </li>
        <li>
          <strong>Domain blocklists</strong> - Maintain a list of domains that should never be displayed or submitted.
        </li>
        <li>
          <strong>Third-party moderation APIs</strong> - Integrate services like content safety classifiers for more
          sophisticated filtering.
        </li>
        <li>
          <strong>Manual review workflows</strong> - Implement flagging and human review for edge cases.
        </li>
      </ul>
      <p>
        Each frontend operator is responsible for the content they serve to their audience. In the reference
        implementation, moderation is enforced in frontend submit validation plus the bundled Ponder query layer; it has
        no effect on the underlying protocol or on other frontends that choose a different policy.
      </p>
      <p>
        The reference policy list lives in{" "}
        <a
          href={contentModerationPolicySourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary"
        >
          packages/node-utils/src/contentModeration.ts
        </a>
        , the lower-level matching helpers live in{" "}
        <a href={contentFilterSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/nextjs/utils/contentFilter.ts
        </a>
        , the Ponder query-layer enforcement lives in{" "}
        <a href={ponderModerationSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/ponder/src/api/moderation.ts
        </a>
        , and the submit-form validators live in{" "}
        <a
          href={submissionValidationSourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary"
        >
          packages/nextjs/lib/moderation/submissionValidation.ts
        </a>
        .
      </p>

      <h2>Governance Oversight</h2>
      <p>Frontend operators are subject to governance control:</p>
      <ul>
        <li>
          <strong>Slashing</strong> - Governance can slash staked cREP for abuse and confiscate already accrued frontend
          fees.
        </li>
        <li>
          <strong>Rebonding required</strong> - After a partial slash, operators must top back up to the full 1,000 cREP
          stake before frontend fees can accrue again.
        </li>
      </ul>

      <div className="not-prose mt-8 rounded-xl p-4 surface-card">
        <p className="text-base-content/60">
          Start with{" "}
          <Link href="/docs/sdk" className="link link-primary">
            SDK
          </Link>{" "}
          for implementation details, then come back here when you are ready to run a fee-earning frontend operator.
        </p>
      </div>
    </article>
  );
};

export default FrontendCodes;
