export const TRUST_VERTICAL_TAG_PREFIX = "vertical:" as const;

export const TRUST_VERTICALS = [
  {
    slug: "products",
    label: "Products",
    description: "Products, services, shopping pages, and buyer trust signals.",
    prompt: "Would a real buyer or user be glad they chose this?",
  },
  {
    slug: "investment",
    label: "Investment",
    description: "Public market, crypto, and investment-promotion claim credibility.",
    prompt: "Is this investment claim credible and responsibly supported?",
  },
  {
    slug: "health",
    label: "Health",
    description: "Health, supplement, wellness, and safety-related claims.",
    prompt: "Is this health claim evidence-backed, safe, and not misleading?",
  },
  {
    slug: "software",
    label: "Software",
    description: "Developer tools, repositories, packages, models, and supply-chain trust.",
    prompt: "Would you trust this software in a real project?",
  },
  {
    slug: "entertainment",
    label: "Entertainment",
    description: "Media, games, books, streams, cards, podcasts, and cultural content.",
    prompt: "Is this worth people's attention?",
  },
  {
    slug: "people",
    label: "People",
    description: "Public figures and public profiles.",
    prompt: "Is this public profile represented accurately and fairly?",
  },
] as const;

export type TrustVertical = (typeof TRUST_VERTICALS)[number];
export type TrustVerticalSlug = TrustVertical["slug"];

export const DEFAULT_TRUST_VERTICAL_SLUG: TrustVerticalSlug = "entertainment";

const TRUST_VERTICAL_BY_SLUG = new Map<TrustVerticalSlug, TrustVertical>(
  TRUST_VERTICALS.map(vertical => [vertical.slug, vertical]),
);

const TRUST_VERTICAL_SLUGS = new Set<string>(TRUST_VERTICALS.map(vertical => vertical.slug));

const LEGACY_CATEGORY_ID_TO_VERTICAL: Record<string, TrustVerticalSlug> = {
  "1": "entertainment",
  "2": "entertainment",
  "3": "entertainment",
  "4": "entertainment",
  "5": "people",
  "6": "entertainment",
  "7": "entertainment",
  "8": "software",
  "9": "investment",
  "10": "entertainment",
  "11": "software",
  "12": "entertainment",
  "13": "software",
  "14": "software",
};

const LEGACY_CATEGORY_NAME_TO_VERTICAL: Record<string, TrustVerticalSlug> = {
  "ai": "software",
  "books": "entertainment",
  "crypto tokens": "investment",
  "games": "entertainment",
  "github repos": "software",
  "magic: the gathering": "entertainment",
  "movies": "entertainment",
  "npm packages": "software",
  "people": "people",
  "pypi packages": "software",
  "spotify podcasts": "entertainment",
  "twitch": "entertainment",
  "tweets": "entertainment",
  "youtube": "entertainment",
};

const LEGACY_DOMAIN_TO_VERTICAL: Record<string, TrustVerticalSlug> = {
  "coingecko.com": "investment",
  "en.wikipedia.org": "people",
  "github.com": "software",
  "huggingface.co": "software",
  "m.youtube.com": "entertainment",
  "npmjs.com": "software",
  "open.spotify.com": "entertainment",
  "openlibrary.org": "entertainment",
  "pypi.org": "software",
  "rawg.io": "entertainment",
  "scryfall.com": "entertainment",
  "themoviedb.org": "entertainment",
  "twitch.tv": "entertainment",
  "twitter.com": "entertainment",
  "x.com": "entertainment",
  "youtube.com": "entertainment",
  "youtu.be": "entertainment",
};

const LEGACY_CATEGORY_IDS_BY_VERTICAL = TRUST_VERTICALS.reduce(
  (acc, vertical) => {
    acc[vertical.slug] = Object.entries(LEGACY_CATEGORY_ID_TO_VERTICAL)
      .filter(([, slug]) => slug === vertical.slug)
      .map(([categoryId]) => categoryId);
    return acc;
  },
  {} as Record<TrustVerticalSlug, string[]>,
);

const LEGACY_DOMAINS_BY_VERTICAL = TRUST_VERTICALS.reduce(
  (acc, vertical) => {
    acc[vertical.slug] = Object.entries(LEGACY_DOMAIN_TO_VERTICAL)
      .filter(([, slug]) => slug === vertical.slug)
      .map(([domain]) => domain);
    return acc;
  },
  {} as Record<TrustVerticalSlug, string[]>,
);

