import { VOTE_COOLDOWN_SECONDS } from "~~/lib/vote/cooldown";

export const SELF_VOTE_ERROR_SELECTOR = "0x2f4015a5";

export function normalizeRoundVoteError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("free transactions used up")) {
    return "Free transactions used up. Add CELO to continue.";
  }
  if (message.includes("CooldownActive")) {
    return `You already voted on this content within the last ${Math.round(VOTE_COOLDOWN_SECONDS / 3600)} hours. Try again after the cooldown ends.`;
  }
  if (message.includes("AlreadyCommitted")) {
    return "You already have a vote committed on this content in the current round.";
  }
  if (message.includes("MaxVotersReached")) {
    return "This round is full. Wait for the next round to vote again.";
  }
  if (message.includes("SelfVote") || normalizedMessage.includes(SELF_VOTE_ERROR_SELECTOR)) {
    return "You cannot vote on your own content.";
  }
  if (message.includes("ContentNotActive")) {
    return "This content is no longer active for voting.";
  }
  if (message.includes("TargetRoundOutOfWindow") || message.includes("0xe56a7aca")) {
    return "The voting window moved while your vote was being prepared. Please try again.";
  }
  if (message.includes("RoundNotAccepting") || message.includes("RoundNotOpen")) {
    return "This round is not accepting votes right now.";
  }
  if (message.includes("VoterIdRequired")) {
    return "Voter ID required. Please verify your identity to vote.";
  }
  return message;
}
