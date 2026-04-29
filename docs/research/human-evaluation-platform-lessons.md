# Human Evaluation Platform Lessons For Curyo

Research date: 2026-04-27

This note looks at Humanloop, LangSmith, and Label Studio through one question:
what should Curyo learn if it wants to serve the AI evaluation, human review, and
agent-feedback use case better?

## Short Answer

The market has converged on a workflow, not a single feature: production
interaction or trace -> human/automated judgment -> dataset -> regression
evaluation -> release gate -> monitored rollout. Humanloop, LangSmith, and Label
Studio each package that loop differently:

- Humanloop made eval-driven development approachable for engineers, PMs, and
  domain experts, with prompt/version management, logs, datasets, evaluators,
  human review, CI gates, and observability. Its standalone platform has since
  been sunset after an acquisition, which makes data portability a strategic
  lesson rather than a footnote.
- LangSmith makes traces the durable working object. It turns production runs
  into datasets, evaluations, annotation queues, dashboards, and deployment
  confidence.
- Label Studio makes the human operation robust: templates, configurable
  labeling UIs, reviewer assignment, quality dashboards, consensus metrics,
  model-assisted labeling, and enterprise data-plane controls.

Curyo already has a differentiated primitive that these tools mostly do not:
funded, public, wallet-native, verified-human judgment that agents can call
through SDK/MCP flows. To fit this use case better, Curyo should package that
primitive as a human evaluation layer: projects, templates, review queues,
rubrics, trace/dataset import, agreement metrics, structured exports, and
integration hooks back into tools like LangSmith, Label Studio, CI, and agent
runtimes.

## Current Curyo Baseline

The repo already describes Curyo as "a verified human feedback layer for agents
and people." The current agent loop is:

1. An agent or person asks one focused public question.
2. The requester attaches a context URL and funds a bounty in HREP or Celo USDC.
3. Verified humans stake HREP on their judgment.
4. The round settles through commit-reveal voting.
5. Agents and frontends read the public result, vote distribution, feedback, and
   reward state.

Relevant existing building blocks:

- `packages/agents/src/templates.ts` defines versioned result templates with
  anchored `resultSpecHash` values.
- `packages/sdk` exposes agent helpers for quote -> ask -> wallet calls ->
  confirm -> status/result.
- `packages/nextjs/app/api/agent/asks/export/route.ts` already exports agent
  ask audit rows as JSON or CSV.
- `packages/nextjs/lib/mcp/audits.ts` records operation keys, client request
  IDs, chain IDs, payload hashes, statuses, content IDs, public URLs, callback
  deliveries, and reservation/submission details.
- Feedback bonuses already exist as a separate mechanism for rewarding useful
  notes after settlement.

That is a strong base for agentic evaluation. The missing product shape is the
middle layer that evaluation buyers expect: project setup, datasets, task
queues, rubric schemas, reviewer operations, agreement analytics, and reusable
exports.

## Product Snapshots

### Humanloop

Humanloop positioned itself as an enterprise LLM evals platform across
evaluation, prompt management, and observability. Its docs emphasize
evals-driven development and collaborative development, especially letting
engineers, PMs, and subject matter experts work together on prompts and
evaluations.

Important current status: Humanloop's docs say the platform would be sunset on
September 8, 2025 after an acquisition; as of this research date, that date is
in the past. Their migration guide says the export tool covers files, versions,
deployments, logs, evaluations, and datapoints, and exports in
JSON/JSONL-compatible formats. For Curyo, this is a category lesson: customers
will trust evaluation systems more if prompts, rubrics, logs, labels, and
results are portable from day one.

Useful product patterns:

- Code, AI, and human evaluators.
- Offline evaluations over datasets before deployment.
- Online monitoring over production logs.
- Prompt, tool, flow, agent, dataset, and evaluator versioning.
- CI/CD gates to catch regressions before release.
- Human review interfaces for domain experts.
- Strong security posture: RBAC, SSO/SAML, deployment options, auditability,
  data privacy, and enterprise compliance.

Lessons for Curyo:

- Make "human judgment as evaluator" a first-class object, not only a vote.
- Treat prompts, rubrics, templates, datasets, and result schemas as versioned
  assets.
- Build exportability and migration stories before enterprise buyers ask for
  them.
- Support both UI-first and code-first use. Engineers need APIs and CI gates;
  subject matter experts need review UIs and rubrics.

### LangSmith

LangSmith currently positions itself as a framework-agnostic platform for
building, debugging, and deploying AI agents and LLM applications. Its docs put
tracing, evaluation, prompt testing, and deployments in one workflow.

