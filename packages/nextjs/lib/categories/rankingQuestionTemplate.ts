export const TITLE_PLACEHOLDER = "{title}";
export const RATING_PLACEHOLDER = "{rating}";

export interface RankingQuestionTemplateValidation {
  hasTitlePlaceholder: boolean;
  hasRatingPlaceholder: boolean;
  isValid: boolean;
}

export interface RankingQuestionDisplay {
  fullText: string;
  beforeTitle: string;
  title: string | null;
  afterTitle: string;
}

export function validateRankingQuestionTemplate(template: string): RankingQuestionTemplateValidation {
  const hasTitlePlaceholder = template.includes(TITLE_PLACEHOLDER);
  const hasRatingPlaceholder = template.includes(RATING_PLACEHOLDER);

  return {
    hasTitlePlaceholder,
    hasRatingPlaceholder,
    isValid: hasTitlePlaceholder && hasRatingPlaceholder,
  };
}

export function renderRankingQuestion(
  template: string | null | undefined,
  {
    title,
    rating,
    fallbackLabel = "content",
  }: {
    title?: string | null;
    rating: number | string;
    fallbackLabel?: string;
  },
): string {
  const normalizedTitle = title?.trim();
  const ratingText = String(rating);

  if (template) {
    const renderedTemplate = template
      .replaceAll(TITLE_PLACEHOLDER, normalizedTitle || fallbackLabel)
      .replaceAll(RATING_PLACEHOLDER, ratingText);

    if (validateRankingQuestionTemplate(template).isValid) {
      return renderedTemplate;
    }
  }

  if (normalizedTitle) {
    return `Should ${normalizedTitle} be rated higher or lower than ${ratingText} out of 100?`;
  }

  return `Should this ${fallbackLabel} be rated higher or lower than ${ratingText} out of 100?`;
}

export function buildRankingQuestionDisplay(
  template: string | null | undefined,
  {
    title,
    rating,
    fallbackLabel = "content",
  }: {
    title?: string | null;
    rating: number | string;
    fallbackLabel?: string;
  },
): RankingQuestionDisplay {
  const normalizedTitle = title?.trim() || null;
  const fullText = renderRankingQuestion(template, {
    title,
    rating,
    fallbackLabel,
  });

  if (!normalizedTitle) {
    return {
      fullText,
      beforeTitle: fullText,
      title: null,
      afterTitle: "",
    };
  }

  const titleIndex = fullText.indexOf(normalizedTitle);
  if (titleIndex === -1) {
    return {
      fullText,
      beforeTitle: fullText,
      title: null,
      afterTitle: "",
    };
  }

  return {
    fullText,
    beforeTitle: fullText.slice(0, titleIndex),
    title: normalizedTitle,
    afterTitle: fullText.slice(titleIndex + normalizedTitle.length),
  };
}
