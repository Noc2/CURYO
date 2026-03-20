import type { NextPage } from "next";

const FundingWalletPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Funding Your Wallet</h1>
      <p className="lead text-base-content/60 text-lg">Verified wallets get a small number of free app transactions.</p>

      <h2>Free Transactions</h2>
      <p>
        After ID verification, Curyo sponsors a limited number of app transactions for your wallet. When that quota runs
        out, you need a little CELO for gas.
      </p>

      <h2>What To Send</h2>
      <p>
        Send <strong>CELO</strong> to the same wallet address you use in Curyo. You do not need to send cREP for gas.
      </p>

      <h2>Sepolia</h2>
      <p>On Celo Sepolia, fund the wallet from a testnet faucet or another Sepolia wallet.</p>

      <h2>Mainnet</h2>
      <p>On Celo mainnet, send a small amount of CELO from another wallet or exchange, then retry your action.</p>
    </article>
  );
};

export default FundingWalletPage;
