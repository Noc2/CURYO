export function buildWatchContentMessage(contentId: string): string {
  return `Watch Curyo content #${contentId}`;
}

export function buildUnwatchContentMessage(contentId: string): string {
  return `Unwatch Curyo content #${contentId}`;
}

export function buildFollowProfileMessage(walletAddress: string): string {
  return `Follow Curyo user ${walletAddress.toLowerCase()}`;
}

export function buildUnfollowProfileMessage(walletAddress: string): string {
  return `Unfollow Curyo user ${walletAddress.toLowerCase()}`;
}
