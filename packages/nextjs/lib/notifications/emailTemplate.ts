interface CuryoEmailTemplateParams {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  eyebrow?: string;
  footerNote?: string;
  linkIntro?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCuryoEmailHtml(params: CuryoEmailTemplateParams) {
  const safeTitle = escapeHtml(params.title);
  const safeBody = escapeHtml(params.body);
  const safeCtaLabel = escapeHtml(params.ctaLabel);
  const safeCtaHref = escapeHtml(params.ctaHref);
  const safeEyebrow = escapeHtml(params.eyebrow ?? "CURYO NOTIFICATIONS");
  const safeFooterNote = escapeHtml(
    params.footerNote ?? "You are receiving this email because you signed up for Curyo email notifications.",
  );
  const safeLinkIntro = escapeHtml(params.linkIntro ?? "If the button does not work, open this link manually:");

  return `
    <div style="margin:0; padding:32px 16px; background:#090a0c; color:#f5f0eb;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; width:100%; background:#090a0c;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate; width:100%; max-width:640px;">
              <tr>
                <td style="padding:0 0 16px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td
                        width="14"
                        height="14"
                        style="width:14px; height:14px; border-radius:999px; background:#f26426; box-shadow:0 0 0 4px rgba(242,100,38,0.14);"
                      ></td>
                      <td
                        style="padding-left:10px; color:#f5f0eb; font-family:Arial, Helvetica, sans-serif; font-size:26px; line-height:1; font-weight:700; letter-spacing:-0.4px;"
                      >
                        Curyo
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td
                  style="
                    background:
                      radial-gradient(circle at top right, rgba(242,100,38,0.22), transparent 42%),
                      linear-gradient(180deg, #1c1a20 0%, #17161a 100%);
                    border:1px solid rgba(245,240,235,0.08);
                    border-radius:28px;
                    padding:36px 34px 30px;
                    box-shadow:0 24px 54px rgba(9,10,12,0.42);
                  "
                >
                  <div style="margin:0 0 14px; color:#f26426; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">
                    ${safeEyebrow}
                  </div>
                  <h1 style="margin:0 0 16px; color:#f5f0eb; font-family:Arial, Helvetica, sans-serif; font-size:34px; line-height:1.12; font-weight:700;">
                    ${safeTitle}
                  </h1>
                  <p style="margin:0 0 28px; color:rgba(245,240,235,0.86); font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:1.65;">
                    ${safeBody}
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 28px;">
                    <tr>
                      <td
                        align="center"
                        style="
                          border-radius:999px;
                          background:#f26426;
                          box-shadow:0 14px 30px rgba(242,100,38,0.18);
                        "
                      >
                        <a
                          href="${safeCtaHref}"
                          style="
                            display:inline-block;
                            padding:14px 24px;
                            color:#f5f0eb;
                            font-family:Arial, Helvetica, sans-serif;
                            font-size:16px;
                            font-weight:700;
                            text-decoration:none;
                          "
                        >
                          ${safeCtaLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <div
                    style="
                      margin:0 0 22px;
                      padding:18px 20px;
                      background:#090a0c;
                      border:1px solid rgba(245,240,235,0.08);
                      border-radius:18px;
                    "
                  >
                    <p style="margin:0 0 10px; color:rgba(245,240,235,0.64); font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.6;">
                      ${safeLinkIntro}
                    </p>
                    <a
                      href="${safeCtaHref}"
                      style="
                        color:#f26426;
                        font-family:Arial, Helvetica, sans-serif;
                        font-size:14px;
                        line-height:1.7;
                        text-decoration:underline;
                        word-break:break-all;
                      "
                    >
                      ${safeCtaHref}
                    </a>
                  </div>
                  <div style="padding-top:18px; border-top:1px solid rgba(245,240,235,0.08); color:rgba(126,137,150,0.92); font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.6;">
                    ${safeFooterNote}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}
