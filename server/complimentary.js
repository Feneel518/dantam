import { one, run } from './db.js';
import { now } from './security.js';

// Operator-controlled, fixed-duration access. Never accept grants from a client.
export async function applyComplimentaryAccess(user, clinic) {
  const emails = (process.env.COMPLIMENTARY_ACCESS_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const end = process.env.COMPLIMENTARY_ACCESS_UNTIL;
  const settings = JSON.parse(clinic.data);
  if (!user.verified || clinic.user_id !== user.id || !emails.includes(user.email.toLowerCase()) ||
      !end || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.now() ||
      settings.demo || settings.complimentaryAccess || clinic.subscription_id || clinic.billing_status !== 'inactive') return clinic;
  const expires = new Date(end).toISOString();
  await run("UPDATE clinics SET data=?,plan='pro',billing_status='complimentary',paid_until=? WHERE id=? AND data=? AND billing_status='inactive' AND subscription_id IS NULL",
    [JSON.stringify({ ...settings, complimentaryAccess: true, complimentaryGrantedAt: now() }), expires, clinic.id, clinic.data]);
  return await one('SELECT * FROM clinics WHERE id=?', [clinic.id]);
}
