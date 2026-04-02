import { protocolCopy } from "./protocolCopy";

const crepAmountFormatter = new Intl.NumberFormat("en-US");
const crepCompactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const CREP_MAX_SUPPLY = 100_000_000;
export const CREP_MAX_SUPPLY_LABEL = `${crepAmountFormatter.format(CREP_MAX_SUPPLY)} cREP`;

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
      "One-time claims for verified humans (10,000 to 1 cREP per claim, tiered by adoption, serves up to ~41M users)",
    color: "#7E8996",
  },
  {
    label: "Participation Pool",
    amount: 34_000_000,
    purpose: protocolCopy.participationPoolPurpose,
    color: "#F26426",
  },
  {
    label: "Treasury",
    amount: 10_000_000,
    purpose: "Governance-controlled cREP tokens for grants, whistleblower rewards, and protocol development",
    color: "#F5F0EB",
  },
  {
    label: "Consensus Subsidy Reserve",
    amount: 4_000_000,
    purpose: "Pre-funded reserve for unanimous agreement rewards, replenished by 5% of each round's losing stakes",
    color: "#B3341B",
  },
] as const;

const CREP_INITIAL_MINTED_SUPPLY = tokenDistributionEntries.reduce((sum, entry) => sum + entry.amount, 0);
export const CREP_INITIAL_MINTED_SUPPLY_LABEL = `${crepAmountFormatter.format(CREP_INITIAL_MINTED_SUPPLY)} cREP`;
export const CREP_INITIAL_MINTED_SUPPLY_COMPACT_LABEL = crepCompactFormatter.format(CREP_INITIAL_MINTED_SUPPLY);
const FAUCET_POOL_AMOUNT = tokenDistributionEntries[0].amount;
export const FAUCET_POOL_AMOUNT_COMPACT_LABEL = crepCompactFormatter.format(FAUCET_POOL_AMOUNT);

function formatCrepAmount(amount: number): string {
  return `${crepAmountFormatter.format(amount)} cREP`;
}

function formatAllocationPercent(amount: number): string {
  const percent = (amount / CREP_MAX_SUPPLY) * 100;
  if (percent === 0) return "0.0%";
  if (Number.isInteger(percent)) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export const tokenDistributionTableRows = tokenDistributionEntries.map(entry => ({
  ...entry,
  amountLabel: formatCrepAmount(entry.amount),
}));

export const tokenAllocationChartSlices = tokenDistributionEntries.map((entry, index) => ({
  ...entry,
  index,
  amountLabel: formatCrepAmount(entry.amount),
  percentLabel: formatAllocationPercent(entry.amount),
  value: (entry.amount / CREP_MAX_SUPPLY) * 100,
}));

export const tokenDistributionWhitepaperRows = tokenDistributionEntries.map(entry => [
  entry.label,
  formatCrepAmount(entry.amount),
  entry.purpose,
]);
