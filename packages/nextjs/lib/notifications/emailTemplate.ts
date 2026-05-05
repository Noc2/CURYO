interface CuryoEmailTemplateParams {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  eyebrow?: string;
  footerNote?: string;
  footerLinkLabel?: string;
  footerLinkHref?: string;
  linkIntro?: string;
}

const EMAIL_BG = "#090a0c";
const EMAIL_TEXT = "#f5f0eb";
const EMAIL_PRIMARY = "#d56a3e";
const EMAIL_PRIMARY_HALO = "rgba(213,106,62,0.14)";
const EMAIL_SURFACE_TOP = "#1c181e";
const EMAIL_SURFACE_BOTTOM = "#151217";
const EMAIL_SURFACE_GLOW = "rgba(224,122,78,0.18)";
const EMAIL_MUTED_TEXT = "rgba(245,240,235,0.86)";
const EMAIL_MUTED_LABEL = "rgba(245,240,235,0.64)";
const EMAIL_FOOTER = "rgba(139,133,142,0.92)";
const EMAIL_BORDER = "rgba(245,240,235,0.08)";
const EMAIL_SHADOW = "rgba(5,4,8,0.42)";

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
  const safeFooterLinkLabel = params.footerLinkLabel ? escapeHtml(params.footerLinkLabel) : null;
  const safeFooterLinkHref = params.footerLinkHref ? escapeHtml(params.footerLinkHref) : null;
  const safeLinkIntro = escapeHtml(params.linkIntro ?? "If the button does not work, open this link manually:");

  return `
    <div style="margin:0; padding:32px 16px; background:${EMAIL_BG}; color:${EMAIL_TEXT};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; width:100%; background:${EMAIL_BG};">
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
                        style="width:14px; height:14px; border-radius:999px; background:${EMAIL_PRIMARY}; box-shadow:0 0 0 4px ${EMAIL_PRIMARY_HALO};"
                      ></td>
                      <td
                        style="padding-left:10px; color:${EMAIL_TEXT}; font-family:Arial, Helvetica, sans-serif; font-size:26px; line-height:1; font-weight:700; letter-spacing:-0.4px;"
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
                      radial-gradient(circle at top right, ${EMAIL_SURFACE_GLOW}, transparent 42%),
                      linear-gradient(180deg, ${EMAIL_SURFACE_TOP} 0%, ${EMAIL_SURFACE_BOTTOM} 100%);
                    border:1px solid ${EMAIL_BORDER};
                    border-radius:28px;
                    padding:36px 34px 30px;
                    box-shadow:0 24px 54px ${EMAIL_SHADOW};
                  "
                >
                  <div style="margin:0 0 14px; color:${EMAIL_PRIMARY}; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">
                    ${safeEyebrow}
                  </div>
                  <h1 style="margin:0 0 16px; color:${EMAIL_TEXT}; font-family:Arial, Helvetica, sans-serif; font-size:34px; line-height:1.12; font-weight:700;">
                    ${safeTitle}
                  </h1>
                  <p style="margin:0 0 28px; color:${EMAIL_MUTED_TEXT}; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:1.65;">
                    ${safeBody}
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 28px;">
                    <tr>
                      <td
                        align="center"
                        style="
                          border-radius:999px;
                          background:${EMAIL_PRIMARY};
                          box-shadow:0 14px 30px rgba(213,106,62,0.18);
                        "
                      >
                        <a
                          href="${safeCtaHref}"
                          style="
                            display:inline-block;
                            padding:14px 24px;
                            color:${EMAIL_TEXT};
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
                      background:${EMAIL_BG};
                      border:1px solid ${EMAIL_BORDER};
                      border-radius:18px;
                    "
                  >
                    <p style="margin:0 0 10px; color:${EMAIL_MUTED_LABEL}; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.6;">
                      ${safeLinkIntro}
                    </p>
                    <a
                      href="${safeCtaHref}"
                      style="
                        color:${EMAIL_PRIMARY};
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
                  <div style="padding-top:18px; border-top:1px solid ${EMAIL_BORDER}; color:${EMAIL_FOOTER}; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.6;">
                    ${safeFooterNote}
                    ${
                      safeFooterLinkHref && safeFooterLinkLabel
                        ? `
                      <div style="margin-top:10px;">
                        <a
                          href="${safeFooterLinkHref}"
                          style="
                            color:${EMAIL_PRIMARY};
                            font-family:Arial, Helvetica, sans-serif;
                            font-size:13px;
                            line-height:1.6;
                            text-decoration:underline;
                          "
                        >
                          ${safeFooterLinkLabel}
                        </a>
                      </div>
                    `
                        : ""
                    }
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