export interface ResolveTrustVerticalInput {
  categoryId?: string | number | bigint | null;
  categoryName?: string | null;
  domain?: string | null;
  tags?: readonly string[] | string | null;
  url?: string | null;
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCategoryId(categoryId: ResolveTrustVerticalInput["categoryId"]) {
  if (categoryId === null || categoryId === undefined) return null;
  try {
    return BigInt(categoryId).toString();
  } catch {
    return null;
  }
}

function normalizeDomain(domain: string) {
  const trimmed = normalizeLookupValue(domain);
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split(/[/?#:]/, 1)[0]?.replace(/^www\./, "") ?? "";
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

function extractDomainFromUrl(url: string) {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return normalizeDomain(url);
  }
}

export function isTrustVerticalSlug(value: string): value is TrustVerticalSlug {
  return TRUST_VERTICAL_SLUGS.has(value);
}

export function getTrustVertical(slug: TrustVerticalSlug): TrustVertical {
  return TRUST_VERTICAL_BY_SLUG.get(slug) ?? TRUST_VERTICAL_BY_SLUG.get(DEFAULT_TRUST_VERTICAL_SLUG)!;
}

export function buildTrustVerticalTag(slug: TrustVerticalSlug) {
  return `${TRUST_VERTICAL_TAG_PREFIX}${slug}`;
}

export function parseTrustVerticalTag(tag: string): TrustVerticalSlug | null {
  const normalized = normalizeLookupValue(tag);
  if (!normalized.startsWith(TRUST_VERTICAL_TAG_PREFIX)) return null;
  const slug = normalized.slice(TRUST_VERTICAL_TAG_PREFIX.length);
  return isTrustVerticalSlug(slug) ? slug : null;
}

function isReservedTrustVerticalTag(tag: string) {
  return normalizeLookupValue(tag).startsWith(TRUST_VERTICAL_TAG_PREFIX);
}

export function parseTagsValue(tags: readonly string[] | string | null | undefined): string[] {
  if (!tags) return [];

  if (typeof tags !== "string") {
    return tags.map(tag => tag.trim()).filter(Boolean);
  }

  return tags
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
}

export function extractTrustVerticalFromTags(tags: readonly string[] | string | null | undefined) {
  for (const tag of parseTagsValue(tags)) {
    const slug = parseTrustVerticalTag(tag);
    if (slug) return slug;
  }

  return null;
}

export function stripTrustVerticalTags(tags: readonly string[] | string | null | undefined): string[] {
  return parseTagsValue(tags).filter(tag => !isReservedTrustVerticalTag(tag));
}

export function mergeTrustVerticalTag(tags: readonly string[] | string | null | undefined, slug: TrustVerticalSlug) {
  return [...stripTrustVerticalTags(tags), buildTrustVerticalTag(slug)];
}

export function resolveTrustVerticalSlug(input: ResolveTrustVerticalInput): TrustVerticalSlug {
  const tagVertical = extractTrustVerticalFromTags(input.tags);
  if (tagVertical) return tagVertical;

  const categoryId = normalizeCategoryId(input.categoryId);
  if (categoryId && LEGACY_CATEGORY_ID_TO_VERTICAL[categoryId]) {
    return LEGACY_CATEGORY_ID_TO_VERTICAL[categoryId];
  }

  const categoryName = input.categoryName ? normalizeLookupValue(input.categoryName) : "";
  if (categoryName && LEGACY_CATEGORY_NAME_TO_VERTICAL[categoryName]) {
    return LEGACY_CATEGORY_NAME_TO_VERTICAL[categoryName];
  }

  const domain = input.domain ? normalizeDomain(input.domain) : input.url ? extractDomainFromUrl(input.url) : "";
  if (domain && LEGACY_DOMAIN_TO_VERTICAL[domain]) {
    return LEGACY_DOMAIN_TO_VERTICAL[domain];
  }

  return DEFAULT_TRUST_VERTICAL_SLUG;
}

export function getTrustVerticalLabel(slug: TrustVerticalSlug) {
  return getTrustVertical(slug).label;
}

export function getLegacyCategoryIdsForTrustVertical(slug: TrustVerticalSlug): readonly string[] {
  return LEGACY_CATEGORY_IDS_BY_VERTICAL[slug] ?? [];
}

export function getLegacyDomainsForTrustVertical(slug: TrustVerticalSlug): readonly string[] {
  return LEGACY_DOMAINS_BY_VERTICAL[slug] ?? [];
}
