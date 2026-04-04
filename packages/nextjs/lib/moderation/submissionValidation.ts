import { MAX_CONTENT_DESCRIPTION_LENGTH } from "~~/lib/contentDescription";
import { MAX_CONTENT_TITLE_LENGTH } from "~~/lib/contentTitle";
import { containsBlockedText, containsBlockedUrl } from "~~/utils/contentFilter";

export function getContentTitleValidationError(value: string): string | null {
  if (value.length > MAX_CONTENT_TITLE_LENGTH) {
    return `Title must be ${MAX_CONTENT_TITLE_LENGTH} characters or fewer`;
  }

  const check = containsBlockedText(value);
  return check.blocked ? "Your title contains prohibited content" : null;
}

export function getContentDescriptionValidationError(value: string): string | null {
  if (value.length > MAX_CONTENT_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_CONTENT_DESCRIPTION_LENGTH} characters or fewer`;
  }

  const check = containsBlockedText(value);
  return check.blocked ? "Your description contains prohibited content" : null;
}

export function getContentTagValidationError(value: string): string | null {
  const check = containsBlockedText(value.trim());
  return check.blocked ? "This category contains prohibited content" : null;
}

export function findBlockedContentTags(tags: string[]): string[] {
  return tags.map(tag => tag.trim()).filter(tag => getContentTagValidationError(tag) !== null);
}

export function getCategoryNameValidationError(value: string): string | null {
  const check = containsBlockedText(value.trim());
  return check.blocked ? "Platform name contains prohibited content" : null;
}

export function getCategoryDomainValidationError(value: string): string | null {
  const check = containsBlockedUrl(value.trim());
  return check.blocked ? "This domain contains prohibited content" : null;
}

export function getCategorySubcategoryValidationError(value: string): string | null {
  const check = containsBlockedText(value.trim());
  return check.blocked ? "This category contains prohibited content" : null;
}

export function findBlockedCategorySubcategories(subcategories: string[]): string[] {
  return subcategories
    .map(subcategory => subcategory.trim())
    .filter(subcategory => {
      return getCategorySubcategoryValidationError(subcategory) !== null;
    });
}
