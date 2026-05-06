export function replaceUrlPreservingHistoryState(url: string | URL) {
  if (typeof window === "undefined") {
    return;
  }

  // Next stores App Router metadata in history.state; tab/hash sync must not replace it with null.
  window.history.replaceState(window.history.state, "", url);
}
