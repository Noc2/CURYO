import "server-only";
import { getResendConfig } from "~~/lib/env/server";
import { buildCuryoEmailHtml } from "~~/lib/notifications/emailTemplate";

interface ResendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function isResendConfigured() {
  const { apiKey, fromEmail } = getResendConfig();
  return Boolean(apiKey && fromEmail);
}

export async function sendResendEmail(params: ResendEmailParams) {
  const { apiKey, fromEmail } = getResendConfig();

  if (!apiKey || !fromEmail) {
    throw new Error("Resend is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend request failed: ${response.status} ${body}`.trim());
  }
}

export async function sendNotificationVerificationEmail(params: { email: string; verifyUrl: string }) {
  await sendResendEmail({
    to: params.email,
    subject: "Verify your Curyo notification email",
    text: `Verify your email for Curyo notifications: ${params.verifyUrl}`,
    html: buildCuryoEmailHtml({
      eyebrow: "Email verification",
      title: "Verify your email",
      body: "Confirm this email address to receive Curyo notification emails for watched rounds and curators you follow.",
      ctaLabel: "Verify email",
      ctaHref: params.verifyUrl,
      footerNote: "This verification link was requested from Curyo notification settings.",
    }),
  });
}
