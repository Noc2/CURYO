import Link from "next/link";
import type { NextPage } from "next";

const SdkPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>SDK</h1>
      <p className="lead text-base-content/60 text-lg">
        Use the Curyo SDK to add hosted reads, frontend attribution, and vote transaction helpers to an existing app.
      </p>

      <h2>What It Covers</h2>
      <p>
        The core SDK in <code>@curyo/sdk</code> is intentionally framework-agnostic. It gives integrators a clean
        starting point without forcing a specific wallet library, frontend framework, or backend stack.
      </p>
      <ul>
        <li>
          <strong>Hosted reads</strong> for indexed content, rounds, votes, profiles, categories, stats, and frontend
          operator records.
        </li>
        <li>
          <strong>Vote helpers</strong> for stake normalization, frontend-code resolution, tlock commit generation,
          drand metadata binding, and transfer payload encoding.
        </li>
        <li>
          <strong>Wallet-agnostic output</strong> so the resulting calldata can be passed into wagmi, viem, thirdweb, or
          a custom signing flow.
        </li>
      </ul>

      <h2>Install</h2>
      <p>
        The SDK currently lives in the monorepo as <code>packages/sdk</code> and is exposed as <code>@curyo/sdk</code>.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`import { createCuryoClient } from "@curyo/sdk";
import {
  buildCommitVoteParams,
  buildVoteTransferAndCallData,
  buildVoteTransferPayload,
} from "@curyo/sdk/vote";`}</code>
      </pre>

      <h2>Quickstart</h2>
      <p>Create a client once, then use its hosted read surface wherever your app needs indexed protocol data.</p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`const curyo = createCuryoClient({
  apiBaseUrl: "https://api.curyo.xyz",
  frontendCode: "0x1234567890123456789012345678901234567890",
});

const stats = await curyo.read.getStats();
const content = await curyo.read.searchContent({
  sortBy: "most_votes",
  limit: 12,
});

const frontend = await curyo.read.getFrontend(
  "0x1234567890123456789012345678901234567890",
);`}</code>
      </pre>

      <h2>Vote Integration</h2>
      <p>
        For vote flows, the SDK helps you prepare the same single-transaction payload the reference app uses. The host
        app still decides how to sign and submit the transaction. In the redeployed tlock model, commit helpers also
        thread the reveal target round and drand chain hash through the payload so the contracts can enforce the new
        metadata bindings on-chain.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`const commit = await buildCommitVoteParams({
  contentId: 42n,
  isUp: true,
  stakeAmount: 2.5,
  epochDuration: 20 * 60,
  defaultFrontendCode: curyo.config.frontendCode,
});

const payload = buildVoteTransferPayload({
  contentId: 42n,
  commitHash: commit.commitHash,
  ciphertext: commit.ciphertext,
  frontend: commit.frontend,
});

const txData = buildVoteTransferAndCallData({
  votingEngineAddress: "0x9999999999999999999999999999999999999999",
  stakeWei: commit.stakeWei,
  payload,
});`}</code>
      </pre>

      <h2>Frontend Attribution</h2>
      <p>
        If you want votes made through your app to accrue frontend fees, configure a registered frontend operator
        address and pass it as the default frontend code. That is the bridge between the SDK and the frontend-operator
        model described in{" "}
        <Link href="/docs/frontend-codes" className="link link-primary">
          Frontend Integrations
        </Link>
        .
      </p>

      <h2>What Is Out of Scope</h2>
      <p>The current SDK is not trying to bundle the full operator stack into one package.</p>
      <ul>
        <li>It does not include wallet UI or React hooks.</li>
        <li>It does not run a keeper or resolution service for you.</li>
        <li>It does not replace an indexer or hosted API deployment.</li>
      </ul>
      <p>
        Those pieces matter for production operators, but they are separate concerns from making integration easy for an
        existing web app.
      </p>

      <div className="not-prose mt-8 rounded-xl p-4 surface-card">
        <p className="text-base-content/60">
          Start with the SDK if you want the fastest path into an existing app. If you also want to register a fee
          earning frontend operator, continue with{" "}
          <Link href="/docs/frontend-codes" className="link link-primary">
            Frontend Integrations
          </Link>
          .
        </p>
      </div>
    </article>
  );
};

export default SdkPage;
