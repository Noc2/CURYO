import type { NextPage } from "next";

const FrontendCodes: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Frontend Codes</h1>
      <p className="lead text-base-content/60 text-lg">
        Build interfaces for Curyo and receive reputation from votes made through your frontend.
      </p>

      <h2>Overview</h2>
      <p>
        Frontend operators who build frontends, mobile apps, or integrations receive{" "}
        <strong>1% of the losing pool</strong> from votes made through their interface.
      </p>

      <h2>How to Register</h2>
      <ol>
        <li>
          <strong>Stake 1,000 cREP</strong> to the FrontendRegistry contract.
        </li>
        <li>
          <strong>Await governance approval</strong> before you can start receiving reputation.
        </li>
        <li>
          <strong>Integrate:</strong> Pass your registered address as the <code>frontend</code> parameter when calling{" "}
          <code>commitVote</code>.
        </li>
        <li>
          <strong>Claim:</strong> Call <code>claimFees()</code> to withdraw accumulated points anytime.
        </li>
      </ol>

      <h2>Integration</h2>
      <p>
        Include your frontend address when submitting votes via <code>RoundVotingEngine.commitVote()</code>:
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`function commitVote(
    bytes32 commitHash,
    bytes calldata ciphertext,
    uint256 stakeAmount,
    address frontend  // Your registered frontend address
) external`}</code>
      </pre>
      <p>
        Or set the <code>NEXT_PUBLIC_FRONTEND_CODE</code> environment variable to your address and the SDK will include
        it automatically.
      </p>

      <h2>Running a Keeper</h2>
      <p>
        Every frontend operator should also run a <strong>Keeper</strong> &mdash; a background service that keeps the
        protocol moving. The Keeper performs two critical tasks:
      </p>
      <ol>
        <li>
          <strong>Revealing votes:</strong> After each 15-minute epoch ends, the drand beacon publishes the decryption
          key. The Keeper reads on-chain ciphertexts, decrypts them, and submits reveals. Since the Keeper uses only
          public data, anyone can run one &mdash; no secret reveal data needed.
        </li>
        <li>
          <strong>Settling rounds:</strong> Once 5 or more votes have been revealed, the Keeper calls{" "}
          <code>settleRound()</code> to finalize results, determine winners, and make rewards claimable.
        </li>
      </ol>
      <p>
        Without Keepers, votes would remain encrypted and rounds would never settle. Running a Keeper alongside your
        frontend ensures a smooth experience for your users and contributes to the health of the network. The more
        independent Keepers running, the more resilient the protocol becomes.
      </p>

      <h2>Running an Indexer / Back-End</h2>
      <p>
        For the best user experience, frontend operators should run their own <strong>indexer</strong> and/or{" "}
        <strong>back-end service</strong>. Reading on-chain data directly from an RPC node for every page load is slow
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
          on-chain reads alone cannot support efficiently.
        </li>
      </ul>
      <p>
        The reference implementation uses <strong>Ponder</strong> as its indexer. You are free to use any indexing stack
        (Ponder, The Graph, custom solutions) as long as your frontend can serve data quickly and reliably.
      </p>

      <h2>Content Moderation</h2>
      <p>
        Frontend operators are allowed and encouraged to implement <strong>client-side content moderation</strong> to
        comply with local regulations and their own platform policies. Because Curyo is a decentralized protocol, there
        is no protocol-level censorship &mdash; content submitted on-chain is permanent. However, each frontend is free
        to decide what it displays to its users.
      </p>
      <p>The reference implementation includes a keyword-based blocklist that:</p>
      <ul>
        <li>
          <strong>Blocks submissions</strong> containing prohibited terms in URLs, titles, descriptions, platform names,
          domains, and comments.
        </li>
        <li>
          <strong>Filters the feed</strong> so that content matching the blocklist is hidden from users automatically.
        </li>
        <li>
          <strong>Notifies users</strong> with clear warning messages when their input is rejected.
        </li>
      </ul>
      <p>Frontend operators can customize and extend their moderation approach in several ways:</p>
      <ul>
        <li>
          <strong>Keyword filtering</strong> &mdash; Expand or adjust the built-in blocklist of prohibited terms for
          URLs and text.
        </li>
        <li>
          <strong>Domain blocklists</strong> &mdash; Maintain a list of domains that should never be displayed or
          submitted.
        </li>
        <li>
          <strong>Third-party moderation APIs</strong> &mdash; Integrate services like content safety classifiers for
          more sophisticated filtering.
        </li>
        <li>
          <strong>Manual review workflows</strong> &mdash; Implement flagging and human review for edge cases.
        </li>
      </ul>
      <p>
        Each frontend operator is responsible for the content they serve to their audience. The moderation logic lives
        entirely in the frontend codebase and has no effect on the underlying protocol or other frontends.
      </p>

      <h2>Governance Oversight</h2>
      <p>Frontend operators are subject to governance control:</p>
      <ul>
        <li>
          <strong>Approval required</strong> before receiving reputation.
        </li>
        <li>
          <strong>Slashing</strong> &mdash; Governance can slash staked cREP for abuse.
        </li>
        <li>
          <strong>Revocation</strong> &mdash; Governance can revoke approval at any time.
        </li>
      </ul>
    </article>
  );
};

export default FrontendCodes;
