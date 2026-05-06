import { GOVERNANCE_ROUTE, RATE_ROUTE } from "../../constants/routes";

export const HUMAN_SIGN_IN_LABEL = "Sign In as Human";
export const HUMAN_SIGN_IN_FAUCET_ROUTE = `${GOVERNANCE_ROUTE}#faucet`;
export const HUMAN_SIGN_IN_DISCOVER_ROUTE = RATE_ROUTE;

export function getHumanSignInRoute(hasVoterId: boolean) {
  return hasVoterId ? HUMAN_SIGN_IN_DISCOVER_ROUTE : HUMAN_SIGN_IN_FAUCET_ROUTE;
}
