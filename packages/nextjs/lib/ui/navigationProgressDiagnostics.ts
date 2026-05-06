export const NAVIGATION_PROGRESS_DEBUG_STORAGE_KEY = "curyo:debug-navigation";
export const NAVIGATION_PROGRESS_TIMEOUT_MS = 15_000;

export interface NavigationProgressCandidateInput {
  currentHref: string;
  download?: boolean;
  href: string | null | undefined;
  isModifiedEvent?: boolean;
  nprogressDisabled?: boolean;
  target?: string | null;
}

export interface NavigationProgressCandidate {
  from: string;
  target: string;
  targetHref: string;
}

function cleanNavigationUrl(url: URL) {
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
}

function isSkippableHref(href: string) {
  return (
    href.startsWith("tel:") || href.startsWith("mailto:") || href.startsWith("blob:") || href.startsWith("javascript:")
  );
}

export function buildNavigationProgressCandidate({
  currentHref,
  download = false,
  href,
  isModifiedEvent = false,
  nprogressDisabled = false,
  target,
}: NavigationProgressCandidateInput): NavigationProgressCandidate | null {
  if (!href || download || isModifiedEvent || nprogressDisabled || target === "_blank" || isSkippableHref(href)) {
    return null;
  }

  let currentUrl: URL;
  let targetUrl: URL;
  try {
    currentUrl = new URL(currentHref);
    targetUrl = new URL(href, currentUrl);
  } catch {
    return null;
  }

  if (targetUrl.origin !== currentUrl.origin) {
    return null;
  }

  const from = cleanNavigationUrl(currentUrl);
  const targetCleanUrl = cleanNavigationUrl(targetUrl);
  if (targetCleanUrl === from) {
    return null;
  }

  return {
    from,
    target: targetCleanUrl,
    targetHref: targetUrl.href,
  };
}

export function shouldLogNavigationProgressDebug(storage: Pick<Storage, "getItem"> | undefined) {
  try {
    return storage?.getItem(NAVIGATION_PROGRESS_DEBUG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
