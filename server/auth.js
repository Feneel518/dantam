import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import { authDatabase, transaction, withDatabaseAccess } from './db.js';
import { appUrl, encryptionKey, production } from './config.js';
import { passwordHash, passwordMatches, id } from './security.js';
import { createHmac } from 'node:crypto';

if (production && (process.env.BETTER_AUTH_SECRET || '').length < 32) throw new Error('Production requires BETTER_AUTH_SECRET (at least 32 characters).');
const options = {
  appName: 'Dantam', baseURL: appUrl, basePath: '/api/identity',
  secret: process.env.BETTER_AUTH_SECRET || createHmac('sha256', encryptionKey).update('dantam-auth-v1').digest('hex'),
  database: authDatabase, trustedOrigins: [new URL(appUrl).origin],
  user: { modelName: 'auth_user' }, account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },
  session: { modelName: 'auth_session', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128,
    password: { hash: passwordHash, verify: ({ password, hash }) => passwordMatches(password, hash) } },
  advanced: { cookiePrefix: 'dantam', useSecureCookies: production },
};
// Additive migration: original clinic and patient tables are preserved.
await (await getMigrations(options)).runMigrations();
export const identity = betterAuth(options);
export const authApi = (method, args) => withDatabaseAccess(() => identity.api[method](args));

// Import existing credentials on first sign-in. Keep IDs stable for clinic ownership.
export async function ensureIdentity(user) {
  await transaction(async tx => {
    const existing = await tx.one('SELECT id FROM auth_user WHERE id=?', [user.id]);
    if (existing) return;
    const stamp = new Date();
    const timestamp = process.env.DATABASE_URL ? stamp : stamp.getTime();
    await tx.run('INSERT INTO auth_user(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(?,?,?,?,?,?)', [user.id, user.email, user.email, Boolean(user.verified) ? (process.env.DATABASE_URL ? true : 1) : (process.env.DATABASE_URL ? false : 0), timestamp, timestamp]);
    await tx.run('INSERT INTO auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES(?,?,?,?,?,?,?)', [id(), user.id, 'credential', user.id, user.password, timestamp, timestamp]);
  });
}
export const requestHeaders = req => fromNodeHeaders(req.headers);
export function forwardCookies(response, res) {
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
}
export async function signIn(req, res, user, password) {
  await ensureIdentity(user);
  const response = await authApi('signInEmail', { body: { email: user.email, password }, headers: requestHeaders(req), asResponse: true });
  if (!response.ok) { const error = new Error('Email or password is incorrect.'); error.status = 401; throw error; }
  forwardCookies(response, res);
}
