import dotenv from 'dotenv';
// Match Vite's local override file without importing developer credentials in tests.
// Deployed environment variables always take precedence over files.
if (process.env.NODE_ENV !== 'test') dotenv.config({path:process.env.VERCEL ? '.env' : ['.env.local','.env'],quiet:true});
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
export const production = process.env.NODE_ENV === 'production';
export const prelaunch = process.env.LAUNCH_MODE === 'preview';
export const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
if (!production) mkdirSync('data', { recursive: true });
let key = process.env.ENCRYPTION_KEY;
if (!key && !production) {
  const path = 'data/development.key';
  key = existsSync(path) ? readFileSync(path, 'utf8').trim() : randomBytes(32).toString('hex');
  if (!existsSync(path)) writeFileSync(path, key, { mode: 0o600 });
}
if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('ENCRYPTION_KEY must contain 64 hex characters.');
if (production) {
  for (const name of ['DATABASE_URL', 'APP_URL', ...(!prelaunch ? ['SMTP_HOST', 'MAIL_FROM', 'SUPPORT_EMAIL', 'LEGAL_ENTITY', 'LEGAL_ADDRESS'] : [])]) {
    if (!process.env[name]) throw new Error(`Production requires ${name}. See .env.example.`);
  }
  if (!appUrl.startsWith('https://')) throw new Error('Production requires an HTTPS APP_URL.');
}
export const encryptionKey = Buffer.from(key, 'hex');
export const plans = {
  free: { name: 'Website', price: 0, messages: 0, reviews: false },
  growth: { name: 'Growth', price: 1999, messages: 300, reviews: true },
  pro: { name: 'Pro', price: 2999, messages: 1000, reviews: true },
};
