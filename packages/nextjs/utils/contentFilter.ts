/**
 * Client-side content moderation filter.
 *
 * Frontend operators are free to customize this blocklist to comply with
 * local regulations and their own platform policies. There is no
 * protocol-level censorship — filtering happens entirely at the UI layer.
 */

// Terms that are always problematic in URLs (substring match)
const URL_BLOCKED_TERMS = [
  "porn",
  "xxx",
  "xvideos",
  "pornhub",
  "xhamster",
  "redtube",
  "xnxx",
  "youporn",
  "hentai",
  "rule34",
  "nhentai",
  "hanime",
  "brazzers",
  "onlyfans",
  "chaturbate",
  "livejasmin",
  "stripchat",
  "cam4",
  "bongacams",
];

// Terms checked with word-boundary matching in free text (title, description, tags, comments)
const TEXT_BLOCKED_TERMS = ["porn", "pornography", "xxx", "nsfw", "hentai", "rule34", "onlyfans"];

/**
 * Build a regex that matches any of the given terms as whole words (case-insensitive).
 */
function buildWordBoundaryRegex(terms: string[]): RegExp {
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
}

const textRegex = buildWordBoundaryRegex(TEXT_BLOCKED_TERMS);

/**
 * Check whether a URL string contains blocked content.
 * Uses simple substring matching because blocked terms inside a URL
 * path / domain are always intentional.
 */
export function containsBlockedUrl(url: string): { blocked: boolean; matchedTerm: string | null } {
  const lower = url.toLowerCase();
  for (const term of URL_BLOCKED_TERMS) {
    if (lower.includes(term)) {
      return { blocked: true, matchedTerm: term };
    }
  }
  return { blocked: false, matchedTerm: null };
}

/**
 * Check whether free-form text (title, description, comment, tag) contains
 * blocked content. Uses word-boundary matching to reduce false positives
 * (e.g. "Essex" won't match "sex").
 */
export function containsBlockedText(text: string): { blocked: boolean; matchedTerm: string | null } {
  const match = text.match(textRegex);
  if (match) {
    return { blocked: true, matchedTerm: match[1] };
  }
  return { blocked: false, matchedTerm: null };
}

/**
 * Check whether any field of a content item contains blocked content.
 * Suitable for filtering items out of a display feed.
 */
export function isContentItemBlocked(item: {
  url: string;
  title: string;
  description: string;
  tags: string[];
}): boolean {
  if (containsBlockedUrl(item.url).blocked) return true;
  if (containsBlockedText(item.title).blocked) return true;
  if (containsBlockedText(item.description).blocked) return true;
  if (item.tags.some(tag => containsBlockedText(tag).blocked)) return true;
  return false;
}
