import { contentModerationPolicy } from "@curyo/node-utils/contentModeration";
import { category, content } from "ponder:schema";
import { eq, or, sql } from "ponder";
import { buildAsciiWordBoundaryPattern, buildSubdomainLikePattern } from "./moderationPatterns.js";

type SqlBoolean = ReturnType<typeof sql<boolean>>;

function buildOrCondition(conditions: SqlBoolean[]): SqlBoolean {
  if (conditions.length === 0) {
    return sql<boolean>`false`;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return or(...conditions) as SqlBoolean;
}

function buildBlockedHostCondition(hostExpression: any): SqlBoolean {
  const domainConditions = contentModerationPolicy.blockedDomains.flatMap(domain => [
    eq(hostExpression, domain) as SqlBoolean,
    sql<boolean>`coalesce(${hostExpression}, '') LIKE ${buildSubdomainLikePattern(domain)}`,
  ]);

  return buildOrCondition(domainConditions);
}

function buildBlockedUrlTermCondition(urlExpression: any): SqlBoolean {
  const urlTermConditions = contentModerationPolicy.blockedUrlTerms.map(term =>
    sql<boolean>`lower(coalesce(${urlExpression}, '')) LIKE ${`%${term.toLowerCase()}%`}`,
  );

  return buildOrCondition(urlTermConditions);
}

const contentTextPattern = buildAsciiWordBoundaryPattern(contentModerationPolicy.blockedTextTerms);

function buildBlockedTextCondition(textExpression: any): SqlBoolean {
  return sql<boolean>`coalesce(${textExpression}, '') ~* ${contentTextPattern}`;
}

export function buildBlockedContentCondition(): SqlBoolean {
  return buildOrCondition([
    buildBlockedHostCondition(content.urlHost),
    buildBlockedUrlTermCondition(content.url),
    buildBlockedUrlTermCondition(content.canonicalUrl),
    buildBlockedTextCondition(content.title),
    buildBlockedTextCondition(content.description),
    buildBlockedTextCondition(content.tags),
  ]);
}

export function buildUnmoderatedContentCondition(): SqlBoolean {
  const blockedCondition = buildBlockedContentCondition();
  return sql<boolean>`NOT (${blockedCondition})`;
}

export function buildBlockedCategoryCondition(): SqlBoolean {
  return buildOrCondition([
    buildBlockedHostCondition(category.domain),
    buildBlockedTextCondition(category.name),
  ]);
}

export function buildUnmoderatedCategoryCondition(): SqlBoolean {
  const blockedCondition = buildBlockedCategoryCondition();
  return sql<boolean>`NOT (${blockedCondition})`;
}
