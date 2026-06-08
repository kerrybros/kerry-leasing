/**
 * EMAIL body — mirrors the SMS: greeting + rank + link to the full one-pager.
 *
 * Returns a subject, a plain-text body, and a minimal table/inline-style HTML
 * body (the only layout that renders reliably across email clients). The
 * substance lives on the linked scorecard page (/r/:token); the email just
 * drives the click — same philosophy as the SMS.
 */

export interface EmailFormatInput {
  firstName: string;
  rank: number;
  totalDrivers: number;
  noActivity: boolean;
  reportUrl: string;
  unsubscribeUrl: string;
}

export interface EmailBody {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatEmailBody(input: EmailFormatInput): EmailBody {
  const { firstName, rank, totalDrivers, noActivity, reportUrl, unsubscribeUrl } = input;

  const subject = noActivity
    ? 'Your weekly driver scorecard'
    : `You ranked ${rank} of ${totalDrivers} this week`;

  const line = noActivity
    ? `Hi ${firstName}, no driving recorded last week.`
    : `Hi ${firstName}, you ranked ${rank} of ${totalDrivers} this week.`;

  const text = `${line}\n\nView your full scorecard: ${reportUrl}\n\n—\nUnsubscribe from these emails: ${unsubscribeUrl}`;

  const safeLine = escapeHtml(line);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:16px;line-height:1.5;color:#18181b;">${safeLine}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 28px;">
          <a href="${reportUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">View full scorecard</a>
        </td></tr>
        <tr><td style="padding:0 28px 24px;border-top:1px solid #f4f4f5;">
          <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#a1a1aa;">You're receiving this because your fleet manager enabled weekly driver scorecards. <a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
