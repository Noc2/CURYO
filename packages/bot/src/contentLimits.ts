export const MAX_QUESTION_LENGTH = 120;
export const MAX_CONTENT_TITLE_LENGTH = MAX_QUESTION_LENGTH;
export const MAX_CONTENT_DESCRIPTION_LENGTH = 280;

export function truncateContentTitle(title: string, maxLength = MAX_CONTENT_TITLE_LENGTH) {
  if (title.length <= maxLength) {
    return title;
  }

  return `${title.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function truncateContentDescription(description: string, maxLength = MAX_CONTENT_DESCRIPTION_LENGTH) {
  return description.slice(0, maxLength);
}
