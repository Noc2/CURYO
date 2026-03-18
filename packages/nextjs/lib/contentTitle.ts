export const MAX_CONTENT_TITLE_LENGTH = 72;

export function truncateContentTitle(title: string, maxLength = MAX_CONTENT_TITLE_LENGTH) {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, Math.max(0, maxLength - 3))}...`;
}
