import { VOTE_SHARE_RATING_VERSION_PARAM } from "../social/contentShare";

interface VoteLocationUpdate {
  contentId?: bigint | null;
  filterHash?: string | null;
}

interface VoteSearchParamsLike {
  entries(): IterableIterator<[string, string]>;
}

function normalizeSearchParams(searchParams: URLSearchParams) {
  const normalizedParams = new URLSearchParams();
  const entries = Array.from(searchParams.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
  );

  for (const [key, value] of entries) {
    normalizedParams.append(key, value);
  }

  return normalizedParams.toString();
}

export function buildVoteLocation(currentUrl: string, update: VoteLocationUpdate) {
  const url = new URL(currentUrl);

  if (update.contentId !== undefined) {
    url.searchParams.delete(VOTE_SHARE_RATING_VERSION_PARAM);

    if (update.contentId === null) {
      url.searchParams.delete("content");
    } else {
      url.searchParams.set("content", update.contentId.toString());
    }
  }

  if (update.filterHash !== undefined) {
    url.hash = update.filterHash ? `#${update.filterHash}` : "";
  }

  return url.toString();
}

export function buildVoteContentPinKey(pathname: string, searchParams: VoteSearchParamsLike) {
  const params = new URLSearchParams(Array.from(searchParams.entries()));
  if (!params.has("content")) return null;
  params.delete(VOTE_SHARE_RATING_VERSION_PARAM);

  const query = normalizeSearchParams(params);
  return query ? `${pathname}?${query}` : pathname;
}

export function buildVoteContentPinKeyFromUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  return buildVoteContentPinKey(url.pathname, url.searchParams);
}