The core lesson is that the trace is the shared object. A trace records the
steps of an operation, while runs/spans capture individual model calls, tool
calls, retrieval steps, parsers, and other work. Traces can be enriched with
metadata, tags, feedback, and thread IDs, then reviewed or turned into datasets.

Useful product patterns:

- Offline evaluation for curated datasets before shipping.
- Online evaluation for real production interactions.
- Production trace -> failing case -> dataset example -> evaluator -> offline
  experiment -> redeploy loop.
- Human annotation queues for single-run review and pairwise A/B review.
- Rubrics, reviewer assignment, reservations, and reviewer progress tracking.
- Prompt versioning, staging/production environments, rollback, and playgrounds.
- Cloud, hybrid, and self-hosted deployment modes for different compliance
  needs.

Lessons for Curyo:

- Introduce a Curyo "evaluation trace" or at least a stable trace attachment
  shape: `traceId`, source system, environment, app version, chain ID, contract
  addresses, wallet type, transaction hashes, route, and submitted task.
- Let agents attach a LangSmith run/trace URL or exported trace JSON as the
  context for a Curyo ask.
- Let Curyo results post back to the originating tool as feedback, annotations,
  or dataset rows.
- Build a release-gate mode where a set of Curyo human judgments can block or
  permit prompt, model, or agent changes.

### Label Studio

Label Studio positions itself as an open source platform for data labeling, AI
evaluation, and human-in-the-loop workflows. Its homepage explicitly includes
LLM and agent evaluation, agentic traces, RLHF/fine-tuning, benchmarks/rubrics,
side-by-side comparison, and RAG/retrieval QA.

The core lesson is operational quality. Label Studio is not just a place where a
person clicks a label. It is a system for getting the right tasks to the right
people, reviewing their work, measuring agreement, preventing poor submissions,
and exporting usable data.

Useful product patterns:

- Prebuilt templates and customizable labeling interfaces.
- Project-level setup: import data, configure interface, assign users, review,
  export.
- Reviewers can accept, reject, or fix-and-accept annotations.
- Review streams can prioritize low-agreement or low-model-confidence tasks.
- Agreement is calculated per control tag and overall, with consensus and
  pairwise methodologies.
- Model-assisted labeling supports pre-annotations, interactive labeling, active
  learning, model evaluation, and fine-tuning workflows.
- Enterprise story includes workspaces, roles, dashboards, audit logs, SSO/SCIM,
  customer storage, and security posture.

Lessons for Curyo:

- Ship a template catalog for evaluation tasks instead of relying on generic
  questions.
- Make disagreement visible. A result should show not only the winning answer
  but also agreement, dissent, reason clusters, and dimensions with low
  confidence.
- Add reviewer operations: queues, assignments, reservations, progress, review
  sampling, bulk actions, and reviewer instructions.
- Let AI prefill, summarize, rank, or route work, but keep paid verified humans
  in the accountability loop.

## Strategic Positioning For Curyo

The natural positioning is:

> Curyo is the public, paid, verified-human evaluation layer for agents and AI
> product teams.

That is distinct from the comparison products:

- LangSmith observes, evaluates, and deploys agent applications.
- Label Studio organizes data labeling and human review operations.
- Humanloop packaged eval-driven development and collaborative prompt/eval
  workflows, but the standalone platform is no longer active.
- Curyo can provide a portable, public, incentive-aligned human judgment result
  that can be called from any of those systems.

The wedge should not be "replace Label Studio" or "replace LangSmith." A better
wedge is:

- when a team needs externally credible human judgment,
- when agent uncertainty should become a paid task,
- when a decision needs a public audit trail,
- when reviewers should be rewarded directly,
- when results should be readable by other agents and frontends,
- when requester funds should go directly from a user or scoped agent wallet to
  protocol escrow.

## Recommended Adaptations

### 1. Add Evaluation Projects

Today, Curyo asks are individual or bundled questions. For the eval use case,
introduce a project-level abstraction:

- `EvalProject`: owner, workspace, visibility, category, default template,
  reward policy, reviewer eligibility, target network, data-retention mode.
- `EvalDataset`: imported tasks, examples, traces, candidate outputs, expected
  references, source system metadata.
- `EvalRun`: a batch of tasks submitted for human judgment against a model,
  prompt, agent, UI variant, or release candidate.
- `EvalResult`: aggregate quality, agreement, cost, latency to settlement,
  reviewer count, stake mass, confidence, export state.

This can start off-chain in the Next.js database and SDK while anchoring each
settled task on-chain through the existing question/result mechanisms.

### 2. Expand Result Templates Into Workflow Templates

The existing templates are a good seed:

- `generic_rating`
- `go_no_go`
- `ranked_option_member`

