import Link from "next/link";
import type { NextPage } from "next";

const PrivacyPage: NextPage = () => {
  return (
    <div className="legal-shell mx-auto w-full px-4 py-8">
      <Link href="/legal" className="link link-primary text-base mb-4 inline-block">
        &larr; Back to Legal
      </Link>

      <article className="prose legal-prose max-w-none">
        <h1>Privacy Notice</h1>
        <p className="readability-meta">Last updated: March 2026</p>

        <h2>1. Introduction</h2>
        <p>
          This Privacy Notice explains how this interface (&quot;the Interface&quot;), operated by Hawig Ventures UG
          (haftungsbeschr&auml;nkt), Herzogin-Juliana-Stra&szlig;e 7, 55469 Simmern, Germany (&quot;we&quot;,
          &quot;us&quot;, &quot;the data controller&quot;), handles information when you use it to access the Curyo
          Protocol. We are committed to transparency about our data practices.
        </p>
        <p>
          <strong>Important Distinction:</strong> This Privacy Notice applies only to this Interface (the website). The
          Curyo Protocol is a set of decentralized smart contracts that operate independently on the blockchain. The
          Interface operator does not control the Protocol and cannot access, modify, or delete any data recorded on the
          blockchain.
        </p>

        <h2>2. Protocol Data vs Interface Data</h2>

        <h3>2.1 Protocol Data (Blockchain - NOT Controlled by Us)</h3>
        <p>
          When you interact with the Curyo Protocol through any interface, the following information is recorded
          directly on the public blockchain:
        </p>
        <ul>
          <li>Your wallet address</li>
          <li>Voting transactions (stakes, votes, claims)</li>
          <li>Content submission transactions</li>
          <li>Transaction timestamps and amounts</li>
          <li>Smart contract interaction history</li>
        </ul>
        <p>
          <strong>Important:</strong> Blockchain data is permanent, public, and immutable. Neither this Interface nor
          any other party can modify or delete this data. This data exists independently of this Interface and would
          continue to exist even if this Interface ceased to operate.
        </p>

        <h3>2.2 Interface Data (Controlled by Us)</h3>
        <p>This Interface may collect or process the following information:</p>
        <ul>
          <li>
            <strong>Browser Storage Data:</strong> Terms acceptance status, onboarding state, interface preferences,
            temporary wallet-display and notification state, referral information, locally tracked content-interaction
            data, and similar functional data stored in your browser via local storage or session storage.
          </li>
          <li>
            <strong>Wallet-Linked Application Data:</strong> Watchlist entries, followed wallet addresses, notification
            preferences, and related timestamps needed to provide those features.
          </li>
          <li>
            <strong>Signed Authorization Data:</strong> Short-lived signature challenges and read/write session records
            used to authorize wallet-bound features. These records may include wallet address, feature scope, nonce or
            token material, payload hashes, and creation/expiry timestamps.
          </li>
          <li>
            <strong>Email Notification Data (Optional):</strong> If you enable email notifications, we process your
            email address, notification preferences, verification status, verification token, and related timestamps.
          </li>
          <li>
            <strong>Security and Abuse-Prevention Data:</strong> Temporary rate-limit and replay-protection records,
            which may be derived from trusted IP headers or fallback request fingerprints plus route metadata.
          </li>
        </ul>

        <h3>2.3 What We Do NOT Collect</h3>
        <p>
          <strong>This Interface does not use analytics or advertising cookies.</strong> We do use limited,
          strictly-necessary cookies or similar session tokens for wallet-bound features such as watchlists, follows,
          and notification settings. These cookies are used for security and feature operation, not for cross-site
          tracking or advertising.
        </p>
        <p>This Interface also does not collect:</p>
        <ul>
          <li>Name, phone number, postal address, or similar offline contact details</li>
          <li>Passport or government ID document data from Self.xyz</li>
          <li>Analytics, advertising, or cross-site behavioral tracking profiles</li>
          <li>Biometric data</li>
          <li>Your wallet private keys, seed phrases, or custody of your assets</li>
        </ul>

        <h2>3. How We Use Information</h2>

        <h3>3.1 Browser Storage and Necessary Session Cookies</h3>
        <p>Browser-side data and necessary session cookies are used for:</p>
        <ul>
          <li>Remembering your acceptance of Terms of Service and Privacy Notice</li>
          <li>Preserving interface preferences and onboarding context</li>
          <li>Supporting wallet-bound signed sessions for watchlists, follows, and notification settings</li>
          <li>Reducing duplicate notices or preserving short-lived UI state between refreshes</li>
        </ul>
        <p>Local and session storage can be cleared through your browser settings at any time.</p>

        <h3>3.2 Server-Side Feature Data</h3>
        <p>Wallet-linked application data is used to operate optional interface features, including:</p>
        <ul>
          <li>Saving and retrieving watched content</li>
          <li>Saving and retrieving followed curator wallets</li>
          <li>Saving and retrieving in-app notification preferences</li>
          <li>Verifying wallet-scoped read and write sessions for protected interface actions</li>
        </ul>

        <h3>3.3 Email Notification Data</h3>
        <p>If you opt into email notifications, we use your email-related data to:</p>
        <ul>
          <li>Store your chosen delivery address and notification preferences</li>
          <li>Send verification emails and verify control of the address</li>
          <li>Deliver product emails that you explicitly enabled</li>
        </ul>

        <h3>3.4 Security and Abuse Prevention</h3>
        <p>Security-related data is used to:</p>
        <ul>
          <li>Rate-limit API endpoints</li>
          <li>Prevent replay or reuse of signed authorization challenges</li>
          <li>Investigate operational issues and protect the Interface from abuse</li>
        </ul>

        <h2>4. Third-Party Services</h2>
        <p>The Interface may interact with the following third-party services:</p>
        <ul>
          <li>
            <strong>Blockchain RPC Providers:</strong> To read and write blockchain data (e.g., Alchemy, Infura, or
            similar). These providers may have their own privacy policies regarding request logging.
          </li>
          <li>
            <strong>Wallet Providers:</strong> When you connect your wallet (e.g., MetaMask, WalletConnect, Rainbow),
            those services have their own data practices. We recommend reviewing their privacy policies.
          </li>
          <li>
            <strong>Hosting Provider:</strong> Our frontend is hosted on infrastructure that may collect standard server
            logs (IP addresses, request timestamps). These logs are typically retained for 30-90 days and used only for
            security and debugging purposes.
          </li>
          <li>
            <strong>Content Delivery Networks:</strong> We may use CDNs to deliver static assets, which may process
            requests according to their own policies.
          </li>
          <li>
            <strong>Email Delivery Provider (Resend):</strong> If you enable email notifications, verification and
            notification emails may be delivered through Resend, which processes your email address and the email
            content needed to deliver that message.
          </li>
          <li>
            <strong>Identity Verification (Self.xyz):</strong> To claim tokens from the faucet, you may verify your
            identity through{" "}
            <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
              Self.xyz
            </a>
            , a third-party identity verification service for supported documents such as passports or biometric ID
            cards. Self.xyz uses zero-knowledge proofs &mdash; your document data is processed entirely on your mobile
            device and is never shared with this Interface or stored on the blockchain. Only a cryptographic proof of
            humanity, 18+ status, sanctioned-country eligibility, and an OFAC compliance result are transmitted
            on-chain. No personal information (name, document number, exact date of birth, nationality, or gender) is
            collected, stored, or accessible by the Interface operator. Self.xyz has its own privacy policy which we
            recommend reviewing.
          </li>
        </ul>

        <h2>5. Data Retention</h2>
        <ul>
          <li>
            <strong>Blockchain data:</strong> Permanent and immutable (not controlled by us)
          </li>
          <li>
            <strong>Local and session storage:</strong> Until you clear your browser data or the browser session ends,
            depending on the storage mechanism
          </li>
          <li>
            <strong>Watchlists, follows, and notification preferences:</strong> Until you change or remove them, or we
            delete them in the ordinary course of operating the feature
          </li>
          <li>
            <strong>Signed read/write sessions:</strong> Up to 7 days
          </li>
          <li>
            <strong>Signed action challenges:</strong> Typically 5 minutes; used challenge records may be retained for
            up to 24 hours for replay protection
          </li>
          <li>
            <strong>Email notification subscriptions:</strong> Until you remove or replace the address; verification
            tokens expire after 24 hours
          </li>
          <li>
            <strong>Rate-limit records:</strong> Until the applicable rate-limit window expires
          </li>
          <li>
            <strong>Server logs:</strong> Retained according to hosting provider policies (typically 30-90 days)
          </li>
        </ul>

        <h2>6. Your Rights</h2>
        <p>Due to the nature of blockchain technology and our minimal data collection:</p>
        <ul>
          <li>
            <strong>Right to Access:</strong> All blockchain data is publicly accessible through any blockchain
            explorer. Browser storage data can be viewed in your browser&apos;s developer tools. Server-side feature
            data tied to optional interface features may be requested from us where applicable.
          </li>
          <li>
            <strong>Right to Rectification and Update:</strong> You can change watchlists, follows, notification
            preferences, and email notification settings through the Interface.
          </li>
          <li>
            <strong>Right to Deletion:</strong> Blockchain data cannot be deleted by anyone. Browser storage can be
            cleared by you at any time through your browser settings. Optional server-side interface data such as
            follows, watchlists, and notification settings can be removed through the Interface or by contacting us
            where applicable.
          </li>
          <li>
            <strong>Right to Portability:</strong> You maintain full control of your wallet and can use it with any
            compatible service or interface.
          </li>
          <li>
            <strong>Right to Object:</strong> You may stop using this Interface at any time. The Protocol remains
            accessible through other means.
          </li>
        </ul>
        <p>
          For users in the European Union and Germany: Given that we do not collect or store personal data beyond what
          is described above, most rights under the GDPR and the German Federal Data Protection Act (BDSG) are either
          automatically satisfied or not applicable. If you have specific privacy concerns, please contact us at
          hawigxyz@proton.me or lodge a complaint with the competent supervisory authority. For our registered office in
          Rhineland-Palatinate, the responsible authority is:
        </p>
        <p>
          Der Landesbeauftragte f&uuml;r den Datenschutz und die Informationsfreiheit Rheinland-Pfalz
          <br />
          Hintere Bleiche 34, 55116 Mainz, Germany
          <br />
          <a href="https://www.datenschutz.rlp.de" target="_blank" rel="noopener noreferrer">
            www.datenschutz.rlp.de
          </a>
        </p>

        <h2>7. Security</h2>
        <p>
          We implement reasonable security measures for our frontend infrastructure. However, the security of your
          tokens and wallet depends entirely on your own security practices.
        </p>
        <p>
          <strong>We strongly recommend:</strong>
        </p>
        <ul>
          <li>Using hardware wallets for significant holdings</li>
          <li>Never sharing your private keys or seed phrases with anyone</li>
          <li>Verifying you are on the correct website before connecting your wallet</li>
          <li>Carefully reviewing all transaction details before signing</li>
          <li>Being cautious of phishing attempts and fake interfaces</li>
        </ul>

        <h2>8. Children&apos;s Privacy</h2>
        <p>
          The Service is not intended for users under 18 years of age (or the age of majority in your jurisdiction). We
          do not knowingly collect information from minors. If you believe a minor has accessed the Service, please
          contact us.
        </p>

        <h2>9. International Users</h2>
        <p>
          This Interface is operated from Germany. If you access the Interface from other regions, please be aware that
          information may be transferred to, stored, and processed in Germany or other jurisdictions where our service
          providers operate, including hosting, RPC, CDN, and email delivery providers.
        </p>
        <p>
          By using the Interface, you consent to such transfers. We note that blockchain data is stored on a globally
          distributed network and is not localized to any single jurisdiction.
        </p>

        <h2>10. Changes to This Notice</h2>
        <p>
          We may update this Privacy Notice from time to time. Changes will be posted on this page with an updated
          revision date. Material changes may require re-acceptance of Terms through the acceptance modal.
        </p>
        <p>We recommend reviewing this Notice periodically to stay informed about our data practices.</p>

        <h2>11. Contact</h2>
        <p>
          For privacy-related questions or concerns, please contact: Hawig Ventures UG (haftungsbeschr&auml;nkt),
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

export default PrivacyPage;
