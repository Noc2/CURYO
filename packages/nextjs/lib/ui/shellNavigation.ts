type ShellNavClickState = {
  currentHref: string;
  isActive: boolean;
  isModifiedEvent?: boolean;
  targetHref: string;
};

export function shouldSuppressShellNavClick({
  currentHref,
  isActive,
  isModifiedEvent = false,
  targetHref,
}: ShellNavClickState) {
  if (!isActive || isModifiedEvent) {
    return false;
  }

  try {
    const currentUrl = new URL(currentHref);
    const targetUrl = new URL(targetHref, currentUrl);
    return currentUrl.href === targetUrl.href;
  } catch {
    return false;
  }
}