For this use case, add templates that map directly to AI evaluation jobs:

- `llm_answer_quality`: grade helpfulness, correctness, completeness, and tone.
- `rag_grounding_check`: judge whether an answer is supported by supplied
  sources.
- `source_credibility_check`: rate whether a source is trustworthy enough to use.
- `pairwise_output_preference`: compare candidate outputs A/B with rubric
  dimensions.
- `agent_action_go_no_go`: decide whether an agent should continue a proposed
  action.
- `claim_verification`: judge a factual claim against public evidence.
- `proposal_review`: evaluate governance proposal clarity, risks, and likely
  impact.
- `safety_escalation`: decide whether a low-confidence or high-risk item needs
  expert review.

Implementation hint: preserve the current binary staked vote for settlement,
but enrich the off-chain result spec with rubric dimensions. The on-chain
question can keep anchoring `resultSpecHash`, while the SDK/API returns the
full versioned schema, interpretation rules, and export mapping.

### 3. Build Review Queues

LangSmith and Label Studio both treat queues as core workflow infrastructure.
Curyo should add:

- queue creation from an eval project, dataset, or external trace selection,
- reviewer eligibility and assignment rules,
- reservation/lease windows so two reviewers do not unknowingly duplicate
  work unless overlap is intended,
- minimum reviewers per item,
- required settled rounds per item or per bundle,
- queue status: pending, active, needs reveal, settled, inconclusive, failed,
- reviewer instructions rendered from the template and project rubric,
- "needs expert" routing for low-consensus, high-stake, or high-risk items.

This does not have to replace the public marketplace. It can be a managed layer
that creates Curyo asks underneath.

### 4. Make Agreement And Dissent First-Class

Curyo has vote distribution and stake mass, which are strong primitives. The
eval use case needs more:

- agreement score by rubric dimension,
- majority direction and minority direction,
- stake-weighted and headcount-weighted views,
- dissent summaries,
- objection clusters from public feedback,
- confidence intervals or at least explicit confidence bands,
- "inconclusive" as a respected outcome, not an error,
- reviewer quality metrics over time.

Use Label Studio's distinction as inspiration: consensus answers "how much did
the group converge?" while pairwise agreement asks "how consistently do
reviewers match each other?" Curyo can expose both where the task structure
supports it.

### 5. Support Trace And Dataset Imports

Add import adapters rather than a blank input form:

- LangSmith trace URL or JSON export -> Curyo eval item.
- OpenTelemetry span bundle -> Curyo eval item.
- Label Studio task JSON/JSONL -> Curyo eval project.
- Humanloop export JSON/JSONL -> Curyo prompt/eval/dataset import, where
  customers still have archived exports.
- Generic CSV/JSONL with columns for `input`, `output`, `source_url`,
  `rubric`, `candidate_id`, `metadata`.

The first MVP can be simple: a JSONL import endpoint plus a CLI command in
`packages/agents` that validates rows, quotes the batch, and submits one task or
bundle per row.

### 6. Export Results As Evaluation Data

Curyo should export more than audit rows. Add a result export format that can
round-trip into eval systems:

- JSONL per item with input metadata, template ID/version, result spec hash,
  public URL, settlement state, answer, confidence, vote counts, stake totals,
  agreement metrics, feedback summaries, and reward metadata.
- CSV summary for operators.
- LangSmith feedback payload mapping.
- Label Studio predictions/annotations-style mapping where practical.
- OpenAPI schema and examples.

Humanloop's sunset makes this especially important. Curyo should make "you can
leave with your prompts, rubrics, datasets, asks, results, and audit history" a
trust feature.

### 7. Add A Curyo Reliability Loop

For Curyo's own product quality, apply the same lessons internally:

1. Trace wallet-sensitive and governance-sensitive flows: connect, vote, submit,
   reveal, claim, keeper settlement, bot operations, agent ask, and result read.
2. Turn failures or confusing sessions into curated test fixtures.
3. Add offline regression tests or evals before releases.
4. Monitor production for stuck rounds, failed claims, RPC failures, wallet type
   failures, keeper anomalies, and stale deployment config.
5. Route high-risk failures to a human review queue.
6. Feed the resolution back into tests and docs.

This matters because Curyo's own trust story depends on wallet and governance
paths working reliably.

### 8. Make Enterprise Boundaries Explicit

The current Curyo agent model assumes public context URLs and public results.
That is clean and protocol-aligned, but it limits enterprise eval use cases.
There are three possible paths:

- Public-only: keep Curyo focused on public auditability and avoid private data.
- Hybrid public/private: store private inputs in customer-owned storage, submit
  hashes, presigned URLs, or redacted views, and publish only result metadata.
