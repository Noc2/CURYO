import { contentModerationPolicy } from "@curyo/node-utils/contentModeration";

/**
 * Client-side content moderation filter.
 *
 * Frontend operators are free to customize this blocklist to comply with
 * local regulations and their own platform policies. There is no
 * protocol-level censorship - filtering happens entirely at the UI layer.
 */

function normalizeHostForModeration(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate).hostname.replace(/\.$/, "");
  } catch {
    return null;
  }
}

function findBlockedDomain(url: string): string | null {
  const host = normalizeHostForModeration(url);
  if (!host) return null;

  for (const domain of contentModerationPolicy.blockedDomains) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return domain;
    }
  }

  return null;
}

/**
 * Build a regex that matches any of the given terms as whole words (case-insensitive).
 */
function buildWordBoundaryRegex(terms: string[]): RegExp {
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
}

const textRegex = buildWordBoundaryRegex([...contentModerationPolicy.blockedTextTerms]);

/**
 * Check whether a URL string contains blocked content.
 * Uses simple substring matching because blocked terms inside a URL
 * path / domain are always intentional.
 */
export function containsBlockedUrl(url: string): { blocked: boolean; matchedTerm: string | null } {
  const domainMatch = findBlockedDomain(url);
  if (domainMatch) {
    return { blocked: true, matchedTerm: domainMatch };
  }

  const lower = url.toLowerCase();
  for (const term of contentModerationPolicy.blockedUrlTerms) {
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
