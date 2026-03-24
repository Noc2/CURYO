import { getFreeTransactionLimit } from "~~/lib/env/server";

const EXCHANGES = [
  {
    href: "https://www.coinbase.com/how-to-buy/celo",
    label: "Coinbase",
    description: "Buy CELO with supported bank transfers or debit cards, then withdraw it to your Curyo wallet.",
  },
  {
    href: "https://www.kraken.com/learn/buy-celo-celo",
    label: "Kraken",
    description: "Buy CELO with card, ACH, or bank transfer in supported regions, then withdraw on Celo mainnet.",
  },
  {
    href: "https://docs.celo.org/home/exchanges",
    label: "Celo exchange directory",
    description: "Official Celo list of centralized and decentralized exchanges that support the ecosystem.",
  },
] as const;

const ONRAMPS = [
  {
    href: "https://banxa.com",
    label: "Banxa",
    description:
      "Celo's ramps directory lists direct CELO support with card and bank transfer options in many countries.",
  },
  {
    href: "https://transak.com",
    label: "Transak",
    description:
      "Celo's ramps directory lists direct CELO support with card and SEPA options, including the United States.",
  },
  {
    href: "https://yellowcard.io",
    label: "Yellow Card",
    description: "A strong option in multiple African markets with bank transfer, mobile money, and CELO support.",
  },
] as const;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function FundingWalletPage() {
  const freeTransactionLimit = getFreeTransactionLimit();

  return (
    <article className="prose max-w-none">
      <h1>Transaction Costs</h1>
      <p className="lead text-base-content/60 text-lg">
        Verified wallets get {freeTransactionLimit} free app transactions. After that, keep a little CELO for gas on
        Celo mainnet.
      </p>

      <h2>How It Works</h2>
      <p>
        After ID verification, Curyo sponsors your first {freeTransactionLimit} app transactions. Once you use them, you
        pay the normal Celo network fee.
      </p>
      <p>Celo fees are low, so you usually only need a small CELO balance. You do not need cREP for gas.</p>

      <h2>What To Send</h2>
      <p>
        Send <strong>CELO on Celo mainnet</strong> to the same wallet address you use in Curyo.
      </p>
      <p>
        If an exchange asks which network to use for withdrawal, choose <strong>Celo</strong>. Do not send on another
        network.
      </p>

      <h2>Where To Get CELO</h2>
      <h3>Exchanges</h3>
      <ul>
        {EXCHANGES.map(option => (
          <li key={option.href}>
            <ExternalLink href={option.href}>{option.label}</ExternalLink>: {option.description}
          </li>
        ))}
      </ul>

      <h3>Fiat On-Ramps</h3>
      <ul>
        {ONRAMPS.map(option => (
          <li key={option.href}>
            <ExternalLink href={option.href}>{option.label}</ExternalLink>: {option.description}
          </li>
        ))}
      </ul>
      <p>
        Availability, fees, limits, and KYC requirements vary by country. Always confirm the withdrawal network is Celo
        mainnet before sending.
      </p>
    </article>
  );
}
