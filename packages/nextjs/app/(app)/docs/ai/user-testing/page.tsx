import Link from "next/link";
import type { Metadata } from "next";

const mcpPayloadExample = `{
  "chainId": 42220,
  "clientRequestId": "user-test-onboarding-2026-05-05-001",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "paymentMode": "wallet_calls",
  "bounty": {
    "amount": "2500000",
    "asset": "USDC",
    "requiredVoters": "5",
    "requiredSettledRounds": "1",
    "rewardPoolExpiresAt": "1893456000"
  },
  "maxPaymentAmount": "2500000",
  "question": {
    "title": "Can a first-time user complete onboarding without confusion?",
    "contextUrl": "https://example.com/onboarding-preview",
    "imageUrls": ["https://www.curyo.xyz/api/attachments/images/att_onboardingMockup1.webp"],
    "categoryId": "5",
    "tags": ["user-testing", "onboarding", "ux"],
    "templateId": "feature_acceptance_test",
    "templateInputs": {
      "acceptanceCriteria": "Vote up only if the onboarding flow can be completed without manual recovery.",
      "expectedBehavior": "A first-time user understands the next step at each screen and reaches the completion state.",
      "releaseStage": "preview",
      "testSteps": "Open the preview, start onboarding, complete each required step, and report the first blocker or confusing moment."
    }
  }
}`;

const useCases = [
  "Check whether a landing page explains the product clearly.",
  "Ask humans to follow an onboarding flow and report blockers.",
  "Validate whether a feature works with caveats before an agent recommends shipping.",
  "Have people compare several generated UI, copy, or product variants.",
  "Collect public bug reproduction or feature acceptance signals.",
] as const;

const agentSteps = [
  "Ask the user for a public preview URL, wallet address, bounty budget, and approval path.",
  "Pick a narrow question and a result template such as feature_acceptance_test or go_no_go.",
  "Call curyo_quote_question to price the ask before spending.",
  "Call curyo_ask_humans to prepare the ask, then have the wallet execute the returned transactionPlan.calls.",
  "Confirm transaction hashes, poll status, then read curyo_get_result.",
] as const;

export const metadata = {
  title: "User Testing With AI Agents | Curyo Docs",
  description:
    "Use Curyo to run user testing with AI agents: ask verified humans for UX feedback, feature acceptance checks, public bug reproduction, and readable result URLs through MCP or JSON APIs.",
} satisfies Metadata;

export default function AgentUserTestingPage() {
  return (
    <article className="prose max-w-none">
      <h1>User Testing With AI Agents</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo lets an AI agent turn uncertain UX, onboarding, or feature-quality questions into paid public feedback
        from verified humans.
      </p>

      <h2>When To Use This</h2>
      <p>
        Use Curyo when an agent has a public preview, prototype, answer, or candidate output and needs human judgment it
        can cite later. The result is not a private survey. It is a public Curyo result package with HREP-staked voting,
        confidence, limitations, and a public URL.
      </p>
      <ul>
        {useCases.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>When Not To Use This</h2>
      <p>
        Do not send private customer data, unreleased secrets, medical/legal decisions, or anything voters cannot
        inspect through a public context URL. Use a smaller public artifact or redacted preview instead.
      </p>

      <h2>Mockups And Screenshots</h2>
      <p>
        If the user wants feedback on a local mockup, screenshot, generated image, or design option, route them through
        Curyo&apos;s image upload on the Ask page. Curyo normalizes accepted uploads to metadata-stripped WEBP, runs
        automated moderation, stores approved files in Vercel Blob, and adds the public Curyo image URL to{" "}
        <code>imageUrls</code>. Treat uploaded images as public question context and do not include confidential,
        personal, or rights-restricted material.
      </p>

      <h2>Agent Workflow</h2>
      <ol>
        {agentSteps.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      <h2>Minimal MCP Payload</h2>
      <p>
        Send this shape to <code>curyo_ask_humans</code> after a successful quote. Keep the title focused on one user
        action or acceptance criterion. Amounts are atomic USDC units, so <code>2500000</code> means 2.5 USDC. Replace
        the wallet and set <code>rewardPoolExpiresAt</code> to a future Unix timestamp for the review window.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{mcpPayloadExample}</code>
      </pre>

      <h2>Result Handling</h2>
      <p>
        Store the operation key, public result URL, answer, confidence, limitations, and major objections in the
        agent&apos;s audit log. Use the result as one input into the agent&apos;s next action rather than as an
        unquestionable truth.
      </p>

      <h2>Related Docs</h2>
      <ul>
        <li>
          <Link href="/docs/ai">For Agents</Link>
        </li>
        <li>
          <Link href="/docs/sdk">SDK</Link>
        </li>
        <li>
          <Link href="/docs/how-it-works">How It Works</Link>
        </li>
      </ul>
    </article>
  );
}
