import { MAX_CONTENT_DESCRIPTION_LENGTH } from "~~/lib/contentDescription";
import { MAX_QUESTION_LENGTH } from "~~/lib/contentTitle";
import { getQuestionReferenceValidationError } from "~~/lib/questionReferences";
import { containsBlockedText } from "~~/utils/contentFilter";

export function getContentTitleValidationError(value: string): string | null {
  if (value.length > MAX_QUESTION_LENGTH) {
    return `Question must be ${MAX_QUESTION_LENGTH} characters or fewer`;
  }

  const check = containsBlockedText(value);
  return check.blocked ? "Your question contains prohibited content" : null;
}

export function getContentDescriptionValidationError(value: string): string | null {
  if (value.length > MAX_CONTENT_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_CONTENT_DESCRIPTION_LENGTH} characters or fewer`;
  }

  const check = containsBlockedText(value);
  if (check.blocked) {
    return "Your description contains prohibited content";
  }

  return getQuestionReferenceValidationError(value);
}

export function getContentTagValidationError(value: string): string | null {
  const check = containsBlockedText(value.trim());
  return check.blocked ? "This category contains prohibited content" : null;
}

export function findBlockedContentTags(tags: string[]): string[] {
  return tags.map(tag => tag.trim()).filter(tag => getContentTagValidationError(tag) !== null);
}
