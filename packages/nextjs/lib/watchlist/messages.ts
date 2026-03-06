export function buildWatchContentMessage(contentId: string): string {
  return `Watch Curyo content #${contentId}`;
}

export function buildUnwatchContentMessage(contentId: string): string {
  return `Unwatch Curyo content #${contentId}`;
}
