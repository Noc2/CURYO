import Link from "next/link";
import type { NextPage } from "next";

const TermsPage: NextPage = () => {
  return (
    <div className="legal-shell mx-auto w-full px-4 py-8">
      <Link href="/legal" className="link link-primary text-base mb-4 inline-block">
        &larr; Back to Legal
      </Link>

      <article className="prose legal-prose max-w-none">
        <h1>Terms of Service</h1>
        <p className="readability-meta">Last updated: March 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          This Interface is operated by Hawig Ventures UG (haftungsbeschr&auml;nkt), Herzogin-Juliana-Stra&szlig;e 7,
          55469 Simmern, Germany (&quot;the Interface Operator&quot;, &quot;we&quot;, &quot;us&quot;). By accessing or
          using this interface to interact with the Curyo Protocol (&quot;the Service&quot;), you agree to be bound by
          these Terms of Service and the{" "}
          <Link href="/legal/privacy" className="link link-primary">
            Privacy Notice
          </Link>
          . If you do not agree to these terms, do not use the Service.
        </p>

        <h2>2. Protocol vs Interface Distinction</h2>
        <p>
          <strong>Curyo Protocol</strong> refers to a set of smart contracts deployed on blockchain networks. Depending
          on the specific contract and deployment, the Protocol may include governance, administrative, pause, or
          upgrade mechanisms defined on-chain. The Protocol generally:
        </p>
        <ul>
          <li>Can be accessed without this Interface</li>
          <li>Records transactions independently of this Interface once they are submitted on-chain</li>
          <li>
            May continue to function even if this Interface is unavailable, subject to blockchain, governance, and
            protocol-level dependencies
          </li>
        </ul>
        <p>
          <strong>This Interface</strong> (the website at this domain) is merely one way to access and interact with the
          Curyo Protocol. The Interface operator:
        </p>
        <ul>
          <li>Does not have custody of your tokens at any time</li>
          <li>Cannot reverse, modify, or intervene in your transactions once they are finalized on-chain</li>
          <li>
            Is not necessarily the only party with protocol-related governance, admin, pause, or upgrade permissions
          </li>
          <li>Is not responsible for the Protocol&apos;s operation or outcomes</li>
        </ul>
        <p>
          You may interact with the Curyo Protocol through other interfaces, directly via blockchain explorers, or
          through smart contract calls. The existence of this Interface does not create any special relationship between
          you and the Interface operator.
        </p>

        <h2>3. Eligibility</h2>
        <p>
          <strong>The Service is NOT available to:</strong>
        </p>
        <ul>
          <li>Persons under the age of 18 (or the age of majority in your jurisdiction)</li>
          <li>Persons in any jurisdiction where blockchain or decentralized application services are prohibited</li>
          <li>Persons subject to sanctions or unable to pass configured sanctioned-country eligibility checks</li>
        </ul>
        <p>
          By using the Service, you represent and warrant that you meet all eligibility requirements and are legally
          permitted to use the Service in your jurisdiction. The availability of this Interface does not constitute an
          offer or solicitation in any jurisdiction where such offer would be unlawful.
        </p>

        <h2>4. Token Usage</h2>
        <p>
          <strong>You acknowledge and agree that:</strong>
        </p>
        <ul>
          <li>cREP tokens are reputation tokens used for content curation and governance within the Protocol</li>
          <li>cREP tokens have no monetary value and are not intended as an investment</li>
          <li>You may lose tokens through normal Protocol operation (e.g., incorrect curation predictions)</li>
          <li>There is no guarantee of any particular outcomes from your participation</li>
          <li>Historical outcomes do not indicate or guarantee future results</li>
          <li>The Interface operator has no liability for any token losses you incur</li>
        </ul>

        <h2>5. Risk Disclosures</h2>
        <div className="alert alert-info my-4">
          <span className="font-bold">
            IMPORTANT: Using the Curyo Protocol involves significant risks. Please read this section carefully.
          </span>
        </div>

        <h3>5.1 Smart Contract Risks</h3>
        <p>
          The Curyo Protocol operates through smart contracts deployed on blockchain networks. Smart contracts carry
          inherent and significant risks:
        </p>
        <ul>
          <li>
            <strong>Bugs and Vulnerabilities:</strong> Despite audits and testing, smart contracts may contain
            undiscovered bugs, vulnerabilities, or exploits that could result in partial or total loss of tokens
          </li>
          <li>
            <strong>Contract Design and Governance:</strong> Some contracts may be immutable, while others may include
            governance-controlled pause or upgrade mechanisms. Those mechanisms can fail, be misused, or introduce new
            risks
          </li>
          <li>
            <strong>Upgrade Risks:</strong> Upgrades or other governance actions may change contract behavior,
            permissions, or economics, and may fail or be executed maliciously
          </li>
          <li>
            <strong>Economic Attacks:</strong> The Protocol may be susceptible to economic attacks, flash loan attacks,
            oracle manipulation, or other exploit vectors
          </li>
          <li>
            <strong>Dependency Risks:</strong> The Protocol depends on external systems including blockchain networks,
            oracles, and other protocols which may fail or be compromised
          </li>
        </ul>

        <h3>5.2 Blockchain Technology Risks</h3>
        <p>Using blockchain technology involves inherent risks:</p>
        <ul>
          <li>
            <strong>Irreversibility:</strong> Blockchain transactions are final and irreversible. Errors cannot be
            undone
          </li>
          <li>
            <strong>Network Risks:</strong> Blockchain networks may experience congestion, forks, reorganizations,
            attacks, or complete failures
          </li>
          <li>
            <strong>Gas Costs:</strong> You are responsible for all network transaction fees (gas), which can be
            significant during periods of network congestion
          </li>
          <li>
            <strong>Wallet Security:</strong> You are solely responsible for securing your wallet, private keys, and
            seed phrases. Lost keys cannot be recovered
          </li>
          <li>
            <strong>Phishing and Scams:</strong> You may encounter phishing websites, malicious contracts, or scams
            impersonating the Curyo Protocol
          </li>
        </ul>

        <h3>5.3 Operational Risks</h3>
        <ul>
          <li>
            <strong>Curation is Not Advice:</strong> Content ratings and curation outcomes are community-driven and do
            not constitute recommendations or endorsements
          </li>
          <li>
            <strong>Reward Variability:</strong> Token rewards depend on various factors and are not guaranteed
          </li>
          <li>
            <strong>Interface Availability:</strong> This Interface may become unavailable, but the Protocol will
            continue to operate independently
          </li>
          <li>
            <strong>Identity Verification:</strong> The faucet uses Self.xyz for zero-knowledge identity verification
            using supported documents such as passports or biometric ID cards. Faucet eligibility also requires proof
            that you are 18 or older, sanctions clearance, and configured sanctioned-country checks; sanctioned-country
            jurisdictions such as Cuba, Iran, North Korea, and Syria cannot claim. While no personal data is shared with
            this Interface, the on-chain nullifier permanently links one verification per supported document. If
            Self.xyz&apos;s service becomes unavailable, alternative faucet mechanisms may not be available
          </li>
        </ul>

        <h2>6. Description of Service</h2>
        <p>
          Curyo is a decentralized content curation protocol that allows users to stake reputation tokens to vote on
          content quality. The Protocol enables:
        </p>
        <ul>
          <li>Submission of content URLs for community curation</li>
          <li>Staking cREP tokens to vote on content quality (upvote/downvote)</li>
          <li>Distribution of token rewards based on curation outcomes</li>
          <li>Governance participation through token holding</li>
          <li>
            Identity verification through third-party services (e.g., Self.xyz) for age-gated, sanctions-screened,
            Sybil-resistant token distribution
          </li>
        </ul>
        <p>
          <strong>The Service is NOT:</strong>
        </p>
        <ul>
          <li>A gambling or betting platform</li>
          <li>A financial product or investment vehicle</li>
        </ul>
        <p>
          Submission and Question Reward Pool features are question-first: a submission may be text-only or include one
          image or one YouTube link, and the reward pool is paid in USDC on Celo while displayed to users as USD. A
          default frontend-operator share may be reserved from qualified claims when the vote was attributed to an
          eligible frontend. The Interface does not impose a hard reward pool cap, but it may apply moderation,
          duplicate-detection, media-type, and eligibility checks before a submission is accepted or a claim is
          processed.
        </p>
        <p>
          Question rewards are equal within each qualified reward-pool round for eligible revealed Voter ID holders, and
          claims are gated by Voter ID and related protocol checks. These guardrails are intended to reduce spam,
          preserve Sybil resistance, and keep the submission surface narrow.
        </p>

        <h2>7. User Responsibilities</h2>
        <p>You are solely responsible for:</p>
        <ul>
          <li>Maintaining the security of your wallet, private keys, and seed phrases</li>
          <li>All activities that occur under your wallet address</li>
          <li>Ensuring your use of the Service complies with all applicable laws in your jurisdiction</li>
          <li>Understanding the risks involved in using blockchain technology and smart contracts</li>
          <li>Any taxes, reporting obligations, or regulatory compliance arising from your use of the Service</li>
          <li>Conducting your own due diligence before participating</li>
          <li>Verifying you are interacting with the legitimate Interface and Protocol</li>
        </ul>

        <h2>8. Prohibited Uses</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Provide false information regarding your identity or eligibility</li>
          <li>Attempt to manipulate content ratings through coordinated or automated activity</li>
          <li>Ask questions with content that violates intellectual property rights</li>
          <li>Ask questions with content that is illegal, harmful, or violates platform guidelines</li>
          <li>Interfere with or disrupt the Service or its infrastructure</li>
          <li>Use the Service for money laundering, terrorist financing, or other illicit activities</li>
          <li>Exploit bugs, vulnerabilities, or errors in the Protocol or Interface</li>
        </ul>

        <h2>9. No Fiduciary Duty</h2>
        <p>
          <strong>
            The Interface operator, Protocol developers, and any associated parties owe NO fiduciary duties to you.
          </strong>
        </p>
        <p>This means:</p>
        <ul>
          <li>There is no duty of care owed to you</li>
          <li>There is no duty of loyalty owed to you</li>
          <li>There is no duty of disclosure beyond what is provided in these Terms</li>
          <li>Your use of the Service is at arm&apos;s length</li>
          <li>No advisor-client or similar professional relationship is created</li>
        </ul>
        <p>
          You should consult qualified legal and tax professionals before using the Protocol. Nothing in the Service
          constitutes professional advice of any kind.
        </p>

        <h2>10. Intellectual Property</h2>
        <p>
          The Interface&apos;s code, design, and branding are the property of the Interface operator or its licensors.
          The Curyo Protocol smart contracts may be open source under their respective licenses.
        </p>
        <p>
          User-provided content remains the property of the original creators. By asking questions with content URLs,
          you represent that you have the right to share such content and that doing so does not violate any third-party
          rights.
        </p>

        <h2>11. Third-Party Content</h2>
        <p>
          The Curyo Protocol indexes and displays links to third-party content. We do not endorse, verify, or take
          responsibility for the accuracy, legality, quality, or safety of any external content. Accessing external
          links is entirely at your own risk.
        </p>

        <h2>12. Disclaimer of Warranties</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS
          OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
        </p>
        <ul>
          <li>WARRANTIES OF MERCHANTABILITY</li>
          <li>FITNESS FOR A PARTICULAR PURPOSE</li>
          <li>NON-INFRINGEMENT</li>
          <li>ACCURACY OR RELIABILITY OF CONTENT</li>
          <li>SECURITY OF THE PROTOCOL OR INTERFACE</li>
          <li>UNINTERRUPTED OR ERROR-FREE OPERATION</li>
        </ul>
        <p>
          WE DO NOT WARRANT THAT THE SERVICE WILL BE SECURE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE PROTOCOL IS
          FREE OF BUGS OR VULNERABILITIES.
        </p>

        <h2>13. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE INTERFACE OPERATOR, ITS AFFILIATES, AND THEIR
          RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
        </p>
        <ul>
          <li>LOSS OF PROFITS, DATA, OR TOKENS</li>
          <li>LOSS OF USE OR GOODWILL</li>
          <li>BUSINESS INTERRUPTION</li>
          <li>COST OF SUBSTITUTE SERVICES</li>
        </ul>
        <p>ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
        <p>
          IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE GREATER OF (A) $100 USD OR (B) THE AMOUNT OF FEES PAID BY YOU
          TO THE INTERFACE OPERATOR IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
        </p>
        <p>
          You acknowledge that smart contracts may contain bugs or vulnerabilities, and you accept the risk of loss
          associated with interacting with such contracts. This limitation applies regardless of the theory of
          liability.
        </p>

        <h2>14. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless the Interface operator, its affiliates, and their respective
          officers, directors, employees, contractors, and agents from and against any claims, damages, losses,
          liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising from:
        </p>
        <ul>
          <li>Your use of the Service</li>
          <li>Your violation of these Terms</li>
          <li>Your violation of any applicable law or regulation</li>
          <li>Your violation of any third-party rights</li>
          <li>Any content you submit through the Service</li>
          <li>Any false representations regarding your eligibility</li>
        </ul>

        <h2>15. Dispute Resolution</h2>
        <p>
          <strong>Governing Law:</strong> These Terms shall be governed by and construed in accordance with the laws of
          the Federal Republic of Germany, without regard to its conflict of law provisions.
        </p>
        <p>
          <strong>Jurisdiction:</strong> For any disputes arising out of or relating to these Terms or your use of the
          Service, the courts of Germany shall have jurisdiction. If you are a consumer within the EU, you may also
          bring proceedings in the courts of your place of residence.
        </p>
        <p>
          <strong>Class Action Waiver:</strong> TO THE EXTENT PERMITTED BY APPLICABLE LAW, YOU AGREE THAT ANY CLAIMS
          MUST BE BROUGHT IN YOUR INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR
          REPRESENTATIVE PROCEEDING.
        </p>

        <h2>16. Acknowledgment of Risks</h2>
        <p>By using the Curyo Protocol through this Interface, you explicitly acknowledge and accept:</p>
        <ul>
          <li>You have read and understood all risks described in these Terms</li>
          <li>You are using the Protocol and this Interface entirely at your own risk</li>
          <li>You may lose cREP tokens through normal Protocol operation</li>
          <li>You are legally permitted to use the Service in your jurisdiction</li>
          <li>You have the legal capacity and authority to accept these terms</li>
          <li>You are solely responsible for your own due diligence and decisions</li>
          <li>You will not hold the Interface operator liable for any losses</li>
        </ul>

        <h2>17. Modifications</h2>
        <p>
          We reserve the right to modify these Terms at any time. Changes will be effective upon posting to the
          Interface. Material changes will require re-acceptance through the Terms acceptance modal. Your continued use
          of the Service after changes constitutes acceptance of the modified Terms.
        </p>
        <p>
          We recommend reviewing these Terms periodically. The &quot;Last updated&quot; date at the top indicates when
          the Terms were last revised.
        </p>

        <h2>18. Severability</h2>
        <p>
          If any provision of these Terms is found to be invalid, illegal, or unenforceable, the remaining provisions
          will continue in full force and effect. The invalid provision will be modified to the minimum extent necessary
          to make it valid and enforceable while preserving its intent.
        </p>

        <h2>19. Entire Agreement</h2>
        <p>
          These Terms, together with the Privacy Notice, constitute the entire agreement between you and the Interface
          operator regarding your use of the Service. These Terms supersede any prior agreements or communications.
        </p>

        <h2>20. Contact</h2>
        <p>
          For questions about these Terms, please contact: Hawig Ventures UG (haftungsbeschr&auml;nkt),
          Herzogin-Juliana-Stra&szlig;e 7, 55469 Simmern, Germany. Email: hawigxyz@proton.me. See also our{" "}
          <Link href="/legal/imprint" className="link link-primary">
            Imprint
          </Link>
          .
        </p>
      </article>
    </div>
  );
};

export default TermsPage;