- Enterprise private review: introduce workspace-scoped data visibility while
  still anchoring commitments and payout state publicly.

If Curyo wants Label Studio/Humanloop-style enterprise adoption, it will need at
least workspaces, RBAC, SSO/SCIM, audit logs, retention controls, export
controls, and a crisp "where customer data lives" story. These should be part
of the architecture, not only sales copy.

## Suggested Product Roadmap

### Phase 1: Evaluation Packaging Without Contract Changes

- Rename/market the agent path as "Curyo Human Evals" in docs and SDK examples.
- Maintain and extend the eval-specific templates in `packages/agents/src/templates.ts`,
  including feature acceptance tests for public preview flows.
- Add JSONL result export for settled asks and bundles.
- Add batch quote/submit CLI examples for JSONL datasets.
- Add docs for LangSmith, Label Studio, and generic CI integration patterns.
- Surface agreement, dissent, and public feedback quality more explicitly in
  `curyo_get_result`.

### Phase 2: Projects, Datasets, And Queues

- Add off-chain `EvalProject`, `EvalDataset`, `EvalRun`, and `ReviewQueue`
  tables.
- Add queue APIs and MCP tools:
  - `curyo_create_eval_project`
  - `curyo_import_eval_items`
  - `curyo_quote_eval_run`
  - `curyo_start_eval_run`
  - `curyo_get_eval_run_status`
  - `curyo_export_eval_results`
- Add queue views in the app for creators and reviewers.
- Support reviewer assignment, reservations, and minimum overlap.

### Phase 3: Integrations And Release Gates

- Add LangSmith feedback/annotation integration.
- Add Label Studio import/export mappings.
- Add GitHub Actions or CLI release gate:
  - submit eval batch,
  - wait for settlement or timeout,
  - compare against thresholds,
  - fail the release if quality, agreement, or safety thresholds are missed.
- Add webhooks for eval-run state changes and result availability.

### Phase 4: Enterprise Data Plane

- Add workspaces, project-level access, RBAC, and audit logs.
- Support customer-owned storage for private inputs.
- Add SSO/SCIM if enterprise traction appears.
- Define retention and deletion semantics.
- Document data portability and migration guarantees.

## Concrete MVP Use Cases

These are strong because they match Curyo's current agent and bounty mechanics:

- Agent go/no-go gate: "Should the agent proceed with this external action?"
- RAG grounding check: "Is this answer supported by the linked sources?"
- Output variant review: "Which answer should ship to users?"
- Source credibility check: "Is this source reliable enough for the agent to use?"
- Governance proposal review: "Is this proposal clear, actionable, and low-risk?"
- Safety escalation: "Should this low-confidence output be blocked or sent to an
  expert?"
- Feature acceptance test: "Does this new voting or wallet flow work against
  the specified test steps well enough to ship?"

## Risks And Non-Goals

- Do not try to become a full multimodal annotation suite. Label Studio is
  already excellent at deep data labeling operations. Curyo's sharper wedge is
  paid, verified, public judgment.
- Do not hide the public-data assumption. Many enterprise eval inputs are
  private. Curyo should either embrace public-only use cases or design a
  deliberate customer-owned data plane.
- Do not treat binary voting as enough for every eval. Binary settlement is
  useful, but rubrics, dimensions, and text feedback are what make evaluation
  data reusable.
- Do not ship agent/eval features without wallet-sensitive tests. Any change to
  ask, vote, submit, reveal, claim, escrow, keeper, or deployment config needs
  targeted coverage.

## Source Notes

- [Humanloop docs overview](https://humanloop.com/docs/getting-started/overview)
- [Humanloop migration guide](https://humanloop.com/docs/guides/migrating-from-humanloop)
- [Humanloop evaluators](https://humanloop.com/docs/evaluation/overview)
- [Humanloop evaluations page](https://humanloop.com/platform/evaluations)
- [LangSmith docs home](https://docs.langchain.com/langsmith/home)
- [LangSmith observability concepts](https://docs.langchain.com/langsmith/observability-concepts)
- [LangSmith evaluation overview](https://docs.langchain.com/langsmith/evaluation)
- [LangSmith annotation queues](https://docs.langchain.com/langsmith/annotation-queues)
- [LangSmith platform setup](https://docs.langchain.com/langsmith/platform-setup)
- [Label Studio homepage](https://labelstud.io/)
- [Label Studio Enterprise platform](https://humansignal.com/platform/)
- [Label Studio ML pipeline integration](https://labelstud.io/guide/ml.html)
- [Label Studio review workflow](https://docs.humansignal.com/guide/quality.html)
- [Label Studio task agreement](https://docs.humansignal.com/guide/stats.html)
