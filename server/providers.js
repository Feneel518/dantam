import { one, run } from './db.js';
import { encrypt, decrypt, id, now } from './security.js';
import { appUrl } from './config.js';

export class ProviderError extends Error {
  constructor(message, uncertain = false) { super(message); this.uncertain = uncertain; }
}
export async function remote(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); }
  catch { throw new ProviderError('Provider did not confirm delivery. Check the provider before retrying.', options.method !== undefined && options.method !== 'GET'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderError(`Provider rejected the request (${response.status}). Check connection permissions and template settings.`, response.status >= 500 && options.method !== undefined && options.method !== 'GET');
  return data;
}
export async function connection(clinicId, provider) {
  const row = await one('SELECT * FROM connections WHERE clinic_id=? AND provider=?', [clinicId, provider]);
  return row ? decrypt(row.data) : null;
}
export async function saveConnection(clinicId, provider, data) {
  await run('INSERT INTO connections(id,clinic_id,provider,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(clinic_id,provider) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at', [id(), clinicId, provider, encrypt(data), now()]);
}
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const billingConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
export function googleAuthorize(state) {
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${appUrl}/api/google/callback`,
    response_type: 'code', scope: 'https://www.googleapis.com/auth/business.manage', access_type: 'offline', prompt: 'consent', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export async function exchangeGoogle(code) {
  return remote('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${appUrl}/api/google/callback`, grant_type: 'authorization_code' }) });
}
export async function googleRequest(clinicId, url, options = {}) {
  let token = await connection(clinicId, 'google');
  if (!token) throw new ProviderError('Connect your Google Business Profile first.');
  if (token.expires_at < Date.now() + 60000) {
    const refreshed = await remote('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: token.refresh_token, grant_type: 'refresh_token' }) });
    token = { ...token, access_token: refreshed.access_token, expires_at: Date.now() + refreshed.expires_in * 1000 };
    await saveConnection(clinicId, 'google', token);
  }
  return remote(url, { ...options, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', ...options.headers } });
}
export async function googleLocations(clinicId) {
  const result = []; let pageToken;
  do {
    const accounts = await googleRequest(clinicId, `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?${new URLSearchParams(pageToken ? { pageToken } : {})}`);
    for (const account of accounts.accounts || []) {
      let locationToken;
      do {
        const params = new URLSearchParams({ readMask: 'name,title,storefrontAddress,phoneNumbers,websiteUri,metadata', pageSize: '100', ...(locationToken ? { pageToken: locationToken } : {}) });
        const locations = await googleRequest(clinicId, `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?${params}`);
        result.push(...(locations.locations || []).map(location => ({ ...location, account: account.name })));
        locationToken = locations.nextPageToken;
      } while (locationToken);
    }
    pageToken = accounts.nextPageToken;
  } while (pageToken);
  return result;
}
export async function razorpay(path, body, method = 'POST') {
  if (!billingConfigured()) throw new ProviderError('Subscriptions are not available until the platform billing account is configured.');
  return remote(`https://api.razorpay.com/v1/${path}`, { method, headers: {
    Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
export async function sendWhatsApp(clinicId, phone, kind, params) {
  const settings = await connection(clinicId, 'whatsapp');
  if (!settings?.token || !settings?.phoneId || !settings.templates?.[kind]) throw new ProviderError(`Configure WhatsApp and the approved ${kind} template first.`);
  const result = await remote(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/${settings.phoneId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace('+', ''), type: 'template', template: {
      name: settings.templates[kind], language: { code: settings.language || 'en' }, components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] } }) });
  if (!result.messages?.[0]?.id) throw new ProviderError('WhatsApp did not return a delivery identifier. Check the provider before retrying.', true);
  return result.messages[0].id;
}
