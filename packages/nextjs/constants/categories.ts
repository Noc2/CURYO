export const CONTENT_CATEGORIES = [
  "Education",
  "Entertainment",
  "Technology",
  "Science",
  "Music",
  "Art",
  "Gaming",
  "News",
  "Sports",
  "Lifestyle",
  "Finance",
  "Health",
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

/** Split a comma-separated tags string into an array. */
export function parseTags(tagsString: string): string[] {
  if (!tagsString) return [];
  return tagsString
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

/** Join an array of tags into a comma-separated string for on-chain storage. */
export function serializeTags(tags: string[]): string {
  return tags.join(",");
}
