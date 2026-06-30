import nodemailer from 'nodemailer';

const DEFAULT_TO = 'lapeuffe@gmail.com';

export async function emailReport(report: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM ?? user;
  const to = process.env.EMAIL_TO ?? DEFAULT_TO;

  if (!host || !user || !pass || !from) {
    console.log('\n\x1b[33mEmail skipped: missing SMTP settings.\x1b[0m');
    console.log('Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM first.\n');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const cleanReport = stripAnsi(report);

  await transporter.sendMail({
    from,
    to,
    subject: `Compa Cana Craft Flower Report · ${new Date().toLocaleDateString('en-CA')}`,
    text: cleanReport,
    html: toHtml(cleanReport)
  });

  console.log(`\n\x1b[32mEmail sent to ${to}\x1b[0m\n`);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toHtml(report: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#111;color:#f7f1e8;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:760px;margin:auto;background:#1b1b1b;border:1px solid #333;border-radius:18px;padding:24px;">
      <h1 style="margin-top:0;color:#9cff6a;">Compa Cana Craft Flower Report</h1>
      <p style="color:#bdb7ad;">Craft cannabis flower only. Kief, hash, edibles, pre-rolls, vapes, and extracts are excluded.</p>
      <pre style="white-space:pre-wrap;line-height:1.55;font-size:14px;color:#f7f1e8;background:#121212;border-radius:14px;padding:18px;overflow:auto;">${escapeHtml(report)}</pre>
    </div>
  </body>
</html>`;
}
