const LEGACY_WIKI_CATEGORY_ID = "5";
const LEGACY_WIKI_CATEGORY_NAME = "people";
const LEGACY_WIKI_DOMAIN = "en.wikipedia.org";
const LEGACY_WIKI_DISPLAY_NAME = "Wiki";

type CategoryDisplayInput = {
  id?: bigint | number | string | null;
  categoryId?: bigint | number | string | null;
  name?: string | null;
  categoryName?: string | null;
  domain?: string | null;
};

function normalizeCategoryId(value: CategoryDisplayInput["id"]) {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value).toString();
  } catch {
    return null;
  }
}

function normalizeDomain(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split(/[/?#:]/, 1)[0]?.replace(/^www\./, "") ?? "";
  return host.replace(/\.+$/, "");
}

export function getCategoryDisplayName(category: CategoryDisplayInput): string | null {
  const name = category.name ?? category.categoryName ?? null;
  if (!name) return null;

  const normalizedName = name.trim().toLowerCase();
  const normalizedDomain = normalizeDomain(category.domain);
  const categoryId = normalizeCategoryId(category.id ?? category.categoryId);
  const isLegacyWikiCategory =
    normalizedName === LEGACY_WIKI_CATEGORY_NAME &&
    (normalizedDomain === LEGACY_WIKI_DOMAIN || (!normalizedDomain && categoryId === LEGACY_WIKI_CATEGORY_ID));

  return isLegacyWikiCategory ? LEGACY_WIKI_DISPLAY_NAME : name;
}
