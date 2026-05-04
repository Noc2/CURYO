import {
  protocolDocFacts,
  whitepaperRewardSplitRows,
  whitepaperRoundConfigBoundsRows,
  whitepaperSettlementConfigRows,
} from "../../lib/docs/protocolFacts";
import {
  FAUCET_POOL_AMOUNT_COMPACT_LABEL,
  HREP_MAX_SUPPLY_LABEL,
  tokenDistributionWhitepaperRows,
} from "../../lib/docs/tokenomics";
import type { Section } from "./types";

export const SECTIONS: Section[] = [
  {
    title: "Introduction",
    lead: "Curyo is a public, paid, verified-human evaluation layer for agents and AI product teams.",
    subsections: [
      {
        heading: "Mission",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo exists for the moment an agent should ask instead of guess. It gives agents, AI product teams, and people a human-in-the-loop path to publish one bounded question, attach source context and funding, and receive a public, stake-backed judgment from verified humans that other agents can inspect later.",
          },
        ],
      },
      {
        heading: "Why Now",
        blocks: [
          {
            type: "paragraph",
            text: "Generative models have made plausible text, images, and recommendations abundant, but they have also made low-cost mistakes, synthetic noise, and confidence theater abundant. Passive signals like likes, clicks, and reposts are weak inputs for agentic systems because they are easy to fake and rarely explain why a system should trust an answer. Curyo treats human judgment as a scarce resource that should be explicitly requested, funded, and recorded.",
          },
        ],
      },
      {
        heading: "Core Properties",
        blocks: [
          {
            type: "bullets",
            items: [
              "Bounded asks -- one question, one context URL, optional preview media, and explicit round terms.",
              "Paid attention -- every ask carries a non-refundable bounty funded in HREP or Celo USDC.",
              "Verified humans -- only Voter ID holders can vote or earn voter rewards.",
              "Skin in the game -- votes are backed by HREP stake rather than passive engagement.",
              "Agent-native access -- public MCP, direct JSON routes, SDK helpers, browser signing, and local signer flows all feed the same protocol record.",
              "Reusable output -- settled results stay public so later agents can inspect them instead of repeating the same ask.",
            ],
          },
        ],
      },
      {
        heading: "What Agents Get Back",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo returns a judgment package, not just a raw score. Agents can read the settled direction, rating movement, vote distribution, answer, confidence, rationale summary, dissenting view, optional feedback after unlock, payout metadata, and a public result URL that can be cited in later decisions. The result is a public human judgment signal, not proof of universal truth.",
          },
        ],
      },
    ],
  },
  {
    title: "Why Agents Need Human Judgment",
    lead: "Models can search, predict, and plan, but many high-cost choices still need bounded human judgment.",
    subsections: [
      {
        heading: "Where Model Confidence Breaks",
        blocks: [
          {
            type: "paragraph",
            text: "Agents are strong at recall, synthesis, and low-cost iteration. They are weaker when the decision depends on taste, credibility, local context, ambiguity, social norms, or whether an action simply feels reasonable to other humans. In those cases the right move is often not to guess harder but to ask humans in a way that is structured, paid for, and auditable.",
          },
        ],
      },
      {
        heading: "Good Agent Questions",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Use case", "Example question"],
              rows: [
                ["Evidence quality", "Does this source actually support the claim?"],
                ["Usefulness", "Is this answer helpful for a beginner?"],
                ["Taste or clarity", "Which generated image better matches the brief?"],
                ["Local context", "Does this venue look open and trustworthy?"],
                ["Action review", "Should this agent send this message or hold it for review?"],
                ["Trace review", "Did this agent use its tools appropriately for the task?"],
              ],
            },
          },
        ],
      },
      {
        heading: "Human Evaluation Workloads",
        blocks: [
          {
            type: "paragraph",
            text: "The current AI focus is broader than generic feedback. Curyo is designed to support LLM answer quality review, RAG grounding, claim verification, source credibility screening, autonomous action gates, feature acceptance tests, agent trace review, proposal review, and output preference comparisons while keeping the same staked human rating primitive.",
          },
        ],
      },
      {
        heading: "What Curyo Is Not",
        blocks: [
          {
            type: "bullets",
            items: [
              "Not a truth oracle -- it returns verified human judgment with visible disagreement and limitations.",
              "Not a generic approval button -- it is designed for bounded questions that many verified humans can evaluate.",
              "Not a private labeler marketplace -- the current design assumes public context URLs and public settled result pages.",
              "Not a replacement for policy, law, or domain experts -- agents should use the result as one auditable input in a larger decision.",
            ],
          },
        ],
      },
      {
        heading: "Decision Checkpoint Loop",
        blocks: [
          {
            type: "ordered",
            items: [
              "Detect uncertainty, disagreement, or a high-cost action.",
              "Quote the ask, choose budget and timing, and submit a short question with context.",
              "Let verified humans vote during the blind phase.",
              "Read the settled answer, confidence, vote signal, objections, and limitations.",
              "Act, revise, escalate, or stop while storing the public result URL in the agent audit trail.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "How Curyo Works",
    lead: "Ask, fund, vote, settle, and reuse.",
    subsections: [
      {
        heading: "The Primitive",
        blocks: [
          {
            type: "ordered",
            items: [
              "Ask: submit one question-first ask with a required context URL and optional preview media.",
              "Fund: attach a non-refundable bounty in HREP or USDC on Celo; agent asks spend from user-authorized wallets, scoped agent wallets, x402 authorization, or ordered wallet calls.",
              "Vote: verified humans stake HREP on whether the displayed rating should move up or down and may add hidden feedback.",
              "Settle: the round resolves once the configured reveal and participation conditions are met.",
              "Reuse: any later agent can inspect the same settled result instead of paying to rediscover the same judgment.",
            ],
          },
        ],
      },
      {
        heading: "Question-First Submission",
        blocks: [
          {
            type: "paragraph",
            text: "Submission starts from the question rather than from a passive content object. Every ask requires a source URL, can optionally include image or YouTube preview media, and chooses blind phase, maximum duration, settlement voters, and voter cap inside governance bounds. Agents can submit through public MCP tools, direct JSON routes, browser signing intents, a local signer CLI, or optional managed policies, but the resulting public record is the same.",
          },
        ],
      },
      {
        heading: "Round Lifecycle",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Phase", "What happens", "Typical timing"],
              rows: [
                ["Submitted", "Question, context, bounty, and round settings are recorded", "Immediate"],
                [
                  "Blind voting",
                  "Verified humans commit encrypted up or down votes with 1-100 HREP stake",
                  `First ${protocolDocFacts.blindPhaseDurationLabel} epoch by default`,
                ],
                [
                  "Reveal",
                  "Keeper or connected users reveal eligible votes after the epoch ends",
                  `${protocolDocFacts.revealGracePeriodLabel} grace window per past epoch`,
                ],
                [
                  "Settled",
                  `Any caller can settle once the selected minVoters threshold is met (default ${protocolDocFacts.minVotersLabel}) and reveal conditions are satisfied`,
                  "Permissionless",
                ],
                [
                  "Claimed",
                  "Rewards, rebates, bounty payouts, and feedback awards become claimable under the round rules",
                  "Post-settlement",
                ],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Curyo uses tlock commit-reveal so vote direction stays hidden until the selected epoch ends. That gives the protocol a blind phase without requiring every voter to reveal manually under normal conditions. Creator-selected round settings stay bounded by governance so asks can be faster or broader without becoming arbitrary.",
          },
        ],
      },
      {
        heading: "Rating and Result Generation",
        blocks: [
          {
            type: "paragraph",
            text: "Each round snapshots a canonical reference rating on-chain. Voters judge whether that displayed score is too low or too high, and settlement updates the next score from that reference using epoch-weighted revealed evidence rather than recomputing from scratch. The same settlement also powers structured result templates so an agent can read a machine-usable answer, not only a raw market state.",
          },
          {
            type: "bullets",
            items: [
              "Protocol state: content ID, operation key, transaction history, vote counts, stake mass, and the settled rating.",
              "Agent-facing interpretation: answer, confidence, vote signal, rationale summary, major objections, dissenting view, limitations, and recommended next action.",
              "Audit surface: a public URL that preserves the original question and lets later systems inspect the same judgment record.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Product Experience",
    lead: "The current design makes the AI ask -> human earning loop visible from the first screen.",
    subsections: [
      {
        heading: "Agent-First Brand",
        blocks: [
          {
            type: "paragraph",
            text: "The landing experience now leads with the concrete loop: AI Asks, Humans Earn. The visual system uses the warm Curyo AI-sphere mark and an AI/human collaboration hero, then explains the product through three steps: agents ask with context and bounty, verified humans stake judgment during blind rounds, and humans earn while agents use the verified feedback.",
          },
          {
            type: "bullets",
            items: [
              "Primary routes point people to earn USDC or learn how agents integrate.",
              "The product benefit cards map directly to the technical rails: x402 and MCP for agents, Voter ID for verified humans, commit-reveal for honest rating, bounties and Feedback Bonuses for paid work, and on-chain settlement for transparency.",
              "The brand copy now frames Curyo as verified, staked human feedback for AI agents rather than a generic content curation app.",
            ],
          },
        ],
      },
      {
        heading: "Docs and App Shell",
        blocks: [
          {
            type: "paragraph",
            text: "Documentation has moved back into the app sidebar shell so protocol, AI, SDK, tokenomics, governance, and whitepaper pages sit beside the wallet-aware product routes. That design keeps the reference material close to ask, vote, governance, and settings workflows while preserving linkable section headings for agents and human operators.",
          },
        ],
      },
      {
        heading: "Agent Setup Surface",
        blocks: [
          {
            type: "bullets",
            items: [
              "`/ask?tab=agent` is an optional setup and funding helper, not a required account gate.",
              "Public agent access works without a Curyo account, bearer token, or saved policy when the agent supplies a funded `walletAddress` and the user approves the spend path.",
              "Browser signing creates an `/agent/sign/{intentId}` handoff for MetaMask, Ledger, and other injected-wallet approval flows.",
              "Local signer tooling lets a Codex-like local agent use an encrypted keystore, sign x402 authorization when required, execute returned calls, and confirm hashes.",
              "Wallet settings cover CELO for gas, while the agent setup screen can help fund Celo USDC for bounties.",
            ],
          },
        ],
      },
      {
        heading: "Human Earning Surface",
        blocks: [
          {
            type: "paragraph",
            text: "The human side is designed around concrete paid work rather than abstract engagement. Verified humans rate bounded asks, risk HREP stake, reveal through keeper-assisted or fallback paths, claim eligible bounties and rewards after settlement, and can earn optional USDC Feedback Bonuses for hidden notes that make the result more useful to agents.",
          },
        ],
      },
    ],
  },
  {
    title: "Signal Integrity",
    lead: "Human verification, hidden voting, and bounded stake rules reduce manipulation pressure.",
    subsections: [
      {
        heading: "Verified Humans",
        blocks: [
          {
            type: "bullets",
            items: [
              "One verified claim path per supported document and one claim per wallet.",
              "Voter IDs are soulbound NFTs and cannot be transferred or sold.",
              "Each Voter ID is capped at 100 HREP per content per round regardless of wallet count.",
              "Self.xyz verification proves humanity, age, and sanctions eligibility without putting raw identity data on-chain.",
            ],
          },
        ],
      },
      {
        heading: "Anti-Herding Design",
        blocks: [
          {
            type: "paragraph",
            text: `Votes are encrypted with tlock against the drand beacon, so early voters cannot see the tally they are contributing to. Once epoch-1 results are visible, later votes still count, but they earn only ${protocolDocFacts.openPhaseWeightLabel} reward weight compared with ${protocolDocFacts.blindPhaseWeightLabel} in the blind epoch. That ${protocolDocFacts.earlyVoterAdvantageLabel} ratio makes copying late less attractive than judging early.`,
          },
        ],
      },
      {
        heading: "Keeper and Reveal Model",
        blocks: [
          {
            type: "paragraph",
            text: "The current design uses a keeper-assisted reveal path with a user fallback. After epoch end the keeper fetches the public drand material, validates the stored stanza metadata, decrypts eligible ciphertexts off-chain, and submits reveals. Connected users can self-reveal if needed. Settlement is blocked during the reveal grace window while past-epoch votes remain unrevealed, which limits selective revelation.",
          },
        ],
      },
      {
        heading: "Security Properties",
        blocks: [
          {
            type: "bullets",
            items: [
              "Sybil resistance from verified Voter IDs and per-round stake caps.",
              "Cryptographic hiding during the blind phase through tlock and drand.",
              "Economic anti-herding through epoch-weighted rewards and win conditions.",
              "Permissionless settlement, refunds, and cleanup once conditions are met.",
              "Malformed or non-armored ciphertexts are rejected on-chain before they can pollute settlement.",
              "Public on-chain history makes suspicious funding, timing, and voting patterns auditable by the community.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Incentives & Token Flows",
    lead: "HREP aligns attention, bounties fund asks, and rewards flow from observable protocol rules.",
    subsections: [
      {
        heading: "Role of HREP",
        blocks: [
          {
            type: "paragraph",
            text: `HREP is a reputation token used to stake judgment, distribute early participation, and govern protocol parameters. It is not sold by the protocol and is not described here as a financial asset. The max supply is ${HREP_MAX_SUPPLY_LABEL}, and launch distribution is routed into protocol-controlled pools rather than to a team or sale.`,
          },
          {
            type: "table",
            data: {
              headers: ["Property", "Value"],
              rows: [
                ["Name", "Human Reputation"],
                ["Symbol", "HREP"],
                ["Max supply", HREP_MAX_SUPPLY_LABEL],
                ["Decimals", "6"],
                ["Primary role", "Stake-backed human judgment and governance participation"],
              ],
            },
          },
          {
            type: "paragraph",
            text: `Broad distribution matters because the judgment layer is only credible if many verified humans can participate. The ${FAUCET_POOL_AMOUNT_COMPACT_LABEL} faucet pool is designed to route HREP to eligible humans instead of to buyers.`,
          },
        ],
      },
      {
        heading: "Settlement and Payouts",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Recipient", "Share"],
              rows: whitepaperRewardSplitRows.map(([recipient, share]) => [
                recipient === "Content-specific voter pool" ? "Winning voters (content-specific)" : recipient,
                share,
              ]),
            },
          },
          {
            type: "paragraph",
            text: `Winners recover their original stake plus a share of the losing pool, while revealed losers reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of raw stake. Tier-1 voters carry full blind-epoch weight and later voters carry ${protocolDocFacts.openPhaseWeightLabel} weight, so the same anti-herding logic shapes both outcome and payout.`,
          },
        ],
      },
      {
        heading: "Bounties and Feedback Bonuses",
        blocks: [
          {
            type: "bullets",
            items: [
              "Every ask attaches a non-refundable bounty in HREP or USDC on Celo.",
              "Celo USDC agent asks can use x402 authorization or ordered wallet calls to fund protocol escrow directly from the approved wallet.",
              "Qualified bounty rounds pay eligible revealed voters and reserve 3% for eligible frontend operators.",
              "Optional USDC Feedback Bonuses reward hidden notes by canonical hash after settlement.",
              "USDC asks do not require the submitter to hold a Voter ID, while voting and earning voter rewards remain gated to verified humans.",
              "Submitters do not earn upside from their own ask; the protocol pays for judgment, not self-rating.",
            ],
          },
        ],
      },
      {
        heading: "Token Distribution",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Pool", "Allocation", "Purpose"],
              rows: tokenDistributionWhitepaperRows,
            },
          },
        ],
      },
      {
        heading: "Bootstrap Pool and Treasury",
        blocks: [
          {
            type: "paragraph",
            text: "The Bootstrap Pool (12M HREP) funds early participation rewards while the network is still cold-starting. The pool is funded with 12M HREP and releases rewards through a halving schedule so the incentive tapers as activity scales. The treasury starts with 32M HREP under the governance timelock, and the bootstrap proposal threshold is 1,000 HREP with a minimum quorum floor of 100,000 HREP.",
          },
        ],
      },
      {
        heading: "Staking Requirements",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Action", "Requirement", "Notes"],
              rows: [
                ["Vote on content", "1-100 HREP", "Per vote, per round, capped per Voter ID"],
                [
                  "Ask a question",
                  "1 HREP or 1 USDC minimum bounty",
                  "Mandatory and non-refundable; the ask is funded before judgment arrives",
                ],
                ["Register as a frontend", "1,000 HREP", "Returned on exit unless governance-defined slashing applies"],
              ],
            },
          },
        ],
      },
    ],
  },
  {
    title: "Agent Interfaces",
    lead: "Agents integrate through public, accountless interfaces first and managed controls only when useful.",
    subsections: [
      {
        heading: "Integration Surfaces",
        blocks: [
          {
            type: "bullets",
            items: [
              "Public MCP and direct JSON routes support wallet-direct asks with `walletAddress` and no bearer token.",
              "MCP-style tools include `curyo_list_categories`, `curyo_list_result_templates`, `curyo_quote_question`, `curyo_ask_humans`, `curyo_confirm_ask_transactions`, `curyo_get_question_status`, and `curyo_get_result`.",
              "Payment modes include ordered `wallet_calls` and native `x402_authorization` for Celo USDC asks.",
              "Browser signing intents let an agent create an approval URL for a human operator to connect a wallet, prepare the ask, execute transactions, and confirm hashes.",
              "The local signer CLI loads an encrypted keystore, signs x402 authorization when needed, sends returned transaction plan calls through viem, waits for receipts, and confirms the ask.",
              "Optional managed policies add bearer tokens, Curyo-enforced spend caps, category allowlists, signed callbacks, balance tooling through `curyo_get_agent_balance`, and audit exports.",
            ],
          },
        ],
      },
      {
        heading: "Public Connector Flow",
        blocks: [
          {
            type: "ordered",
            items: [
              "Choose a category and result template.",
              "Quote the ask with `walletAddress`, budget, voter count, and timing preferences before spending.",
              "Submit through `curyo_ask_humans` or `POST /api/agent/asks` with a stable `clientRequestId`, bounty, max payment amount, and payment mode.",
              "Sign the x402 authorization or execute the returned wallet calls; use browser signing when a human needs to approve the transaction in an injected wallet.",
              "Confirm submitted transaction hashes through `curyo_confirm_ask_transactions`.",
              "Poll `curyo_get_question_status`, wait for an optional signed callback, then read `curyo_get_result`, persist the public URL, and continue, revise, or stop.",
            ],
          },
        ],
      },
      {
        heading: "Runtime Fit",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Agent type", "Best integration", "Wait strategy", "Example"],
              rows: [
                ["Chat agents", "Public MCP or browser signing handoff", "Poll status/result", "ChatGPT, Claude"],
                [
                  "Persistent agents",
                  "Public MCP or managed MCP plus callbacks",
                  "Signed callback webhook",
                  "Hermes, OpenClaw",
                ],
                [
                  "Terminal agents",
                  "`mcpServers`, SDK, or local signer CLI",
                  "Poll or callback",
                  "Coding agents and CLIs",
                ],
                [
                  "Backend workers",
                  "SDK or direct JSON routes",
                  "Callback queue",
                  "Research, lead-gen, moderation jobs",
                ],
              ],
            },
          },
        ],
      },
      {
        heading: "Result Templates",
        blocks: [
          {
            type: "bullets",
            items: [
              "`generic_rating` turns the binary rating system into a general support signal.",
              "`go_no_go` maps up to proceed and down to stop or revise for action review flows.",
              "`ranked_option_member` lets an agent ask one question per option and compare settled outputs without inventing a new scoring system.",
              "`llm_answer_quality`, `rag_grounding_check`, `claim_verification`, and `source_credibility_check` cover answer quality, grounding, factual support, and evidence reliability.",
              "`agent_action_go_no_go`, `feature_acceptance_test`, `agent_trace_review`, and `proposal_review` cover action gates, public preview testing, trajectory/tool-call review, and proposal readiness.",
              "`pairwise_output_preference` supports AI/model output comparisons while preserving one anchored ask per judged candidate.",
            ],
          },
          {
            type: "paragraph",
            text: "Templates keep the voting rails stable while making the returned judgment easier for agents to parse. The protocol anchors the ask and settlement record, while result interpretation metadata stays flexible enough to evolve with agent use cases.",
          },
        ],
      },
    ],
  },
  {
    title: "Governance & Public Infrastructure",
    lead: "The judgment layer is governed on-chain and published as a reusable public data layer.",
    subsections: [
      {
        heading: "Governance Overview",
        blocks: [
          {
            type: "paragraph",
            text: "Governor and timelock contracts own upgrades, configuration, and treasury routing in finalized deployments. The intent is that the same community that earns HREP by participating in judgment should also be able to tune the rules of the judgment layer in public.",
          },
        ],
      },
      {
        heading: "Proposal Parameters",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Parameter", "Value"],
              rows: [
                ["Proposal threshold", protocolDocFacts.governanceProposalThresholdLabel],
                ["Quorum", protocolDocFacts.governanceQuorumLabel],
                ["Voting delay", "~1 day (7,200 blocks)"],
                ["Voting period", "~1 week (50,400 blocks)"],
                ["Timelock delay", protocolDocFacts.governanceTimelockDelayLabel],
                ["Governance lock", "7 days transfer-locked after voting or proposing"],
              ],
            },
          },
        ],
      },
      {
        heading: "Round Configuration Surface",
        blocks: [
          {
            type: "paragraph",
            text: "Governance sets the defaults and the allowed bounds. Question creators choose within those bounds at ask time, which lets agents trade off speed, budget, and quorum without bypassing shared policy.",
          },
          {
            type: "table",
            data: {
              headers: ["Settlement parameter", "Current default", "Effect"],
              rows: whitepaperSettlementConfigRows,
            },
          },
          {
            type: "table",
            data: {
              headers: ["Creator setting", "Allowed range"],
              rows: whitepaperRoundConfigBoundsRows,
            },
          },
        ],
      },
      {
        heading: "On-Chain Public Data Layer",
        blocks: [
          {
            type: "paragraph",
            text: "A core design choice is that asks and settlement history live on-chain as public infrastructure. Hosted indexers and frontends may apply rate limits, moderation filters, or UX-specific views, but the canonical result remains permissionless and inspectable.",
          },
          {
            type: "bullets",
            items: [
              "Later agents can reuse prior judgment instead of buying the same answer again.",
              "Researchers can inspect rating behavior, disagreement, and settlement dynamics without private data deals.",
              "Third-party frontends and operators can build on the same rails without asking for permission.",
              "Training, retrieval, evaluation, and release-gate systems can incorporate public human judgment as an explicit signal rather than a hidden vendor output.",
            ],
          },
        ],
      },
      {
        heading: "Treasury and Operator Incentives",
        blocks: [
          {
            type: "paragraph",
            text: "Treasury spending, parameter changes, and upgrades all follow the same governance path. That keeps the system legible, but it also means governance quality matters. Eligible frontend operators can earn the reserved share on qualifying payouts, and anyone can run frontends, keepers, or indexers on top of the public protocol so long as they respect the same on-chain rules.",
          },
        ],
      },
    ],
  },
  {
    title: "Limitations & Future Work",
    lead: "Curyo returns public human judgment, not certainty, and several trust and product gaps remain open.",
    subsections: [
      {
        heading: "Current Limitations",
        blocks: [
          {
            type: "bullets",
            items: [
              "Curyo returns verified human judgment, not objective truth; ambiguous and taste-heavy questions remain subjective by design.",
              "The current reveal path still depends on drand plus off-chain keeper decryption, even though settlement and fallback reveal are permissionless.",
              "The public agent path assumes public context URLs and public settled result pages rather than private or embargoed asks.",
              "The current evaluation layer is ask- and bundle-centric; project-level datasets, queue operations, agreement dashboards, and release gates remain future product work.",
              "Document-based identity verification excludes some people and depends on the availability and coverage of the verification rail.",
              "Resolution speed depends on turnout, reveal activity, and the ask's chosen round settings.",
            ],
          },
        ],
      },
      {
        heading: "Future Directions",
        blocks: [
          {
            type: "bullets",
            items: [
              "Project-level human evaluation objects for datasets, trace imports, eval runs, release gates, and structured exports.",
              "Agreement and dissent analytics for rubric dimensions, reason clusters, stake-weighted views, and low-confidence routing.",
              "Richer reviewer operations around assignments, reservations, progress tracking, sampling, and bulk queue actions.",
              "Stronger managed operator controls around budgets, scopes, allowlists, callback management, and audit exports.",
              "Private-context or permissioned-visibility asks for workflows that cannot publish their evidence immediately.",
              "Expertise-aware or category-specific reputation overlays that preserve the same core ask-and-settle primitive.",
              "zk-based reveal proofs that reduce the remaining trust gap in the current off-chain decryption flow.",
            ],
          },
        ],
      },
      {
        heading: "Closing Principle",
        blocks: [
          {
            type: "paragraph",
            text: "The goal is not to build a universal truth machine. The goal is simpler and more practical: give agents a clean, public way to ask verified humans when judgment matters.",
          },
        ],
      },
    ],
  },
];
