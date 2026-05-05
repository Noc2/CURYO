export type BountyWindowPreset = "3h" | "6h" | "24h" | "3d" | "7d" | "custom";
export type BountyWindowUnit = "hours" | "days";

export const DEFAULT_BOUNTY_WINDOW_PRESET: BountyWindowPreset = "24h";
export const DEFAULT_CUSTOM_BOUNTY_WINDOW_AMOUNT = "3";
export const DEFAULT_CUSTOM_BOUNTY_WINDOW_UNIT: BountyWindowUnit = "days";

export const BOUNTY_WINDOW_PRESETS: Array<{
  id: Exclude<BountyWindowPreset, "custom">;
  label: string;
  seconds: number;
}> = [
  { id: "3h", label: "3h", seconds: 3 * 60 * 60 },
  { id: "6h", label: "6h", seconds: 6 * 60 * 60 },
  { id: "24h", label: "24h", seconds: 24 * 60 * 60 },
  { id: "3d", label: "3d", seconds: 3 * 24 * 60 * 60 },
  { id: "7d", label: "7d", seconds: 7 * 24 * 60 * 60 },
];

export function parseBountyWindowAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed);
}

export function getBountyWindowSeconds(
  preset: BountyWindowPreset,
  customAmount: string,
  customUnit: BountyWindowUnit,
): number | null {
  if (preset !== "custom") {
    return BOUNTY_WINDOW_PRESETS.find(option => option.id === preset)?.seconds ?? null;
  }

  const amount = parseBountyWindowAmount(customAmount);
  if (amount < 1) return null;
  return amount * (customUnit === "hours" ? 60 * 60 : 24 * 60 * 60);
}

export function getBountyClosesAt(
  preset: BountyWindowPreset,
  customAmount: string,
  customUnit: BountyWindowUnit,
  nowSeconds = Math.floor(Date.now() / 1000),
): bigint {
  const windowSeconds = getBountyWindowSeconds(preset, customAmount, customUnit);
  return windowSeconds === null ? 0n : BigInt(nowSeconds + windowSeconds);
}

export function resolveBountyReferenceNowSeconds(
  latestBlockTimestamp: bigint | number | null | undefined,
  fallbackNowSeconds = Math.floor(Date.now() / 1000),
): number {
  if (typeof latestBlockTimestamp === "bigint") {
    const normalized = Number(latestBlockTimestamp);
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  if (typeof latestBlockTimestamp === "number" && Number.isFinite(latestBlockTimestamp)) {
    return Math.floor(latestBlockTimestamp);
  }

  return fallbackNowSeconds;
}

export function formatBountyWindowDuration(seconds: number | null): string {
  if (seconds === null) return "Custom";

  const daySeconds = 24 * 60 * 60;
  if (seconds >= daySeconds && seconds % daySeconds === 0) {
    const days = seconds / daySeconds;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  const hourSeconds = 60 * 60;
  if (seconds >= hourSeconds && seconds % hourSeconds === 0) {
    const hours = seconds / hourSeconds;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
