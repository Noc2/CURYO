export const CONTENT_FEEDBACK_TYPES = [
  "evidence",
  "clarification",
  "concern",
  "counterpoint",
  "source_quality",
  "ai_note",
  "vote_rationale",
] as const;

export type ContentFeedbackType = (typeof CONTENT_FEEDBACK_TYPES)[number];

export const CONTENT_FEEDBACK_TYPE_LABELS: Record<ContentFeedbackType, string> = {
  evidence: "Evidence",
  clarification: "Clarification",
  concern: "Concern",
  counterpoint: "Counterpoint",
  source_quality: "Source quality",
  ai_note: "AI note",
  vote_rationale: "Vote rationale",
};

export const CONTENT_FEEDBACK_BODY_MAX_LENGTH = 800;
export const CONTENT_FEEDBACK_SOURCE_URL_MAX_LENGTH = 2048;

export interface ContentFeedbackItem {
  id: number;
  contentId: string;
  roundId: string | null;
  authorAddress: `0x${string}`;
  feedbackType: ContentFeedbackType;
  feedbackTypeLabel: string;
  body: string;
  sourceUrl: string | null;
  moderationStatus: string;
  visibilityStatus: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  isPublic: boolean;
}

export interface ContentFeedbackListResult {
  items: ContentFeedbackItem[];
  count: number;
  publicCount: number;
  ownHiddenCount: number;
  settlementComplete: boolean;
  openRoundId: string | null;
  hasReadSession?: boolean;
}
