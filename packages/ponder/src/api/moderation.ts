import { contentModerationPolicy } from "@curyo/node-utils/contentModeration";
import { or, sql } from "ponder";
import { buildAsciiWordBoundaryPattern, buildSubdomainLikePattern } from "./moderationPatterns.js";

function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

const blockedTextPattern = buildAsciiWordBoundaryPattern(contentModerationPolicy.blockedTextTerms);

function buildBlockedDomainCondition(hostExpr: unknown) {
  return or(
    ...contentModerationPolicy.blockedDomains.flatMap(domain => [
      sql<boolean>`lower(coalesce(${hostExpr}, '')) = ${domain}`,
      sql<boolean>`lower(coalesce(${hostExpr}, '')) like ${buildSubdomainLikePattern(domain)}`,
    ]),
  );
}

function buildBlockedUrlTermCondition(urlExpr: unknown) {
  return or(
    ...contentModerationPolicy.blockedUrlTerms.map(term =>
      sql<boolean>`lower(coalesce(${urlExpr}, '')) like ${`%${escapeLikeTerm(term)}%`} escape '\\'`,
    ),
  );
}

function buildBlockedTextCondition(textExpr: unknown) {
  return sql<boolean>`coalesce(${textExpr}, '') ~* ${blockedTextPattern}`;
}

export function buildAllowedContentCondition(fields: {
  canonicalUrl: unknown;
  description: unknown;
  tags: unknown;
  title: unknown;
  url: unknown;
  urlHost: unknown;
}) {
  const blockedCondition = or(
    buildBlockedDomainCondition(fields.urlHost),
    buildBlockedUrlTermCondition(fields.url),
    buildBlockedUrlTermCondition(fields.canonicalUrl),
    buildBlockedTextCondition(fields.title),
    buildBlockedTextCondition(fields.description),
    buildBlockedTextCondition(fields.tags),
  );

  return sql<boolean>`not (${blockedCondition})`;
}

export function buildAllowedCategoryCondition(fields: {
  domain: unknown;
  name: unknown;
}) {
  const blockedCondition = or(buildBlockedDomainCondition(fields.domain), buildBlockedTextCondition(fields.name));
  return sql<boolean>`not (${blockedCondition})`;
}
