import Link from "next/link";
import type { NextPage } from "next";

const PrivacyPage: NextPage = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/legal" className="link link-primary text-base mb-4 inline-block">
        &larr; Back to Legal
      </Link>

      <article className="prose prose-sm max-w-none">
        <h1>Privacy Notice</h1>
        <p className="text-base-content/60">Last updated: February 2026</p>

        <h2>1. Introduction</h2>
        <p>
          This Privacy Notice explains how this interface (&quot;the Interface&quot;), operated by Hawig Ventures UG
          (haftungsbeschr&auml;nkt), Herzogin-Juliana-Stra&szlig;e 7, 55469 Simmern, Germany (&quot;we&quot;,
          &quot;us&quot;, &quot;the data controller&quot;), handles information when you use it to access the cREP
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
            <strong>Local Storage Data:</strong> Terms acceptance status, user interface preferences (theme, settings),
            and similar functional data stored in your browser.
          </li>
        </ul>

        <h3>2.3 What We Do NOT Collect</h3>
        <p>
          <strong>This Interface does not use cookies of any kind.</strong> No cookies are set, read, or transmitted —
          neither for tracking, analytics, advertising, nor functional purposes. Accordingly, no cookie consent banner
          is required.
        </p>
        <p>This Interface also does not collect:</p>
        <ul>
          <li>Personal identification information (name, email, phone number)</li>
          <li>Precise location data</li>
          <li>IP addresses (beyond standard server logs which are automatically deleted)</li>
          <li>Analytics or behavioral tracking data</li>
          <li>Biometric data</li>
          <li>Account information (we do not have access to your wallet)</li>
        </ul>

        <h2>3. How We Use Information</h2>

        <h3>3.1 Local Storage Data</h3>
        <p>Data stored in your browser is used for:</p>
        <ul>
          <li>Remembering your acceptance of Terms of Service and Privacy Notice</li>
          <li>Preserving your interface preferences (theme, display settings)</li>
        </ul>
        <p>This data never leaves your device and can be cleared through your browser settings at any time.</p>

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
            <strong>Identity Verification (Self.xyz):</strong> To claim tokens from the faucet, you may verify your
            identity through{" "}
            <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
              Self.xyz
            </a>
            , a third-party passport verification service. Self.xyz uses zero-knowledge proofs &mdash; your passport
            data is processed entirely on your mobile device and is never shared with this Interface or stored on the
            blockchain. Only a cryptographic proof of humanity and an OFAC compliance result are transmitted on-chain.
            No personal information (name, passport number, date of birth, nationality, or gender) is collected, stored,
            or accessible by the Interface operator. Self.xyz has its own privacy policy which we recommend reviewing.
          </li>
        </ul>

        <h2>5. Data Retention</h2>
        <ul>
          <li>
            <strong>Blockchain data:</strong> Permanent and immutable (not controlled by us)
          </li>
          <li>
            <strong>Local storage:</strong> Until you clear your browser data
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
            explorer. Local storage data can be viewed in your browser&apos;s developer tools.
          </li>
          <li>
            <strong>Right to Deletion:</strong> Blockchain data cannot be deleted by anyone. Local storage can be
            cleared by you at any time through your browser settings.
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
          info@hawig.xyz or lodge a complaint with the competent supervisory authority. For our registered office in
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
          providers operate.
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
          Herzogin-Juliana-Stra&szlig;e 7, 55469 Simmern, Germany. Email: info@hawig.xyz. See also our{" "}
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
