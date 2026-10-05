import { all, one, run, transaction } from './db.js';
import { decrypt, encrypt, id, now } from './security.js';
import { plans } from './config.js';
import { connection, googleRequest, sendWhatsApp } from './providers.js';
import { sendMail } from './mail.js';
import { appUrl } from './config.js';

export function paid(clinic) {
  const settings = JSON.parse(clinic.data || '{}');
  const entitled = clinic.billing_status === 'active' ||
    (clinic.billing_status === 'complimentary' && settings.complimentaryAccess === true && !settings.demo) ||
    (clinic.billing_status === 'testing' && settings.demo === true && settings.testAccess === true);
  return entitled && plans[clinic.plan]?.reviews && clinic.paid_until && clinic.paid_until > now();
}
export async function event(clinicId, action) {
  await run('INSERT INTO events(id,clinic_id,action,created_at) VALUES(?,?,?,?)', [id(), clinicId, action, now()]);
}
export const needsAttention = text => /[^\x00-\x7F]|pain|bleed|infection|treatment|root canal|implant|surgery|diagnos|refund|complaint|rude|terrible|bad|poor|not happy|disappoint|worst|expensive|overcharg|legal|lawyer|privacy|patient|tooth|teeth|cavity|extraction|braces|medicine|prescri|but |however|unhappy|hurt|unsafe/i.test(text);
export const reviewDraft = clinicName => `Thank you for sharing your feedback. We appreciate the time you took to write a review. For any questions or feedback you would like to discuss privately, please contact ${clinicName} directly.`;
export async function queueJob({ clinicId, patientId = null, kind, data = {}, dueAt = now(), key }) {
  await run('INSERT INTO jobs(id,clinic_id,patient_id,kind,data,due_at,state,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    [key || id(), clinicId, patientId, kind, encrypt(data), dueAt, 'pending', now()]);
}
export async function schedulePatient(clinic, patient, appointment) {
  if (!paid(clinic) || !patient.consent) return;
  const settings = JSON.parse(clinic.data);
  if (settings.demo) return;
  if (appointment?.status === 'booked' && settings.reminders) {
    const dueAt = new Date(new Date(appointment.starts_at).getTime() - 24 * 3600000).toISOString();
    if (dueAt > now()) await queueJob({ clinicId: clinic.id, patientId: patient.id, kind: 'reminder', data: { appointmentId: appointment.id }, dueAt, key: `reminder:${appointment.id}:${appointment.starts_at}` });
  }
  if (appointment?.status === 'attended' && settings.reviewRequests && settings.reviewUrl) {
    await queueJob({ clinicId: clinic.id, patientId: patient.id, kind: 'review', data: { appointmentId: appointment.id },
      dueAt: new Date(Date.now() + 2 * 3600000).toISOString(), key: `review:${appointment.id}` });
  }
  if (patient.recall_date && settings.recalls) {
    await queueJob({ clinicId: clinic.id, patientId: patient.id, kind: 'recall', data: { recallDate: patient.recall_date },
      dueAt: new Date(`${patient.recall_date}T04:30:00Z`).toISOString(), key: `recall:${patient.id}:${patient.recall_date}` });
  }
}
export async function syncReviews(clinic) {
  const settings = JSON.parse(clinic.data), google = await connection(clinic.id, 'google');
  if (settings.demo) return;
  if (!google?.location || !paid(clinic)) return;
  const parent = `${google.account}/${google.location}`;
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc', ...(pageToken ? { pageToken } : {}) });
    const data = await googleRequest(clinic.id, `https://mybusiness.googleapis.com/v4/${parent}/reviews?${params}`);
    for (const review of data.reviews || []) {
      if (new Date(review.updateTime).getTime() < Date.now() - 29 * 86400000) continue;
      const key = `${clinic.id}:${review.reviewId}`;
      const rating = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[review.starRating] || 0;
      const sensitive = rating < 4 || needsAttention(review.comment || '');
      const old = await one('SELECT * FROM reviews WHERE id=? AND clinic_id=?', [key, clinic.id]);
      const status = review.reviewReply ? 'replied' : old?.status === 'replied' ? 'replied' : sensitive ? 'attention' : 'ready';
      await run('INSERT INTO reviews(id,clinic_id,data,rating,reply,status,fetched_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,rating=excluded.rating,reply=excluded.reply,status=excluded.status,fetched_at=excluded.fetched_at',
        [key, clinic.id, JSON.stringify({ reviewId: review.reviewId, name: review.reviewer?.displayName || 'Google reviewer', comment: review.comment || '', updateTime: review.updateTime }), rating,
          review.reviewReply?.comment || old?.reply || reviewDraft(clinic.name), status, now()]);
      if (status === 'ready' && settings.autoReplies && settings.googleConsentAt) {
        await queueJob({ clinicId: clinic.id, kind: 'googleReply', data: { reviewId: key }, key: `reply:${key}` });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  await event(clinic.id, 'Google reviews refreshed');
}
export async function publishReply(clinic, review, reply) {
  const google = await connection(clinic.id, 'google');
  if (!google?.location) throw new Error('Choose a Google location first.');
  const data = JSON.parse(review.data);
  await googleRequest(clinic.id, `https://mybusiness.googleapis.com/v4/${google.account}/${google.location}/reviews/${data.reviewId}/reply`, { method: 'PUT', body: JSON.stringify({ comment: reply }) });
  await run('UPDATE reviews SET reply=?,status=? WHERE id=? AND clinic_id=?', [reply, 'replied', review.id, clinic.id]);
  await event(clinic.id, 'A review reply was published');
}
export async function processJobs({deadline=Infinity}={}) {
  const jobs = await all("SELECT * FROM jobs WHERE state='pending' AND due_at<=? ORDER BY due_at LIMIT 30", [now()]);
  for (const job of jobs) {
    if(Date.now()>=deadline)break;
    if (!await run("UPDATE jobs SET state='sending',attempts=attempts+1,updated_at=? WHERE id=? AND state='pending'", [now(), job.id])) continue;
    try {
      const clinic = await one('SELECT * FROM clinics WHERE id=?', [job.clinic_id]);
      if (!clinic) throw new Error('Clinic no longer exists.');
      const settings = JSON.parse(clinic.data);
      if (settings.demo) throw new Error('Demo clinics cannot send live messages or publish replies.');
      if (job.kind === 'ownerAlert') {
        const owner = await one('SELECT email,verified FROM users WHERE id=?', [clinic.user_id]);
        if (!owner?.verified) throw new Error('Clinic owner email is not verified.');
        await sendMail(owner.email, `New appointment request for ${clinic.name}`, `A new website appointment request is waiting in your Dantam workspace.\n\nOpen ${appUrl}/app/requests to review and contact the patient. A request is not a confirmed appointment.`);
        await run("UPDATE jobs SET state='sent',updated_at=? WHERE id=?", [now(), job.id]); continue;
      }
      if (!paid(clinic)) throw new Error('An active paid subscription is required.');
      const data = decrypt(job.data);
      if (job.kind === 'googleReply') {
        const review = await one('SELECT * FROM reviews WHERE id=? AND clinic_id=?', [data.reviewId, clinic.id]);
        if (!settings.autoReplies || !settings.googleConsentAt || !review || review.status !== 'ready' || review.rating < 4 || needsAttention(JSON.parse(review.data).comment)) {
          await run("UPDATE jobs SET state='cancelled',updated_at=? WHERE id=?", [now(), job.id]); continue;
        }
        await publishReply(clinic, review, review.reply);
        await run("UPDATE jobs SET state='sent',updated_at=? WHERE id=?", [now(), job.id]); continue;
      }
      const patient = await one('SELECT * FROM patients WHERE id=? AND clinic_id=?', [job.patient_id, clinic.id]);
      if (!patient?.consent) { await run("UPDATE jobs SET state='cancelled',error='Patient has opted out',updated_at=? WHERE id=?", [now(), job.id]); continue; }
      const p = decrypt(patient.data);
      let params;
      if (job.kind === 'reminder' || job.kind === 'review') {
        const appt = await one('SELECT * FROM appointments WHERE id=? AND clinic_id=?', [data.appointmentId, clinic.id]);
        const enabled = job.kind === 'reminder' ? settings.reminders : settings.reviewRequests;
        if (!enabled || !appt || (job.kind === 'reminder' ? appt.status !== 'booked' || appt.starts_at <= now() : appt.status !== 'attended')) {
          await run("UPDATE jobs SET state='cancelled',updated_at=? WHERE id=?", [now(), job.id]); continue;
        }
        params = job.kind === 'reminder' ? [p.name, clinic.name, new Date(appt.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })] : [p.name, clinic.name, settings.reviewUrl];
      } else if (job.kind === 'recall') {
        if (!settings.recalls || patient.recall_date !== data.recallDate) { await run("UPDATE jobs SET state='cancelled',updated_at=? WHERE id=?", [now(), job.id]); continue; }
        params = [p.name, clinic.name, `${process.env.APP_URL || 'http://localhost:3000'}/c/${clinic.slug}`];
      } else throw new Error('Unknown message workflow.');
      // Send only 09:00–19:00 India time. Keep overnight messages pending for the next morning.
      const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
      if (hour < 9 || hour >= 19) {
        await run("UPDATE jobs SET state='pending',due_at=?,updated_at=? WHERE id=?", [new Date(Date.now() + 3600000).toISOString(), now(), job.id]); continue;
      }
      if (!settings.messagingConsentAt) throw new Error('Enable messaging with clinic authorisation first.');
      // In-flight and ambiguous deliveries count against the allowance too.
      const providerId = await processMessage(clinic, job, p.phone, params);
      await run("UPDATE jobs SET state='sent',provider_id=?,error=NULL,updated_at=? WHERE id=?", [providerId || null, now(), job.id]);
      await event(clinic.id, `${job.kind === 'recall' ? 'Patient recall' : job.kind === 'review' ? 'Review request' : 'Appointment reminder'} accepted by WhatsApp`);
    } catch (error) {
      await run('UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=?', [error.uncertain || job.kind === 'ownerAlert' ? 'needs_review' : 'failed', error.message.slice(0, 250), now(), job.id]);
    }
  }
}
async function processMessage(clinic, job, phone, params) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const reservation = id();
  await transaction(async tx => {
    // Lock the clinic row to serialize allowance reservations across workers.
    await tx.run('UPDATE clinics SET name=name WHERE id=?', [clinic.id]);
    const usage = await tx.one('SELECT COUNT(*) AS n FROM message_usage WHERE clinic_id=? AND created_at>=?', [clinic.id, start.toISOString()]);
    if (Number(usage.n) >= plans[clinic.plan].messages) throw new Error('Monthly message allowance reached. Upgrade your plan or wait for the next month.');
    await tx.run('INSERT INTO message_usage(id,clinic_id,job_id,created_at) VALUES(?,?,?,?)', [reservation, clinic.id, job.id, now()]);
  });
  try { return await sendWhatsApp(clinic.id, phone, job.kind, params); }
  catch (error) { if (!error.uncertain) await run('DELETE FROM message_usage WHERE id=?', [reservation]); throw error; }
}
export async function maintenance() {
  const stamp = now();
  await run('DELETE FROM sessions WHERE expires_at<?', [stamp]);
  await run('DELETE FROM tokens WHERE expires_at<?', [stamp]);
  await run('DELETE FROM rate_limits WHERE expires_at<?', [stamp]);
  await run('DELETE FROM reviews WHERE fetched_at<?', [new Date(Date.now() - 29 * 86400000).toISOString()]);
  // Crashed deliveries cannot be safely sent again without checking provider history.
  await run("UPDATE jobs SET state='needs_review',error='Worker interrupted. Check provider delivery before retrying.',updated_at=? WHERE state='sending' AND updated_at<?", [stamp, new Date(Date.now() - 10 * 60000).toISOString()]);
}
