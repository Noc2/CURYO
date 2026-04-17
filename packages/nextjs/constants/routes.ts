export const ASK_ROUTE = "/ask";
export const LEGACY_SUBMIT_ROUTE = "/submit";

export const RATE_ROUTE = "/rate";
export const LEGACY_DISCOVER_ROUTE = "/discover";
export const LEGACY_VOTE_ROUTE = "/vote";
export const VOTE_REVEAL_ROUTE = "/vote/reveal";

export const GOVERNANCE_ROUTE = "/governance";
export const LEGACY_GOVERNANCE_OPERATOR_HASH = "operator";

export const SETTINGS_ROUTE = "/settings";
export const SETTINGS_FRONTEND_HASH = "frontend";
export const SETTINGS_FRONTEND_ROUTE = `${SETTINGS_ROUTE}#${SETTINGS_FRONTEND_HASH}`;

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams | null | undefined;

export function buildRouteWithSearchParams(route: string, searchParams?: SearchParamsLike) {
  const params = new URLSearchParams();

  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });
  } else if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, item));
      } else if (value !== undefined) {
        params.set(key, value);
      }
    }
  }

  const query = params.toString();
  return query ? `${route}?${query}` : route;
}

export function buildRateContentHref(contentId: string | number | bigint) {
  return buildRouteWithSearchParams(RATE_ROUTE, { content: contentId.toString() });
}
