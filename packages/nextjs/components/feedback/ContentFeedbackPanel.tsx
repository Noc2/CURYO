"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ArrowTopRightOnSquareIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useContentFeedback } from "~~/hooks/useContentFeedback";
import {
  CONTENT_FEEDBACK_BODY_MAX_LENGTH,
  CONTENT_FEEDBACK_TYPES,
  CONTENT_FEEDBACK_TYPE_LABELS,
  type ContentFeedbackItem,
  type ContentFeedbackType,
} from "~~/lib/feedback/types";
import { notification } from "~~/utils/scaffold-eth";

interface ContentFeedbackPanelProps {
  item: ContentItem | null;
  variant?: "rail" | "sheet";
  onRequestConnect?: () => void;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatFeedbackDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function FeedbackItem({ item }: { item: ContentFeedbackItem }) {
  const visibilityLabel = item.isPublic ? "Unlocked" : "Only you";

  return (
    <li className="rounded-lg border border-base-content/10 bg-base-content/[0.035] p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-base-content">{item.feedbackTypeLabel}</p>
          <p className="mt-1 text-xs leading-none text-base-content/48">
            {shortenAddress(item.authorAddress)} · {formatFeedbackDate(item.createdAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-base-content/[0.07] px-2 py-1 text-[0.66rem] font-semibold leading-none text-base-content/58">
          {visibilityLabel}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-base-content/78">{item.body}</p>
      {item.sourceUrl ? (
        <SafeExternalLink
          href={item.sourceUrl}
          allowExternalOpen
          className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:text-primary-focus hover:underline"
          ariaLabel="Open feedback source"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Source</span>
        </SafeExternalLink>
      ) : null}
    </li>
  );
}

export function ContentFeedbackPanel({ item, variant = "rail", onRequestConnect }: ContentFeedbackPanelProps) {
  const { address } = useAccount();
  const { feedback, items, isLoading, isSubmitting, isUnlocking, submitFeedback, requestReadAccess } =
    useContentFeedback(item?.id ?? null, address);
  const [feedbackType, setFeedbackType] = useState<ContentFeedbackType>("evidence");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const isSheet = variant === "sheet";
  const bodyLength = body.trim().length;
  const canSubmit = Boolean(address && item && bodyLength >= 4 && bodyLength <= CONTENT_FEEDBACK_BODY_MAX_LENGTH);
  const feedbackStatusCopy = feedback.settlementComplete
    ? "Feedback is unlocked for this question."
    : "Feedback stays hidden until settlement.";
  const ownHiddenCopy =
    feedback.ownHiddenCount > 0
      ? `${feedback.ownHiddenCount} hidden note${feedback.ownHiddenCount === 1 ? "" : "s"} from you`
      : null;

  const visibleItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.isPublic !== b.isPublic) return a.isPublic ? 1 : -1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [items]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!address) {
      notification.info("Sign in to add feedback.");
      onRequestConnect?.();
      return;
    }
    if (!canSubmit) return;

    const result = await submitFeedback({
      feedbackType,
      body,
      sourceUrl: sourceUrl.trim() || undefined,
    });

    if (!result.ok) {
      if (result.reason === "rejected") return;
      notification.error(result.error || "Failed to save feedback");
      return;
    }

    setBody("");
    setSourceUrl("");
    notification.success(feedback.settlementComplete ? "Feedback published" : "Feedback saved until settlement");
  };

  const handleUnlock = async () => {
    const result = await requestReadAccess();
    if (!result.ok) {
      if (result.reason === "not_connected") {
        notification.info("Sign in to unlock your feedback.");
        onRequestConnect?.();
        return;
      }
      if (result.reason === "rejected") return;
      notification.error(result.error || "Failed to unlock your feedback");
    }
  };

