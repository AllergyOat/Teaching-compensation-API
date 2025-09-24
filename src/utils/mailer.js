import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: Number(env.SMTP_PORT) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    // Fallback for dev: just print the email
    console.log('\n------ EMAIL (dev fallback) ------');
    console.log('To: ', to);
    console.log('Subject: ', subject);
    console.log('Text: ', text || '');
    console.log('HTML: ', html || '');
    console.log('----------------------------------\n');
    return;
  }
  await transporter.sendMail({
    from: env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject,
    text,
    html
  });
}
