import { protocolCopy } from "./protocolCopy";

const hrepAmountFormatter = new Intl.NumberFormat("en-US");
const hrepCompactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const HREP_MAX_SUPPLY = 100_000_000;
export const HREP_MAX_SUPPLY_LABEL = `${hrepAmountFormatter.format(HREP_MAX_SUPPLY)} HREP`;

type TokenDistributionEntry = {
  label: string;
  amount: number;
  purpose: string;
  color: string;
};

const tokenDistributionEntries: readonly TokenDistributionEntry[] = [
  {
    label: "Faucet Pool",
    amount: 52_000_000,
    purpose:
      "One-time claims for verified humans (10,000 to 1 HREP per claim, tiered by adoption, serves up to ~41M users)",
    color: "#7E8996",
  },
  {
    label: "Bootstrap Pool",
    amount: 12_000_000,
    purpose: protocolCopy.participationPoolPurpose,
    color: "#F26426",
  },
  {
    label: "Treasury",
    amount: 32_000_000,
    purpose:
      "Governance-controlled HREP tokens for ecosystem grants, partner activation, whistleblower rewards, and protocol development",
    color: "#F5F0EB",
  },
  {
    label: "Consensus Subsidy Reserve",
    amount: 4_000_000,
    purpose: "Pre-funded reserve for unanimous agreement rewards, replenished by 5% of each round's losing stakes",
    color: "#B3341B",
  },
] as const;

const HREP_INITIAL_MINTED_SUPPLY = tokenDistributionEntries.reduce((sum, entry) => sum + entry.amount, 0);
export const HREP_INITIAL_MINTED_SUPPLY_COMPACT_LABEL = hrepCompactFormatter.format(HREP_INITIAL_MINTED_SUPPLY);
const FAUCET_POOL_AMOUNT = tokenDistributionEntries[0].amount;
export const FAUCET_POOL_AMOUNT_COMPACT_LABEL = hrepCompactFormatter.format(FAUCET_POOL_AMOUNT);

function formatHrepAmount(amount: number): string {
  return `${hrepAmountFormatter.format(amount)} HREP`;
}

function formatAllocationPercent(amount: number): string {
  const percent = (amount / HREP_MAX_SUPPLY) * 100;
  if (percent === 0) return "0.0%";
  if (Number.isInteger(percent)) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export const tokenDistributionTableRows = tokenDistributionEntries.map(entry => ({
  ...entry,
  amountLabel: formatHrepAmount(entry.amount),
}));

export const tokenAllocationChartSlices = tokenDistributionEntries.map((entry, index) => ({
  ...entry,
  index,
  amountLabel: formatHrepAmount(entry.amount),
  percentLabel: formatAllocationPercent(entry.amount),
  value: (entry.amount / HREP_MAX_SUPPLY) * 100,
}));

export const tokenDistributionWhitepaperRows = tokenDistributionEntries.map(entry => [
  entry.label,
  formatHrepAmount(entry.amount),
  entry.purpose,
]);
