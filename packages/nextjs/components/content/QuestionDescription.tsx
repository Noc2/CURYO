import React from "react";
import Link from "next/link";
import { buildRateContentHref } from "~~/constants/routes";
import { parseQuestionReferences } from "~~/lib/questionReferences";

export type QuestionReferenceContentSummary = {
  id: bigint | string;
  question?: string;
  title?: string;
};

type QuestionDescriptionProps = {
  description: string;
  referencedContentById?: ReadonlyMap<string, QuestionReferenceContentSummary>;
  className?: string;
};

function getReferenceLabel(
  contentId: string,
  customLabel: string | undefined,
  summary: QuestionReferenceContentSummary | undefined,
) {
  return customLabel?.trim() || summary?.question?.trim() || summary?.title?.trim() || `Question #${contentId}`;
}

export function QuestionDescription({ description, referencedContentById, className }: QuestionDescriptionProps) {
  const parsed = parseQuestionReferences(description);

  return (
    <p className={className}>
      {parsed.segments.map((segment, index) => {
        if (segment.type === "text") {
          return segment.text;
        }

        const summary = referencedContentById?.get(segment.contentId);
        const label = getReferenceLabel(segment.contentId, segment.label, summary);

        return (
          <Link
            key={`${segment.contentId}-${index}`}
            href={buildRateContentHref(segment.contentId)}
            aria-label={`Rate related question: ${label}`}
            className="inline-flex max-w-full items-center align-baseline rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-left text-sm font-semibold leading-snug text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 hover:text-primary-focus"
          >
            <span className="min-w-0 break-words">{label}</span>
          </Link>
        );
      })}
    </p>
  );
}
