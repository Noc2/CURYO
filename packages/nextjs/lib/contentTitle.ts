export const MAX_QUESTION_LENGTH = 120;
export const MAX_CONTENT_TITLE_LENGTH = MAX_QUESTION_LENGTH;

export function truncateContentTitle(title: string, maxLength = MAX_CONTENT_TITLE_LENGTH) {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, Math.max(0, maxLength - 3))}...`;
}
