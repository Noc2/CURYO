import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import { RoundVotingEngineAbi } from "@curyo/contracts/abis";

/** Extract the human-readable revert reason from a viem error. */
export function getRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revertError = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.shortMessage;
    }
    const cause = err.walk() as any;
    if (cause?.data && typeof cause.data === "string" && cause.data.startsWith("0x")) {
      try {
        const decoded = decodeErrorResult({
          abi: RoundVotingEngineAbi,
          data: cause.data as `0x${string}`,
        });
        return decoded.errorName;
      } catch {
        // Could not decode — fall through
      }
    }
    return err.shortMessage;
  }
  return (err as any)?.shortMessage || (err as any)?.message || String(err);
}

/** Returns true if the error message indicates an expected/benign revert. */
export function isExpectedRevert(msg: string): boolean {
  const benign = [
    "RoundNotOpen",
    "EpochNotEnded",
    "NotEnoughVotes",
    "UnrevealedPastEpochVotes",
    "AlreadyRevealed",
    "AlreadyCancelled",
    "ThresholdReached",
    "RevealGraceActive",
    "NothingProcessed",
    "IndexOutOfBounds",
    "ActiveRoundStillOpen",
  ];
  const lower = msg.toLowerCase();
  return benign.some(phrase => lower.includes(phrase.toLowerCase()));
}
