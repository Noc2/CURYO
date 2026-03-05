import type { NextPage } from "next";

const DelegationDocs: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Delegation &amp; Security</h1>
      <p className="lead text-base-content/60 text-lg">
        Protect your non-transferable Voter ID by delegating actions to a separate hot wallet.
      </p>

      <h2>What is Delegation?</h2>
      <p>
        Your Voter ID is a non-transferable digital ID tied to your verified identity via Self.xyz. If the private key
        holding this ID is compromised, the attacker gains a verified identity that cannot be re-issued to the same
        passport. This makes the Voter ID key uniquely high-value.
      </p>
      <p>
        Delegation solves this by separating <strong>identity</strong> from <strong>execution</strong>:
      </p>
      <ul>
        <li>
          <strong>Cold wallet</strong> &mdash; holds the Voter ID, stays on a hardware wallet (Ledger, Trezor), only
          used to set/remove delegates
        </li>
        <li>
          <strong>Hot wallet (delegate)</strong> &mdash; authorized by the cold wallet, used for day-to-day voting and
          content submission
        </li>
      </ul>

      <h3>What the delegate can do</h3>
      <ul>
        <li>Vote on content</li>
        <li>Submit content</li>
        <li>Create/update a profile</li>
        <li>Register a frontend</li>
        <li>Submit category proposals</li>
      </ul>

      <h3>What the delegate cannot do</h3>
      <ul>
        <li>Transfer or burn the Voter ID (non-transferable)</li>
        <li>Set sub-delegates (only the Voter ID holder can delegate)</li>
        <li>Revoke the Voter ID (governance-only action)</li>
        <li>Exceed the holder&apos;s stake caps (shared 100 cREP per content per round)</li>
      </ul>

      <hr />

      <h2>Setting Up Delegation</h2>
      <ol>
        <li>
          <strong>Verify your identity</strong> &mdash; use your cold wallet to claim a Voter ID via the HumanFaucet
          (Self.xyz verification)
        </li>
        <li>
          <strong>Go to Governance &rarr; Profile &rarr; Delegation</strong> &mdash; connect with your cold wallet
        </li>
        <li>
          <strong>Enter your hot wallet address</strong> &mdash; this is the address your bot or daily-use wallet
          controls
        </li>
        <li>
          <strong>Click &ldquo;Set Delegate&rdquo;</strong> &mdash; confirm the transaction from your cold wallet
        </li>
        <li>
          <strong>Fund the delegate</strong> &mdash; send cREP and a small amount of CELO (for gas) to the delegate
          address
        </li>
        <li>
          <strong>Store the cold wallet offline</strong> &mdash; disconnect it, put the hardware wallet in a safe place
        </li>
      </ol>
      <p>
        The delegate address can now pass all Voter ID checks transparently. No changes are needed in how the delegate
        interacts with contracts &mdash; it simply works as if it holds the Voter ID directly.
      </p>

      <hr />

      <h2>Security Recommendations</h2>

      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Recommendation</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Use a hardware wallet for the cold wallet</td>
              <td>The private key never touches a networked device</td>
            </tr>
            <tr>
              <td>Use a dedicated address for the delegate</td>
              <td>Limits blast radius if the hot key is compromised</td>
            </tr>
            <tr>
              <td>Keep bulk cREP on the cold wallet</td>
              <td>Top up the delegate periodically rather than front-loading</td>
            </tr>
            <tr>
              <td>Fund with minimal CELO for gas</td>
              <td>~0.1 CELO at a time is sufficient for dozens of transactions</td>
            </tr>
            <tr>
              <td>Monitor delegate activity</td>
              <td>Set up balance alerts; a sudden drain indicates compromise</td>
            </tr>
            <tr>
              <td>Revoke immediately if compromised</td>
              <td>
                Use the cold wallet to call <code>removeDelegate()</code> from the governance Profile tab
              </td>
            </tr>
            <tr>
              <td>Never share the cold wallet private key</td>
              <td>Not with cloud providers, CI systems, or deployment scripts</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Incident response</h3>
      <p>If the delegate key is compromised:</p>
      <ol>
        <li>
          Connect with your cold wallet and <strong>remove the delegate</strong> (Governance &rarr; Profile &rarr;
          Delegation &rarr; Remove Delegate)
        </li>
        <li>Create a new hot wallet address</li>
        <li>Set the new address as delegate</li>
        <li>Fund the new delegate with cREP and CELO</li>
      </ol>
      <p>
        Your Voter ID remains safe on the cold wallet throughout this process. The compromised delegate can no longer
        act on your behalf once removed.
      </p>

      <hr />

      <h2>Technical Details</h2>
      <ul>
        <li>
          <strong>Stake caps are shared</strong> &mdash; both holder and delegate resolve to the same Voter ID token.
          The 100 cREP per content per round cap is enforced against the token, not the address.
        </li>
        <li>
          <strong>Rewards go to the transactor</strong> &mdash; if the delegate casts a vote, rewards for that vote go
          to the delegate address. If the holder votes directly, rewards go to the holder.
        </li>
        <li>
          <strong>Cooldowns are per-address</strong> &mdash; both holder and delegate can independently vote on the same
          content, but total stake is capped by the shared Voter ID.
        </li>
        <li>
          <strong>Revocation clears delegation</strong> &mdash; if the Voter ID is revoked via governance, the
          delegation mapping is automatically cleaned up.
        </li>
        <li>
          <strong>One delegate per holder</strong> &mdash; setting a new delegate automatically removes the old one.
        </li>
        <li>
          <strong>Delegates cannot hold their own Voter IDs</strong> &mdash; an address that already has its own Voter
          ID cannot be a delegate (and vice versa). This prevents identity amplification.
        </li>
      </ul>

      <hr />

      <h2>Constraints</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>One delegate per holder</td>
              <td>Prevents identity amplification through multiple delegates</td>
            </tr>
            <tr>
              <td>One holder per delegate</td>
              <td>Each delegate represents exactly one identity</td>
            </tr>
            <tr>
              <td>Delegate cannot be a Voter ID holder</td>
              <td>Prevents dual-identity (would allow bypassing per-identity caps)</td>
            </tr>
            <tr>
              <td>Cannot delegate to self</td>
              <td>Redundant operation with no effect</td>
            </tr>
            <tr>
              <td>Cannot create Voter ID for active delegate</td>
              <td>Prevents address from being both holder and delegate simultaneously</td>
            </tr>
            <tr>
              <td>Only Voter ID holder can set/remove delegate</td>
              <td>Delegate cannot modify delegation; control stays with cold wallet</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Contract Functions</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Function</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>setDelegate(address)</code>
              </td>
              <td>Authorize a delegate to act on behalf of your Voter ID</td>
            </tr>
            <tr>
              <td>
                <code>removeDelegate()</code>
              </td>
              <td>Revoke the current delegate&apos;s authorization</td>
            </tr>
            <tr>
              <td>
                <code>resolveHolder(address)</code>
              </td>
              <td>Returns the effective Voter ID holder for an address (self or delegator)</td>
            </tr>
            <tr>
              <td>
                <code>delegateTo(address)</code>
              </td>
              <td>View: who has this holder delegated to?</td>
            </tr>
            <tr>
              <td>
                <code>delegateOf(address)</code>
              </td>
              <td>View: which holder does this delegate represent?</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
};

export default DelegationDocs;