  return (
    <section
      className={`surface-card flex min-h-0 flex-col overflow-hidden rounded-lg ${
        isSheet ? "max-h-[82svh] p-4" : "max-h-[clamp(24rem,46vh,34rem)] p-3.5"
      }`}
      aria-label="Question feedback"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-base-content/45">Feedback</p>
          <h3 className="mt-1 text-base font-semibold leading-tight text-base-content">Optional Feedback</h3>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-base-content/[0.07] px-2.5 py-1 text-xs font-semibold leading-none text-base-content/62">
          <LockClosedIcon className="h-3.5 w-3.5" />
          {feedback.publicCount}
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-base-content/10 bg-base-content/[0.035] px-3 py-2">
        <p className="text-xs font-medium leading-relaxed text-base-content/64">{feedbackStatusCopy}</p>
        {!feedback.settlementComplete && ownHiddenCopy ? (
          <p className="mt-1 text-xs leading-relaxed text-base-content/45">{ownHiddenCopy}</p>
        ) : null}
      </div>

      <form className="mt-3 flex shrink-0 flex-col gap-2.5" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={`feedback-type-${item?.id?.toString() ?? "none"}`}>
          Feedback type
        </label>
        <select
          id={`feedback-type-${item?.id?.toString() ?? "none"}`}
          value={feedbackType}
          onChange={event => setFeedbackType(event.target.value as ContentFeedbackType)}
          className="select select-sm w-full rounded-lg border-base-content/10 bg-base-200 text-sm font-medium focus:outline-none"
          disabled={!item || isSubmitting}
        >
          {CONTENT_FEEDBACK_TYPES.map(type => (
            <option key={type} value={type}>
              {CONTENT_FEEDBACK_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`feedback-body-${item?.id?.toString() ?? "none"}`}>
          Feedback
        </label>
        <textarea
          id={`feedback-body-${item?.id?.toString() ?? "none"}`}
          value={body}
          onChange={event => setBody(event.target.value)}
          maxLength={CONTENT_FEEDBACK_BODY_MAX_LENGTH}
          rows={isSheet ? 4 : 3}
          className="textarea min-h-24 w-full resize-none rounded-lg border-base-content/10 bg-base-200 text-sm leading-relaxed focus:outline-none"
          placeholder="Evidence, ambiguity, missing context, source issues..."
          disabled={!item || isSubmitting}
        />

        <label className="sr-only" htmlFor={`feedback-source-${item?.id?.toString() ?? "none"}`}>
          Source URL
        </label>
        <input
          id={`feedback-source-${item?.id?.toString() ?? "none"}`}
          value={sourceUrl}
          onChange={event => setSourceUrl(event.target.value)}
          className="input input-sm w-full rounded-lg border-base-content/10 bg-base-200 text-sm focus:outline-none"
          placeholder="Source URL, optional"
          disabled={!item || isSubmitting}
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-base-content/42">
            {bodyLength}/{CONTENT_FEEDBACK_BODY_MAX_LENGTH}
          </span>
          <button type="submit" className="btn btn-primary btn-sm rounded-lg" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? <span className="loading loading-spinner loading-xs" /> : null}
            Save
          </button>
        </div>
      </form>

      {!address ? (
        <button type="button" onClick={onRequestConnect} className="btn btn-ghost btn-sm mt-2 rounded-lg">
          Sign in to add feedback
        </button>
      ) : !feedback.settlementComplete && !feedback.hasReadSession ? (
        <button
          type="button"
          onClick={handleUnlock}
          className="btn btn-ghost btn-sm mt-2 rounded-lg"
          disabled={isUnlocking}
        >
          {isUnlocking ? <span className="loading loading-spinner loading-xs" /> : null}
          Unlock mine
        </button>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-base-content/50">
            <span className="loading loading-spinner loading-xs text-primary" />
            Loading feedback...
          </div>
        ) : visibleItems.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {visibleItems.map(feedbackItem => (
              <FeedbackItem key={feedbackItem.id} item={feedbackItem} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-base-content/12 px-3 py-3 text-sm leading-relaxed text-base-content/48">
            {feedback.settlementComplete
              ? "No feedback yet."
              : "Your saved feedback will appear here. Everyone's feedback unlocks after settlement."}
          </p>
        )}
      </div>
    </section>
  );
}
