import { DEFAULT_ROUND_CONFIG } from "@curyo/contracts/protocol";

export function canRoundSettleSoon(voteCount: number, minVoters = DEFAULT_ROUND_CONFIG.minVoters) {
  return voteCount >= minVoters;
}
