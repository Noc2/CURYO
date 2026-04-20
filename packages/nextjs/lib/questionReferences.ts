export const MAX_QUESTION_REFERENCE_COUNT = 3;

const QUESTION_REFERENCE_PATTERN = /\[\[\s*question\s*:\s*([0-9]+)\s*(?:\|\s*([^\]\r\n]*?)\s*)?\]\]/gi;
const POSITIVE_INTEGER_PATTERN = /^[0-9]+$/;

export type QuestionReference = {
  contentId: string;
  label?: string;
  raw: string;
};

export type QuestionReferenceSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "question-reference";
      contentId: string;
      label?: string;
      raw: string;
    };

export type ParsedQuestionReferences = {
  segments: QuestionReferenceSegment[];
  references: QuestionReference[];
};

function normalizeQuestionReferenceId(value: string): string | null {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) return null;

  const normalized = BigInt(value).toString();
  return normalized === "0" ? null : normalized;
}

export function parseQuestionReferences(description: string): ParsedQuestionReferences {
  const segments: QuestionReferenceSegment[] = [];
  const referencesById = new Map<string, QuestionReference>();
  let lastIndex = 0;

  for (const match of description.matchAll(QUESTION_REFERENCE_PATTERN)) {
    const raw = match[0];
    const matchIndex = match.index ?? 0;
    const contentId = normalizeQuestionReferenceId(match[1] ?? "");

    if (!contentId) continue;

    if (matchIndex > lastIndex) {
      segments.push({ type: "text", text: description.slice(lastIndex, matchIndex) });
    }

    const label = match[2]?.trim() || undefined;
    const reference = { contentId, label, raw };
    segments.push({ type: "question-reference", ...reference });

    if (!referencesById.has(contentId)) {
      referencesById.set(contentId, reference);
    }

    lastIndex = matchIndex + raw.length;
  }

  if (lastIndex < description.length) {
    segments.push({ type: "text", text: description.slice(lastIndex) });
  }

  return {
    segments: segments.length > 0 ? segments : [{ type: "text", text: description }],
    references: Array.from(referencesById.values()),
  };
}

export function extractQuestionReferenceIds(descriptions: readonly string[]): string[] {
  const referenceIds = new Set<string>();

  for (const description of descriptions) {
    for (const reference of parseQuestionReferences(description).references) {
      referenceIds.add(reference.contentId);
    }
  }

  return Array.from(referenceIds);
}

export function getQuestionReferenceValidationError(description: string): string | null {
  const referenceCount = parseQuestionReferences(description).references.length;
  if (referenceCount > MAX_QUESTION_REFERENCE_COUNT) {
    return `Description can reference up to ${MAX_QUESTION_REFERENCE_COUNT} questions`;
  }

  return null;
}

export function parseQuestionReferenceInput(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const rawSyntaxMatch = trimmedValue.match(/^\[\[\s*question\s*:\s*([0-9]+)(?:\|[^\]\r\n]*)?\]\]$/i);
  if (rawSyntaxMatch) {
    return normalizeQuestionReferenceId(rawSyntaxMatch[1] ?? "");
  }

  const shorthandMatch = trimmedValue.match(/^#?([0-9]+)$/);
  if (shorthandMatch) {
    return normalizeQuestionReferenceId(shorthandMatch[1] ?? "");
  }

  try {
    const isAbsoluteUrl = /^[a-z][a-z\d+\-.]*:/i.test(trimmedValue);
    const url = new URL(trimmedValue, "https://curyo.local");
    if (isAbsoluteUrl && url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    if (isAbsoluteUrl && !["app.curyo.xyz", "curyo.xyz", "localhost", "127.0.0.1"].includes(url.hostname)) {
      return null;
    }
    if (url.pathname !== "/rate" && url.pathname !== "/vote") return null;

    const contentId = url.searchParams.get("content");
    return contentId ? normalizeQuestionReferenceId(contentId) : null;
  } catch {
    return null;
  }
}
