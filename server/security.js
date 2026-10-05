import { scrypt, randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { encryptionKey } from './config.js';
const derive = promisify(scrypt);
export const id = () => randomBytes(16).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}
export function encrypt(data) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join('.');
}
export function decrypt(data) {
  const [iv, tag, encrypted] = data.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString());
}
export function validSignature(body, signature, secret) {
  if (typeof body !== 'string' && !Buffer.isBuffer(body)) return false;
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const phoneHash = phone => createHmac('sha256', encryptionKey).update(phone).digest('hex');
