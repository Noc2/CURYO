export interface ReputationAvatarStats {
  totalSettledVotes: number;
  totalWins: number;
  totalLosses: number;
  currentStreak: number;
  bestWinStreak: number;
  winRate: number;
}

export interface ReputationAvatarStreak {
  currentDailyStreak: number;
  bestDailyStreak: number;
  totalActiveDays: number;
  lastActiveDate: string | null;
  lastMilestoneDay: number;
}

export interface ReputationAvatarVoterId {
  tokenId: string;
  mintedAt: string;
}

export interface ReputationAvatarCategory {
  categoryId: string;
  categoryName: string | null;
  settledVotes90d: number;
  wins90d: number;
  losses90d: number;
  stakeWon90d: string;
  stakeLost90d: string;
  totalStake90d: string;
  winRate90d: number;
  lastSettledAt: string;
}

export interface ReputationAvatarPayload {
  address: string;
  balance: string;
  avatarAccentHex: string | null;
  voterId: ReputationAvatarVoterId | null;
  stats: ReputationAvatarStats | null;
  streak: ReputationAvatarStreak | null;
  categories90d: ReputationAvatarCategory[];
}
