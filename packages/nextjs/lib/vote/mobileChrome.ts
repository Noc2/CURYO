export const VOTE_MOBILE_CHROME_REVEAL_EVENT = "curyo:vote-mobile-chrome-reveal";

export function requestVoteMobileChromeReveal() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(VOTE_MOBILE_CHROME_REVEAL_EVENT));
}
