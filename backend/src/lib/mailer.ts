import nodemailer, { Transporter } from "nodemailer";

/**
 * Outbound mail, over plain SMTP.
 *
 * SMTP rather than a provider SDK on purpose: Amazon SES, Resend, Postmark and
 * Gmail all speak it, so switching provider is an env change on the server
 * rather than a deploy.
 *
 * With no SMTP_HOST configured — which is every local checkout — nothing is
 * sent and the link is written to the log instead. That keeps signup and
 * password reset testable without credentials, and is why send() never throws:
 * a mail outage should not turn a successful registration into a 500.
 */

const FROM = process.env.MAIL_FROM || "RankArenas <no-reply@rankarenas.com>";
// Where replies go. The From address has to sit on the SES-verified domain,
// and no-reply@ has no mailbox behind it — so without this, anyone answering a
// verification email is talking to nobody. Reply-To can be any address,
// including a Gmail one, because it is never used to send and so is not
// subject to SPF, DKIM or SES identity checks.
const REPLY_TO = process.env.MAIL_REPLY_TO;
const SITE = process.env.PUBLIC_SITE_URL || "https://rankarenas.com";

let transport: Transporter | null = null;
let warned = false;

function getTransport(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transport;
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  const t = getTransport();
  if (!t) {
    if (!warned) {
      console.warn("[mailer] SMTP_HOST is not set — emails are logged, not sent.");
      warned = true;
    }
    console.info(`[mailer] would send to ${to}: ${subject}\n${text}`);
    return;
  }
  try {
    await t.sendMail({ from: FROM, to, subject, html, text, ...(REPLY_TO ? { replyTo: REPLY_TO } : {}) });
  } catch (err) {
    // Logged and swallowed: the caller's operation already succeeded, and the
    // user can always ask for another link.
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err);
  }
}

// ── Templates ───────────────────────────────────────────────────────────────
// Inline styles and a table-free layout, because mail clients strip <style>
// blocks and disagree about everything else.

function layout(heading: string, body: string, buttonLabel: string, buttonUrl: string, footer: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:4px;">RankArenas</div>
    <h1 style="font-size:19px;color:#0f172a;margin:18px 0 10px;">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 22px;">${body}</p>
    <a href="${buttonUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${buttonLabel}</a>
    <p style="font-size:13px;line-height:1.6;color:#64748b;margin:22px 0 0;">${footer}</p>
    <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:18px 0 0;word-break:break-all;">
      If the button does not work, paste this into your browser:<br>${buttonUrl}
    </p>
  </div>
</body></html>`;
}

export function sendVerificationEmail(to: string, name: string, token: string) {
  const url = `${SITE}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail(
    to,
    "Confirm your email — RankArenas",
    layout(
      `Welcome, ${escapeHtml(name)}`,
      "Confirm this address to unlock contests and mock tests on RankArenas.",
      "Confirm my email",
      url,
      "This link works once and expires in 24 hours. If you did not create an account, ignore this email.",
    ),
    `Confirm your email to unlock contests on RankArenas:\n${url}\n\nThis link works once and expires in 24 hours.`,
  );
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  const url = `${SITE}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail(
    to,
    "Reset your password — RankArenas",
    layout(
      `Reset your password`,
      `Hi ${escapeHtml(name)}, someone asked to reset the password for this account.`,
      "Choose a new password",
      url,
      "This link works once and expires in 1 hour. If you did not ask for this, ignore this email — your password has not changed.",
    ),
    `Reset your RankArenas password:\n${url}\n\nThis link works once and expires in 1 hour. If you did not ask for this, ignore this email.`,
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
