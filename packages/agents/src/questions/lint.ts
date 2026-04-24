import { findAgentResultTemplate } from "../templates";
import type { AgentAskExample, AgentQuestionExample, JsonObject, QuestionLintFinding } from "./types";

const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{4,160}$/;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asQuestionArray(request: AgentAskExample): AgentQuestionExample[] {
  if (request.question) return [request.question];
  if (Array.isArray(request.questions)) return request.questions;
  return [];
}

function looksLikeHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function tagCount(tags: unknown): number {
  if (Array.isArray(tags)) return tags.filter(tag => typeof tag === "string" && tag.trim()).length;
  if (typeof tags !== "string") return 0;
  return tags
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean).length;
}

function hasInvalidHttpsUrlList(value: unknown): boolean {
  return !Array.isArray(value) || value.some(url => !looksLikeHttpsUrl(url));
}

function pushFinding(
  findings: QuestionLintFinding[],
  level: QuestionLintFinding["level"],
  path: string,
  message: string,
) {
  findings.push({ level, path, message });
}

export function lintAgentQuestion(
  question: Partial<AgentQuestionExample>,
  path = "question",
): QuestionLintFinding[] {
  const findings: QuestionLintFinding[] = [];
  const title = typeof question.title === "string" ? question.title.trim() : "";
  const description = typeof question.description === "string" ? question.description.trim() : "";

  if (!title) pushFinding(findings, "error", `${path}.title`, "Question title is required.");
  if (title.length > 120) pushFinding(findings, "error", `${path}.title`, "Question title must fit the 120 character on-chain limit.");
  if (/[?].*[?]/.test(title)) {
    pushFinding(findings, "warning", `${path}.title`, "Ask one bounded question instead of bundling several questions into the title.");
  }
  if (/\b(and|or)\b/i.test(title) && title.length > 70) {
    pushFinding(findings, "warning", `${path}.title`, "Long titles with conjunctions often hide multiple decisions.");
  }

  if (!description) pushFinding(findings, "error", `${path}.description`, "Description is required.");
  if (description.length > 280) {
    pushFinding(findings, "warning", `${path}.description`, "Keep descriptions concise enough for voters to scan quickly.");
  }
  if (!looksLikeHttpsUrl(question.contextUrl)) {
    pushFinding(findings, "error", `${path}.contextUrl`, "Context URL must be a public HTTPS URL.");
  }
  if (question.categoryId === undefined || question.categoryId === null || String(question.categoryId).trim() === "") {
    pushFinding(findings, "error", `${path}.categoryId`, "Category id is required.");
  }
  if (!question.tags || tagCount(question.tags) === 0) {
    pushFinding(findings, "error", `${path}.tags`, "At least one public tag is required.");
  }
  if (question.tags && !Array.isArray(question.tags) && typeof question.tags !== "string") {
    pushFinding(findings, "error", `${path}.tags`, "Tags must be an array or comma-separated string.");
  }
  if (question.templateId && !findAgentResultTemplate(question.templateId)) {
    pushFinding(findings, "error", `${path}.templateId`, `Unknown result template: ${question.templateId}.`);
  }
  if (question.imageUrls !== undefined && hasInvalidHttpsUrlList(question.imageUrls)) {
    pushFinding(findings, "error", `${path}.imageUrls`, "Image URLs must be an array of public HTTPS URLs.");
  }
  if (question.videoUrl && !looksLikeHttpsUrl(question.videoUrl)) {
    pushFinding(findings, "error", `${path}.videoUrl`, "Video URL must be a public HTTPS URL.");
  }

  return findings;
}

export function lintAgentAskRequest(input: unknown): QuestionLintFinding[] {
  const findings: QuestionLintFinding[] = [];
  if (!isObject(input)) {
    return [{ level: "error", path: "$", message: "Ask payload must be a JSON object." }];
  }

  const request = input as Partial<AgentAskExample>;
  const clientRequestId = typeof request.clientRequestId === "string" ? request.clientRequestId.trim() : "";
  if (!clientRequestId) {
    pushFinding(findings, "error", "clientRequestId", "clientRequestId is required for idempotent agent asks.");
  } else if (!CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
    pushFinding(findings, "error", "clientRequestId", "clientRequestId must be 4-160 URL-safe characters.");
  }

  if (!isObject(request.bounty)) {
    pushFinding(findings, "error", "bounty", "A bounty object is required before an agent spends.");
  } else if (!/^\d+$/.test(String(request.bounty.amount ?? "")) || BigInt(String(request.bounty.amount ?? "0")) <= 0n) {
    pushFinding(findings, "error", "bounty.amount", "Bounty amount must be a positive atomic integer.");
  }

  if (request.templateId && !findAgentResultTemplate(request.templateId)) {
    pushFinding(findings, "error", "templateId", `Unknown result template: ${request.templateId}.`);
  }

  const questions = asQuestionArray(request as AgentAskExample);
  if (questions.length === 0) {
    pushFinding(findings, "error", "question", "Provide question or questions.");
  }
  if (request.question && request.questions) {
    pushFinding(findings, "error", "questions", "Use either question or questions, not both.");
  }
  questions.forEach((question, index) => {
    findings.push(...lintAgentQuestion(question, request.question ? "question" : `questions.${index}`));
  });

  if (findings.length === 0 && questions.length > 1 && request.templateId !== "ranked_option_member") {
    pushFinding(
      findings,
      "warning",
      "templateId",
      "Multi-question asks usually need ranked_option_member template metadata.",
    );
  }

  return findings;
}

export function summarizeLintFindings(findings: readonly QuestionLintFinding[]): {
  errorCount: number;
  ok: boolean;
  warningCount: number;
} {
  const errorCount = findings.filter(finding => finding.level === "error").length;
  return {
    errorCount,
    ok: errorCount === 0,
    warningCount: findings.filter(finding => finding.level === "warning").length,
  };
}
