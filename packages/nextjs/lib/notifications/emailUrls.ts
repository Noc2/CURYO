import { resolveAppUrl } from "../env/server";

interface ResolveNotificationEmailAppUrlOptions {
  requestOrigin?: string | null;
  fallbackAppUrl?: string | null;
  production?: boolean;
}

export function resolveNotificationEmailAppUrl(options: ResolveNotificationEmailAppUrlOptions) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const requestAppUrl = resolveAppUrl(options.requestOrigin ?? undefined, production);
  if (requestAppUrl) {
    return requestAppUrl;
  }

  return resolveAppUrl(options.fallbackAppUrl ?? undefined, production);
}
