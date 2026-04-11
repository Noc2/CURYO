const HUGGING_FACE_IMAGE_HOSTS = new Set([
  "cdn-avatars.huggingface.co",
  "cdn-thumbnails.huggingface.co",
  "huggingface.co",
]);
const HUGGING_FACE_AVATAR_HOST = "cdn-avatars.huggingface.co";

const URL_TAIL_MARKER_PATTERN = /(?:&(?:amp;)?quot;|&#(?:x22|34);|\\u0022|["'<>\s])/i;

export function getSafeHuggingFaceImageUrl(value?: string | null): string | null {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) return null;

  const markerMatch = rawValue.match(URL_TAIL_MARKER_PATTERN);
  const candidate = (markerMatch?.index === undefined ? rawValue : rawValue.slice(0, markerMatch.index)).trim();
  if (!candidate) return null;

  const normalizedCandidate = candidate.startsWith("//") ? `https:${candidate}` : candidate;

  let parsed: URL;
  try {
    parsed = new URL(normalizedCandidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || !HUGGING_FACE_IMAGE_HOSTS.has(parsed.hostname)) {
    return null;
  }

  return parsed.toString();
}

export function isHuggingFaceAvatarUrl(value?: string | null): boolean {
  const safeUrl = getSafeHuggingFaceImageUrl(value);
  if (!safeUrl) return false;

  return new URL(safeUrl).hostname === HUGGING_FACE_AVATAR_HOST;
}
