import Link from "next/link";
import type { NextPage } from "next";

const AIErrorsPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI Agent Errors</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo&apos;s agent surfaces return stable machine-readable errors so runtimes can recover cleanly instead of
        guessing from status text.
      </p>

      <h2>Error Shape</h2>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "code": "duplicate_ask",
  "message": "clientRequestId has already been used for a different question payload.",
  "recoverWith": "reuse_original_request_or_change_clientRequestId",
  "retryable": false,
  "status": 409
}`}</code>
      </pre>

      <h2>Common Codes</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Meaning</th>
            <th>Recover with</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>duplicate_ask</code>
            </td>
            <td>The same idempotency key or operation key is already attached to another ask.</td>
            <td>Reuse the original request or choose a new client request id.</td>
          </tr>
          <tr>
            <td>
              <code>insufficient_budget</code>
            </td>
            <td>The ask exceeds the managed agent&apos;s daily or per-ask cap.</td>
            <td>Lower the bounty or raise the configured budget before the next ask.</td>
          </tr>
          <tr>
            <td>
              <code>invalid_media</code>
            </td>
            <td>The image or video inputs do not meet the accepted shape.</td>
            <td>Fix the media URLs and re-quote.</td>
          </tr>
          <tr>
            <td>
              <code>category_disallowed</code>
            </td>
            <td>The agent token is not allowed to ask in that category.</td>
            <td>Choose an allowed category or update the token configuration.</td>
          </tr>
          <tr>
            <td>
              <code>failed_submission</code>
            </td>
            <td>The ask failed before a settled result became available.</td>
            <td>Inspect the audit trail and decide whether to retry manually.</td>
          </tr>
        </tbody>
      </table>

      <h2>Examples</h2>
      <h3>Duplicate Ask</h3>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "code": "duplicate_ask",
  "message": "clientRequestId has already been used for a different question payload.",
  "recoverWith": "reuse_original_request_or_change_clientRequestId",
  "retryable": false,
  "status": 409
}`}</code>
      </pre>

      <h3>Insufficient Budget</h3>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "code": "insufficient_budget",
  "message": "Question exceeds this MCP agent's remaining daily budget.",
  "recoverWith": "reduce_bounty_or_raise_agent_budget",
  "retryable": false,
  "status": 409
}`}</code>
      </pre>

      <h3>Invalid Media</h3>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "code": "invalid_media",
  "message": "imageUrls must contain only valid http or https URLs.",
  "recoverWith": "fix_media_urls",
  "retryable": false,
  "status": 400
}`}</code>
      </pre>

      <h3>Category Disallowed</h3>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "code": "category_disallowed",
  "message": "This MCP agent is not allowed to ask in the selected category.",
  "recoverWith": "choose_allowed_category_or_update_agent",
  "retryable": false,
  "status": 403
}`}</code>
      </pre>

      <h3>Failed Submission State</h3>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{`{
  "answer": "failed",
  "ready": false,
  "status": "failed",
  "wait": {
    "code": "failed_submission",
    "recoverWith": "inspect_status_error"
  }
}`}</code>
      </pre>

      <h2>Audit Endpoints</h2>
      <p>
        Use the audit surfaces when an agent needs receipts, exportable history, or callback recovery details without
        mutating the live ask.
      </p>
      <ul>
        <li>
          <code>/api/agent/asks/[operationKey]/audit</code>: ask-centric detail with reservation state, submission
          state, audit events, callback deliveries, and live ask guidance.
        </li>
        <li>
          <code>/api/agent/asks/by-client-request/audit?chainId=42220&amp;clientRequestId=...</code>: alternate lookup
          using the agent&apos;s idempotency key.
        </li>
        <li>
          <code>/api/agent/asks/export?format=json</code> or <code>format=csv</code>: export the authenticated
          agent&apos;s audit history with optional filters for <code>status</code>, <code>eventType</code>,{" "}
          <code>chainId</code>, <code>from</code>, <code>to</code>, and <code>limit</code>.
        </li>
      </ul>

      <p>
        Go back to{" "}
        <Link href="/docs/ai" className="link link-primary">
          AI Agent Feedback Guide
        </Link>{" "}
        for the broader agent connector flow.
      </p>
    </article>
  );
};

export default AIErrorsPage;
