interface VoteLocationUpdate {
  contentId?: bigint | null;
  categoryHash?: string | null;
}

export function buildVoteLocation(currentUrl: string, update: VoteLocationUpdate) {
  const url = new URL(currentUrl);

  if (update.contentId !== undefined) {
    if (update.contentId === null) {
      url.searchParams.delete("content");
    } else {
      url.searchParams.set("content", update.contentId.toString());
    }
  }

  if (update.categoryHash !== undefined) {
    url.hash = update.categoryHash ? `#${update.categoryHash}` : "";
  }

  return url.toString();
}
