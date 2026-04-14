import { getOptionalAppUrl, getOptionalPonderUrl } from "../env/server";
import {
  type ContentShareContentInput,
  type ContentShareData,
  buildContentShareData,
  normalizeContentShareContentId,
} from "./contentShare";
import "server-only";

const CONTENT_SHARE_FETCH_TIMEOUT_MS = 2_500;

interface PonderContentDetailResponse {
  content?: ContentShareContentInput | null;
}

interface ContentShareDataOptions {
  fetchImpl?: typeof fetch;
  origin?: string;
}

function toHttpsOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return null;
  }
}

export function getContentShareOrigin(): string {
  return (
    getOptionalAppUrl() ??
    toHttpsOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    toHttpsOrigin(process.env.VERCEL_URL) ??
    `http://localhost:${process.env.PORT || 3000}`
  );
}

async function fetchContentForShare(
  ponderUrl: string,
  contentId: string,
  fetchImpl: typeof fetch,
): Promise<ContentShareContentInput | null> {
  const url = new URL(`/content/${contentId}`, `${ponderUrl.replace(/\/+$/, "")}/`);
  const response = await fetchImpl(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(CONTENT_SHARE_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as PonderContentDetailResponse;
  return body.content ?? null;
}

export async function getContentShareDataForParam(
  contentParam: unknown,
  options: ContentShareDataOptions = {},
): Promise<ContentShareData | null> {
  const contentId = normalizeContentShareContentId(contentParam);
  const ponderUrl = getOptionalPonderUrl();
  if (!contentId || !ponderUrl) {
    return null;
  }

  try {
    const content = await fetchContentForShare(ponderUrl, contentId, options.fetchImpl ?? fetch);
    return content ? buildContentShareData(content, options.origin ?? getContentShareOrigin()) : null;
  } catch {
    return null;
  }
}
