function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [];
  if (values.length > 0) return values;

  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

export function getNamedSetCookie(headers: Headers, cookieName: string): string | undefined {
  const cookiePattern = new RegExp(`(?:^|,\\s*)${escapeRegExp(cookieName)}=([^;]+)`);

  for (const value of getSetCookieValues(headers)) {
    const match = value.match(cookiePattern);
    if (match?.[1]) {
      return `${cookieName}=${match[1]}`;
    }
  }

  return undefined;
}
