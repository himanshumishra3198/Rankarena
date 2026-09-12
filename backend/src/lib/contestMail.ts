import { sendMail } from "./mailer";
import { unsubscribeUrl } from "./unsubscribe";

/**
 * Contest mail: the announcement when one is scheduled, and the nudge an hour
 * before it starts.
 *
 * Richer than the transactional templates in mailer.ts because these are the
 * ones people receive while not thinking about the site — they have to carry
 * enough of the contest to be worth opening: when it is, how long, how it is
 * marked, and one obvious thing to do next.
 *
 * Inline styles and no <style> block, same as the rest: mail clients strip
 * stylesheets and disagree about everything else. Tables are used for the
 * detail grid because Outlook still does not do flexbox.
 */

const SITE = process.env.PUBLIC_SITE_URL || "https://rankarenas.com";

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** "Saturday, 20 September 2026 at 9:00 pm IST" — written out, in Indian time. */
function longDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata", timeZoneName: "short",
  }).format(d).replace(" at ", " at ");
}

function duration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  return h ? `${h} hour${h > 1 ? "s" : ""}` : `${m} minutes`;
}

/**
 * How far ahead of the start the reminder goes out.
 *
 * Lives here rather than in the notifier because the announcement copy has to
 * know it too — whether a reminder is still coming decides what that email is
 * allowed to promise — and the notifier already imports this module.
 */
export const REMINDER_LEAD_MS = 60 * 60_000;

export interface ContestMailData {
  id: string;
  title: string;
  startTime: Date;
  durationMinutes: number;
  negativeMarks: number | string;
  questionCount?: number;
}

function detailRow(label: string, value: string) {
  return `<tr>
    <td style="padding:7px 0;font-size:13px;color:#64748b;width:120px;">${label}</td>
    <td style="padding:7px 0;font-size:14px;color:#0f172a;font-weight:600;">${value}</td>
  </tr>`;
}

function shell(opts: {
  eyebrow: string; eyebrowColor: string; heading: string; lead: string;
  contest: ContestMailData; cta: string; ctaUrl: string; footnote: string; unsubUrl: string;
}) {
  const { contest: c } = opts;
  const rows = [
    detailRow("Starts", longDate(c.startTime)),
    detailRow("Duration", duration(c.durationMinutes)),
    ...(c.questionCount ? [detailRow("Questions", String(c.questionCount))] : []),
    detailRow("Marking", `+2 correct &nbsp;·&nbsp; −${Number(c.negativeMarks)} wrong`),
  ].join("");

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="padding:26px 32px 0;">
      <div style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-.3px;">Rank<span style="color:#2563eb;">Arenas</span></div>
    </div>

    <div style="padding:18px 32px 0;">
      <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${opts.eyebrowColor};">${opts.eyebrow}</div>
      <h1 style="font-size:22px;line-height:1.3;color:#0f172a;margin:8px 0 10px;">${escapeHtml(c.title)}</h1>
      <p style="font-size:15px;line-height:1.65;color:#334155;margin:0 0 20px;">${opts.lead}</p>
    </div>

    <div style="padding:0 32px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:6px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
    </div>

    <div style="padding:22px 32px 6px;">
      <a href="${opts.ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:9px;">${opts.cta}</a>
    </div>

    <div style="padding:14px 32px 26px;">
      <p style="font-size:13px;line-height:1.6;color:#64748b;margin:0;">${opts.footnote}</p>
    </div>

    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:0;">
        You are receiving this because you have a RankArenas account.
        <a href="${opts.unsubUrl}" style="color:#64748b;">Unsubscribe from contest emails</a>.
      </p>
      <p style="font-size:12px;line-height:1.6;color:#cbd5e1;margin:8px 0 0;word-break:break-all;">${opts.ctaUrl}</p>
    </div>
  </div>
</body></html>`;
}

export function sendContestAnnouncedEmail(to: string, userId: string, name: string, c: ContestMailData) {
  const url = `${SITE}/contests`;
  const unsub = unsubscribeUrl(userId);
  // Only promise the reminder when there is still time to send one. A contest
  // put up half an hour before it starts is worth announcing, but the sweep
  // will never get to remind anyone about it, and an email that promises a
  // second email that never arrives is worse than one that says nothing.
  const reminderComing = c.startTime.getTime() - Date.now() > REMINDER_LEAD_MS;
  const promise = reminderComing
    ? "Register now and we will remind you an hour before it begins."
    : "It starts shortly, so register now if you want to sit it.";
  return sendMail(
    to,
    `New contest: ${c.title} — RankArenas`,
    shell({
      eyebrow: "New contest scheduled", eyebrowColor: "#2563eb",
      heading: c.title,
      lead: `Hi ${escapeHtml(name.trim() || "there")}, a new rated contest is on the calendar. ${promise}`,
      contest: c, cta: "Register for this contest", ctaUrl: url,
      footnote: "Registering is free and takes a moment. Your rating only changes if you sit the paper.",
      unsubUrl: unsub,
    }),
    `New contest on RankArenas: ${c.title}\n${promise}\n\n`
      + `Starts: ${longDate(c.startTime)}\nDuration: ${duration(c.durationMinutes)}\n`
      + `Marking: +2 correct, -${Number(c.negativeMarks)} wrong\n\n`
      + `Register: ${url}\n\nUnsubscribe from contest emails: ${unsub}`,
  );
}

export function sendContestStartingEmail(to: string, userId: string, name: string, c: ContestMailData) {
  const url = `${SITE}/contests/${c.id}`;
  const unsub = unsubscribeUrl(userId);
  return sendMail(
    to,
    `Starting in an hour: ${c.title} — RankArenas`,
    shell({
      eyebrow: "Starts in about an hour", eyebrowColor: "#b45309",
      heading: c.title,
      lead: `Hi ${escapeHtml(name.trim() || "there")}, the contest you registered for starts shortly. Find a quiet hour, open it on a full screen, and keep the tab open until you submit.`,
      contest: c, cta: "Open the contest", ctaUrl: url,
      footnote: "The room opens at the start time. Sections are separately timed, and the paper submits itself when the clock runs out.",
      unsubUrl: unsub,
    }),
    `${c.title} starts in about an hour.\n\n`
      + `Starts: ${longDate(c.startTime)}\nDuration: ${duration(c.durationMinutes)}\n\n`
      + `Open: ${url}\n\nUnsubscribe from contest emails: ${unsub}`,
  );
}
