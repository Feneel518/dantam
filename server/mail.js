import nodemailer from 'nodemailer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { production } from './config.js';
import { id } from './security.js';
export async function sendMail(to, subject, text) {
  if (!process.env.SMTP_HOST) {
    if (production) throw new Error('Email delivery is not configured.');
    mkdirSync('data/mail', { recursive: true });
    writeFileSync(`data/mail/${id()}.json`, JSON.stringify({ to, subject, text }, null, 2), { mode: 0o600 });
    return;
  }
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465, connectionTimeout:10000, greetingTimeout:10000, socketTimeout:20000, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}
