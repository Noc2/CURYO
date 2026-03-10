import "server-only";
import { getResendConfig } from "~~/lib/env/server";

interface ResendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
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
  const safeUrl = params.verifyUrl.replace(/&/g, "&amp;");

  await sendResendEmail({
    to: params.email,
    subject: "Verify your Curyo notification email",
    text: `Verify your email for Curyo notifications: ${params.verifyUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #f5f5f5; background: #111; padding: 24px;">
        <h1 style="font-size: 20px; margin-bottom: 12px;">Verify your email</h1>
        <p style="margin-bottom: 16px;">
          Confirm this email address to receive Curyo notification emails for watched rounds and curators you follow.
        </p>
        <p style="margin-bottom: 20px;">
          <a href="${safeUrl}" style="display: inline-block; background: #fff; color: #111; padding: 10px 16px; border-radius: 9999px; text-decoration: none; font-weight: 600;">
            Verify email
          </a>
        </p>
        <p style="font-size: 14px; color: #b3b3b3;">
          If the button does not work, open this link manually:<br />
          <a href="${safeUrl}" style="color: #6ec1ff;">${safeUrl}</a>
        </p>
      </div>
    `,
  });
}
