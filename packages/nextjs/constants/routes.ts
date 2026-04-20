export const ASK_ROUTE = "/ask";

export const RATE_ROUTE = "/rate";

export const GOVERNANCE_ROUTE = "/governance";

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
