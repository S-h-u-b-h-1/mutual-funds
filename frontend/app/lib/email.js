// Transactional email helper (password reset). Separate from Auth.js's built-in Resend
// provider in auth.js — that one only handles its own magic-link sign-in flow (raw fetch,
// no SDK). This uses the Resend SDK directly for app-triggered mail outside that flow.
import { Resend } from "resend";

export const hasResendKey = Boolean(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "MF Pulse <no-reply@mf-pulse.app>";

let client;
function getClient() {
  if (!hasResendKey) throw new Error("RESEND_API_KEY is not set — email sending unavailable.");
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const client = getClient();
  await client.emails.send({
    from: FROM,
    to,
    subject: "Reset your MF Pulse password",
    html: `<p>Someone requested a password reset for this email address.</p>
<p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
    text: `Reset your MF Pulse password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}
