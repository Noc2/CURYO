export interface VoterStreakSnapshot {
  currentDailyStreak: number;
  bestDailyStreak: number;
  totalActiveDays: number;
  lastActiveDate: string | null;
  lastMilestoneDay: number;
}

function toNonNegativeInteger(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

export function normalizeUtcDateKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return /^\d{8}$/.test(normalized) ? normalized : null;
}

function parseUtcDateKey(dateKey: string): Date | null {
  const normalized = normalizeUtcDateKey(dateKey);
  if (!normalized) {
    return null;
  }

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatUtcDateKey(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    (date.getUTCMonth() + 1).toString().padStart(2, "0") +
    date.getUTCDate().toString().padStart(2, "0")
  );
}

export function getPreviousUtcDateKey(dateKey: string): string | null {
  const date = parseUtcDateKey(dateKey);
  if (!date) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return formatUtcDateKey(date);
}

function normalizeActivityDates(activityDates: Array<string | null | undefined>): string[] {
  return [...new Set(activityDates.map(normalizeUtcDateKey).filter((value): value is string => Boolean(value)))].sort();
}

function calculateBestDailyStreak(dateKeys: string[]): number {
  if (dateKeys.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let index = 1; index < dateKeys.length; index += 1) {
    if (getPreviousUtcDateKey(dateKeys[index]) === dateKeys[index - 1]) {
      current += 1;
      best = Math.max(best, current);
      continue;
    }

    current = 1;
  }

  return best;
}

function calculateCurrentDailyStreak(dateKeys: string[], now: Date): number {
  if (dateKeys.length === 0) {
    return 0;
  }

  const todayKey = formatUtcDateKey(now);
  const yesterdayKey = getPreviousUtcDateKey(todayKey);
  const lastActiveDate = dateKeys[dateKeys.length - 1];

  if (lastActiveDate !== todayKey && lastActiveDate !== yesterdayKey) {
    return 0;
  }

  let streak = 1;
  for (let index = dateKeys.length - 1; index > 0; index -= 1) {
    if (getPreviousUtcDateKey(dateKeys[index]) !== dateKeys[index - 1]) {
      break;
    }
    streak += 1;
  }

  return streak;
}

export function projectStoredVoterStreak(
  stored: Partial<VoterStreakSnapshot> | null | undefined,
  now: Date = new Date(),
): VoterStreakSnapshot {
  const lastActiveDate = normalizeUtcDateKey(stored?.lastActiveDate ?? null);
  const todayKey = formatUtcDateKey(now);
  const yesterdayKey = getPreviousUtcDateKey(todayKey);
  const streakIsCurrent = lastActiveDate !== null && (lastActiveDate === todayKey || lastActiveDate === yesterdayKey);

  return {
    currentDailyStreak: streakIsCurrent ? toNonNegativeInteger(stored?.currentDailyStreak) : 0,
    bestDailyStreak: toNonNegativeInteger(stored?.bestDailyStreak),
    totalActiveDays: toNonNegativeInteger(stored?.totalActiveDays),
    lastActiveDate,
    lastMilestoneDay: toNonNegativeInteger(stored?.lastMilestoneDay),
  };
}

export function deriveEffectiveVoterStreak(
  activityDates: Array<string | null | undefined>,
  stored: Partial<VoterStreakSnapshot> | null | undefined,
  now: Date = new Date(),
): VoterStreakSnapshot {
  const storedSnapshot = projectStoredVoterStreak(stored, now);
  const normalizedActivityDates = normalizeActivityDates(activityDates);

  if (normalizedActivityDates.length === 0) {
    return storedSnapshot;
  }

  return {
    currentDailyStreak: calculateCurrentDailyStreak(normalizedActivityDates, now),
    bestDailyStreak: Math.max(calculateBestDailyStreak(normalizedActivityDates), storedSnapshot.bestDailyStreak),
    totalActiveDays: Math.max(normalizedActivityDates.length, storedSnapshot.totalActiveDays),
    lastActiveDate: normalizedActivityDates[normalizedActivityDates.length - 1] ?? null,
    lastMilestoneDay: storedSnapshot.lastMilestoneDay,
  };
}
