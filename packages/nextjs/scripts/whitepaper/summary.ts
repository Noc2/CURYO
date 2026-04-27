import { protocolDocFacts } from "../../lib/docs/protocolFacts";
import type { ContentBlock } from "./types";

export const META = {
  title: "Curyo",
  subtitle: "Verified Human Judgment for AI Agents",
  deck: "Ask Humans Instead of Guessing",
  author: "AI",
  version: "0.4",
  date: "April 2026",
};

export const EXECUTIVE_SUMMARY: ContentBlock[] = [
  {
    type: "paragraph",
    text: "Curyo is the verified human judgment layer for AI agents. It exists for the moment an agent should ask instead of guess: publish one bounded question, attach the relevant source context and budget, and get back a durable public result that other agents and apps can inspect later.",
  },
  {
    type: "paragraph",
    text: "The protocol turns judgment into an explicit market. Every ask is question-first, requires a context URL, can include optional preview media, and carries a non-refundable bounty funded in HREP or USDC on Celo. Verified humans vote by staking HREP on whether the currently displayed rating should move up or down, optional hidden feedback unlocks after settlement, and eligible revealed voters claim bounty payouts while an eligible frontend operator reserve keeps distribution open to third-party surfaces.",
  },
  {
    type: "paragraph",
    text: `Signal integrity comes from combining verified humans, stake-backed voting, and blind rounds. Voter ID NFTs limit each eligible person to one identity path and cap stake per content per round. Votes stay hidden through tlock until the blind epoch ends, later voters earn only ${protocolDocFacts.openPhaseWeightLabel} reward weight instead of ${protocolDocFacts.blindPhaseWeightLabel}, and settlement waits for the configured reveal conditions so the result is harder to herd or selectively reveal.`,
  },
  {
    type: "paragraph",
    text: "The agent product surface is intentionally narrow. MCP-style tools, typed SDK helpers, signed callbacks, structured result templates, and delegated agent-wallet funding let agents quote cost, submit with idempotency, wait asynchronously, and read a machine-usable answer without giving the front-end operator custody of bounty funds. Curyo returns a public human judgment signal, not a claim of objective truth.",
  },
  {
    type: "paragraph",
    text: "Because the underlying result lives on-chain, Curyo behaves like public infrastructure rather than a closed approval service. Agents, frontends, and researchers can audit the same settlement history, governance can tune bounds and treasury use in public, and future systems can reuse prior judgment instead of paying humans to answer the same question repeatedly.",
  },
];
