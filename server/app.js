import express from 'express';
import { authApi, signIn, requestHeaders, forwardCookies } from './auth.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { all, one, run, transaction } from './db.js';
import { id, hash, now, passwordHash, passwordMatches, encrypt, decrypt, phoneHash, validSignature, escapeHtml } from './security.js';
import { appUrl, production, plans, prelaunch } from './config.js';
import { sendMail } from './mail.js';
import { connection, saveConnection, googleConfigured, billingConfigured, googleAuthorize, exchangeGoogle, googleLocations, googleRequest, razorpay, remote } from './providers.js';
import { paid, event, schedulePatient, syncReviews, publishReply, queueJob } from './workflows.js';
import { accountSchema, loginSchema, clinicSchema, patientSchema, bookingSchema, appointmentSchema, appointmentUpdate } from './validation.js';
import { clinicSite, bookingScript } from './public-site.js';
import { mountCare, careWorkspace, audit } from './care.js';
import { updateAppointment } from './appointments.js';
import { workerCycle } from './worker-cycle.js';
import { renderTemplate, templateNames, treatmentSlug } from './templates.js';
import { clinicOpeningHours, slotsForDate } from '../shared/operating-hours.js';
import { mountMissedCalls } from './missed-calls.js';
import { mountPlatform, isPlatformAdmin } from './platform.js';
import { applyComplimentaryAccess } from './complimentary.js';

export const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: production ? ["'self'"] : ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'], connectSrc: production ? ["'self'"] : ["'self'", 'ws://localhost:*'], frameSrc: ["'self'"], upgradeInsecureRequests: production ? [] : null } }, crossOriginEmbedderPolicy: false }));
app.use(cookieParser());
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
async function limit(req, prefix, max = 15, minutes = 15) {
  const bucket = Math.floor(Date.now() / (minutes * 60000));
  const key = `${prefix}:${hash(req.ip || 'unknown')}:${bucket}`;
  await run('INSERT INTO rate_limits(id,count,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET count=rate_limits.count+1', [key, 1, new Date((bucket + 2) * minutes * 60000).toISOString()]);
  const row = await one('SELECT count FROM rate_limits WHERE id=?', [key]);
  if (row.count > max) fail(429, 'Too many requests. Please try again later.');
}
async function auth(req, res, next) {
  const response = await authApi('getSession', { headers: requestHeaders(req), asResponse: true });
  forwardCookies(response, res);
  const session = await response.json();
  const user = session?.user && await one('SELECT * FROM users WHERE id=?', [session.user.id]);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.authSession = session.session; req.user = user;
  req.clinic = await one('SELECT * FROM clinics WHERE user_id=?', [user.id]);
  req.role = req.clinic ? 'owner' : null;
  if (!req.clinic) { const member = await one('SELECT * FROM memberships WHERE user_id=?',[user.id]); if(member){req.clinic=await one('SELECT * FROM clinics WHERE id=?',[member.clinic_id]);req.role=member.role;} }
  if (!req.clinic) return res.status(403).json({error:'Your clinic access is no longer available.'});
  if (req.role === 'owner') req.clinic = await applyComplimentaryAccess(user, req.clinic);
  if (req.role !== 'owner') {
    const allowed = /^\/api\/(workspace$|care(?:\/|$)|patients(?:\/|$)|appointments(?:\/|$)|leads(?:\/|$)|lead-details\/|visit-details\/|auth\/(logout|sessions|revoke-others|resend)$)/.test(req.path);
    if (!allowed) return res.status(403).json({error:'Only the clinic owner can access this section.'});
    if(req.method==='DELETE' && !req.path.startsWith('/api/auth/'))return res.status(403).json({error:'Only the clinic owner can delete records.'});
    if(req.role==='receptionist' && req.method==='PATCH' && req.path.startsWith('/api/appointments/')){const visit=await one('SELECT revenue FROM appointments WHERE id=? AND clinic_id=?',[req.params.id,req.clinic.id]);req.body.revenue=visit?.revenue||0;}
  }
  next();
}
function requirePaid(req) { if (!paid(req.clinic)) fail(402, 'An active Growth or Pro subscription is required for this feature.'); if (JSON.parse(req.clinic.data).demo) fail(400, 'Demo clinics cannot make live Google changes. Create your own clinic account.'); }
async function sendAccountLink(user, kind) {
  const token = id() + id();
  await run('INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)', [hash(token), user.id, kind, new Date(Date.now() + (kind === 'verify' ? 24 * 3600000 : 3600000)).toISOString()]);
  await sendMail(user.email, kind === 'verify' ? 'Verify your Dantam email' : 'Reset your Dantam password', `${kind === 'verify' ? 'Verify your email to publish your clinic website' : 'Reset your password'}: ${appUrl}/${kind}?token=${token}\n\nIf you did not request this, ignore this email.`);
}

// Signatures are validated against the exact bytes before JSON parsing.
mountMissedCalls(app,express);
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json', limit: '200kb' }), async (req, res) => {
  if (!validSignature(req.body, req.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET)) fail(401, 'Invalid webhook signature.');
  const data = JSON.parse(req.body.toString());
  const subId = data.payload?.subscription?.entity?.id;
  const eventId = req.get('x-razorpay-event-id');
  if (!eventId || eventId.length > 250) fail(400, 'Missing event identifier.');
  if (await one('SELECT id FROM webhook_events WHERE id=?', [`razorpay:${eventId}`])) return res.json({ received: true });
  if (subId) {
    const clinic = await one('SELECT * FROM clinics WHERE subscription_id=?', [subId]);
    if (clinic) await refreshBilling(clinic); // Fetch current provider state; stale/reordered events cannot restore an old subscription.
  }
  await run('INSERT INTO webhook_events(id,created_at) VALUES(?,?) ON CONFLICT(id) DO NOTHING', [`razorpay:${eventId}`, now()]);
  res.json({ received: true });
});
app.get('/api/webhooks/whatsapp', (req, res) => {
  if (!process.env.META_WEBHOOK_VERIFY_TOKEN || req.query['hub.mode'] !== 'subscribe' || req.query['hub.verify_token'] !== process.env.META_WEBHOOK_VERIFY_TOKEN) return res.sendStatus(403);
  res.type('text').send(String(req.query['hub.challenge'] || ''));
});
app.post('/api/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '200kb' }), async (req, res) => {
  const signature = req.get('x-hub-signature-256')?.replace(/^sha256=/, '');
  if (!validSignature(req.body, signature, process.env.META_APP_SECRET)) fail(401, 'Invalid webhook signature.');
  const payload = JSON.parse(req.body.toString());
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value;
    for (const status of value?.statuses || []) {
      if (['delivered', 'read', 'failed'].includes(status.status)) {
        const eligible = status.status === 'read' ? "('sent','delivered')" : "('sent')";
        await run(`UPDATE jobs SET state=?,error=? WHERE provider_id=? AND state IN ${eligible}`, [status.status, status.status === 'failed' ? 'WhatsApp reported delivery failure.' : null, status.id]);
      }
    }
    for (const message of value?.messages || []) {
      if (/^(stop|unsubscribe|cancel|opt out|बंद)$/i.test((message.text?.body || '').trim())) {
        const connections = await all("SELECT * FROM connections WHERE provider='whatsapp'");
        for (const row of connections) if (decrypt(row.data).phoneId === value.metadata?.phone_number_id) {
          const patient = await one('SELECT id FROM patients WHERE clinic_id=? AND phone_hash=?', [row.clinic_id, phoneHash(`+${message.from}`)]);
          if (patient) {
            await run('UPDATE patients SET consent=0,consent_at=? WHERE id=? AND clinic_id=?', [now(), patient.id, row.clinic_id]);
            await run("UPDATE jobs SET state='cancelled' WHERE patient_id=? AND state='pending'", [patient.id]);
            await event(row.clinic_id, 'Patient messaging opt-out recorded');
          }
        }
      }
    }
  }
  res.json({ received: true });
});
app.use(express.json({ limit: '3mb' }));
app.use(async(req, res, next) => {
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method) && req.get('origin') !== new URL(appUrl).origin) {
    let allowed=false;const booking=req.path.match(/^\/c\/([^/]+)\/book$/);
    if(booking){try{const source=new URL(req.get('origin'));if(source.protocol==='https:'&&source.hostname===req.hostname)allowed=Boolean(await one('SELECT d.hostname FROM clinic_domains d JOIN clinics c ON c.id=d.clinic_id WHERE d.hostname=? AND d.verified_at IS NOT NULL AND c.slug=? AND c.published=1',[source.hostname,booking[1]]));}catch{}}
    if(!allowed)return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  next();
});
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/team/join',async(req,res,next)=>{await limit(req,'staff-join',10,60);next();});
app.get('/api/health', async (req, res) => { await one('SELECT 1 AS ok'); res.json({ status: 'ok' }); });
app.get('/api/public-config', (req,res)=>res.json({prelaunch}));
app.get('/api/cron',async(req,res)=>{
  if(!process.env.CRON_SECRET || hash(req.get('authorization')||'')!==hash(`Bearer ${process.env.CRON_SECRET}`))return res.sendStatus(401);
  const acquired=await transaction(async tx=>{await tx.run("INSERT INTO worker_runs(id,completed_at) VALUES('lock',?) ON CONFLICT(id) DO NOTHING",['1970-01-01T00:00:00Z']);return tx.run("UPDATE worker_runs SET completed_at=? WHERE id='lock' AND completed_at<?",[new Date(Date.now()+300000).toISOString(),now()]);});
  if(!acquired)return res.json({busy:true});
  try{await workerCycle();res.json({ok:true});}finally{await run("UPDATE worker_runs SET completed_at=? WHERE id='lock'",[now()]);}
});
mountCare(app,auth);
mountPlatform(app,auth);
app.get('/api/website-preview',auth,(req,res)=>{const settings=JSON.parse(req.clinic.data);const template=String(req.query.template||'gentle');if(!templateNames[template])return res.status(400).json({error:'Unknown template'});settings.website={...settings.website,template};res.type('html').send(renderTemplate({...req.clinic,data:JSON.stringify(settings)},true));});
app.get('/api/plans', (req, res) => res.json({ plans, billingAvailable: billingConfigured() }));
app.get('/demo', (req, res) => res.type('html').send(clinicSite({ name: 'The Smile Studio', slug: 'example-dental-demo', data: JSON.stringify({ city: 'Hyderabad', phone: '+919999000001', address: 'Example address, Jubilee Hills', doctor: 'Dr. Ananya Rao (fictional)', qualifications: 'BDS · Example qualification', registration: 'DEMO-ONLY', tagline: 'Good care. Familiar faces. Happier smiles.', about: 'A fictional dental practice showing how your clinic can look on Dantam. Replace these example details with your own team, services and story.', hours: 'Monday–Saturday, 10 am–7 pm', services: ['Dental consultation', 'Preventive dentistry', 'Restorative dentistry', 'Smile consultation'], colour: 'blue', demo:true, website:{template:templateNames[req.query.template]?req.query.template:'gentle'} }) }, true)));
app.post('/api/auth/register', async (req, res) => {
  if(prelaunch) fail(503,'Dantam is in launch preparation. New clinic registration opens after email and business details are configured.');
  await limit(req, 'register', 5, 60); const input = accountSchema.parse(req.body);
  if (await one('SELECT id FROM users WHERE email=?', [input.email])) fail(409, 'An account with this email already exists. Sign in or reset your password.');
  const userId = id(), clinicId = id();
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'clinic'}-${id().slice(0, 6)}`;
  const password = await passwordHash(input.password);
  const data = { city: input.city, phone: input.phone, address: '', doctor: '', qualifications: '', registration: '',
    tagline: 'Thoughtful care for your smile.', about: '', hours: '', services: ['Dental consultation', 'Preventive dentistry', 'Restorative dentistry'],
    reviewUrl: '', colour: 'lagoon', reminders: false, recalls: false, reviewRequests: false, autoReplies: false, website:{template:'gentle'} };
  await transaction(async tx => {
    await tx.run('INSERT INTO users(id,email,password,verified,created_at) VALUES(?,?,?,?,?)', [userId, input.email, password, 0, now()]);
    await tx.run('INSERT INTO clinics(id,user_id,slug,name,data,created_at) VALUES(?,?,?,?,?,?)', [clinicId, userId, slug, input.name, JSON.stringify(data), now()]);
  });
  let emailSent = true;
  try { await sendAccountLink({ id: userId, email: input.email }, 'verify'); } catch { emailSent = false; }
  await signIn(req, res, { id: userId, email: input.email, password, verified: 0 }, input.password); await event(clinicId, 'Clinic workspace created');
  res.status(201).json({ ok: true, emailSent });
});
app.post('/api/auth/login', async (req, res) => {
  await limit(req, 'login'); const input = loginSchema.parse(req.body);
  const user = await one('SELECT * FROM users WHERE email=?', [input.email]);
  const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
  const matches = await passwordMatches(input.password, user?.password || dummy);
  if (!user || !matches) fail(401, 'Email or password is incorrect.');
  await signIn(req, res, user, input.password); res.json({ ok: true });
});
app.post('/api/auth/logout', auth, async (req, res) => {
  forwardCookies(await authApi('signOut', { headers: requestHeaders(req), asResponse: true }), res); res.json({ ok: true });
});
app.get('/api/auth/sessions', auth, async (req, res) => {
  const sessions = await authApi('listSessions', { headers: requestHeaders(req) });
  res.json({ sessions: sessions.map(s => ({ id: s.id, current: s.id === req.authSession.id, createdAt: s.createdAt, expiresAt: s.expiresAt, userAgent: s.userAgent || 'Unknown browser' })) });
});
app.post('/api/auth/revoke-others', auth, async (req, res) => {
  await authApi('revokeOtherSessions', { headers: requestHeaders(req) }); res.json({ ok: true });
});
app.post('/api/auth/forgot', async (req, res) => {
  await limit(req, 'forgot', 5, 60); const email = z.email().parse(req.body.email).toLowerCase();
  const user = await one('SELECT * FROM users WHERE email=?', [email]);
  if (user) { try { await sendAccountLink(user, 'reset'); } catch { /* Generic response prevents email enumeration. */ } }
  res.json({ ok: true });
});
app.post('/api/auth/reset', async (req, res) => {
  await limit(req, 'reset', 10, 60);
  const input = z.object({ token: z.string().min(64).max(64), password: z.string().min(12).max(128) }).parse(req.body);
  const password = await passwordHash(input.password);
  await transaction(async tx => {
    const token = await tx.one('SELECT * FROM tokens WHERE token_hash=? AND kind=? AND expires_at>?', [hash(input.token), 'reset', now()]);
    if (!token) fail(400, 'This link has expired or has already been used. Request a new one.');
    if (!await tx.run('DELETE FROM tokens WHERE token_hash=?', [hash(input.token)])) fail(400, 'This link has already been used.');
    await tx.run('UPDATE users SET password=? WHERE id=?', [password, token.user_id]);
    await tx.run('UPDATE auth_account SET password=? WHERE "userId"=? AND "providerId"=?', [password, token.user_id, 'credential']);
    await tx.run('DELETE FROM auth_session WHERE "userId"=?', [token.user_id]);
    await tx.run('DELETE FROM sessions WHERE user_id=?', [token.user_id]);
    await tx.run('DELETE FROM tokens WHERE user_id=? AND kind=?', [token.user_id, 'reset']);
  });
  res.json({ ok: true });
});
app.post('/api/auth/verify', async (req, res) => {
  await limit(req, 'verify', 20, 60); const tokenHash = hash(z.string().length(64).parse(req.body.token));
  await transaction(async tx => {
    const token = await tx.one('SELECT * FROM tokens WHERE token_hash=? AND kind=? AND expires_at>?', [tokenHash, 'verify', now()]);
    if (!token) fail(400, 'This verification link has expired or has already been used.');
    if (!await tx.run('DELETE FROM tokens WHERE token_hash=?', [tokenHash])) fail(400, 'This link has already been used.');
    await tx.run('UPDATE users SET verified=1 WHERE id=?', [token.user_id]);
    await tx.run('UPDATE auth_user SET "emailVerified"=? WHERE id=?', [process.env.DATABASE_URL ? true : 1, token.user_id]);
  });
  res.json({ ok: true });
});
app.post('/api/auth/resend', auth, async (req, res) => { await limit(req, 'resend', 3, 60); if (!req.user.verified) await sendAccountLink(req.user, 'verify'); res.json({ ok: true }); });
function publicPatient(row) { return { id: row.id, ...decrypt(row.data), consent: Boolean(row.consent), consentAt: row.consent_at, consentSource: row.consent_source, recallDate: row.recall_date || '', createdAt: row.created_at }; }
app.get('/api/workspace', auth, async (req, res) => {
  const clinic = req.clinic;
  const [patients, appointments, leads, reviews, jobs, events, google, whatsapp] = await Promise.all([
    all('SELECT * FROM patients WHERE clinic_id=? ORDER BY created_at DESC', [clinic.id]), all('SELECT * FROM appointments WHERE clinic_id=? ORDER BY starts_at DESC', [clinic.id]),
    all('SELECT * FROM leads WHERE clinic_id=? ORDER BY created_at DESC', [clinic.id]), all('SELECT * FROM reviews WHERE clinic_id=? ORDER BY fetched_at DESC', [clinic.id]),
    all('SELECT id,kind,state,due_at,error,patient_id,updated_at FROM jobs WHERE clinic_id=? ORDER BY due_at DESC LIMIT 100', [clinic.id]),
    all('SELECT action,created_at FROM events WHERE clinic_id=? ORDER BY created_at DESC LIMIT 30', [clinic.id]), connection(clinic.id, 'google'), connection(clinic.id, 'whatsapp')]);
  const settings = JSON.parse(clinic.data);
  res.json({ ...(await careWorkspace(req)), demo: Boolean(settings.demo), user: { id:req.user.id, role:req.role, platformAdmin:isPlatformAdmin(req.user), email: req.user.email, verified: Boolean(req.user.verified) }, clinic: { id: clinic.id, slug: clinic.slug, name: clinic.name, ...settings,
    published: Boolean(clinic.published), plan: clinic.plan, billingStatus: clinic.billing_status, paidUntil: clinic.paid_until, subscriptionId: clinic.subscription_id, paid: Boolean(paid(clinic)) },
    patients: patients.map(publicPatient), appointments:appointments.map(a=>req.role==='receptionist'?{...a,revenue:0}:a), leads: leads.map(l => ({ id: l.id, ...decrypt(l.data), source: l.source, status: l.status, createdAt: l.created_at })),
    reviews: reviews.map(r => ({ id: r.id, ...JSON.parse(r.data), rating: r.rating, reply: r.reply, status: r.status })), jobs, events,
    integrations: { google: { available: googleConfigured(), connected: Boolean(google), location: google?.location, title: google?.title },
      whatsapp: { connected: Boolean(whatsapp?.token), phoneId: whatsapp?.phoneId || '', language: whatsapp?.language || 'en', templates: whatsapp?.templates || {} },
      billing: { available: billingConfigured() }, email: { available: Boolean(process.env.SMTP_HOST) } }, plans });
});
app.patch('/api/clinic', auth, async (req, res) => {
  const input = clinicSchema.parse(req.body), old = JSON.parse(req.clinic.data);
  if (input.autoReplies && (!paid(req.clinic) || (!old.googleConsentAt && !input.googleConsent))) fail(400, 'Choose a paid plan and explicitly authorise automatic Google replies first.');
  if ((input.reminders || input.recalls || input.reviewRequests) && (!paid(req.clinic) || (!old.messagingConsentAt && !input.messagingConsent))) fail(400, 'Choose a paid plan and authorise patient messages first.');
  const { name, googleConsent, messagingConsent, ...data } = input;
  data.openingHours = input.openingHours || old.openingHours || [];
  if(old.website)data.website=old.website;
  data.googleConsentAt = googleConsent ? now() : old.googleConsentAt || null;
  data.messagingConsentAt = messagingConsent ? now() : old.messagingConsentAt || null;
  data.clinicConfirmedAt = old.clinicConfirmedAt || null;
  if (old.demo) data.demo = true;
  if (old.testAccess) data.testAccess = true;
  if (old.complimentaryAccess) { data.complimentaryAccess = true; data.complimentaryGrantedAt = old.complimentaryGrantedAt; }
  await run('UPDATE clinics SET name=?,data=? WHERE id=?', [name, JSON.stringify(data), req.clinic.id]);
  const updated = { ...req.clinic, name, data: JSON.stringify(data) };
  const patients = await all('SELECT * FROM patients WHERE clinic_id=?', [updated.id]);
  for (const patient of patients) {
    await schedulePatient(updated, patient);
    const appointments = await all("SELECT * FROM appointments WHERE clinic_id=? AND patient_id=? AND status='booked' AND starts_at>?", [updated.id, patient.id, now()]);
    for (const appointment of appointments) await schedulePatient(updated, patient, appointment);
  }
  await event(req.clinic.id, 'Clinic settings updated'); await audit(req,'Clinic settings updated'); res.json({ ok: true });
});
app.post('/api/clinic/publish', auth, async (req, res) => {
  const publish = z.boolean().parse(req.body.publish);
  if (publish) {
    if (!req.user.verified) fail(400, 'Verify your email before publishing.');
    if (req.body.confirm !== true) fail(400, 'Confirm that you are authorised to represent this clinic and its details are accurate.');
    const data = JSON.parse(req.clinic.data);
    if (data.demo) fail(400, 'Demo clinics can preview all templates. Create your own clinic workspace to publish a real website.');
    for (const key of ['address', 'doctor', 'qualifications', 'registration', 'hours']) if (!data[key]?.trim()) fail(400, `Add your clinic ${key} before publishing.`);
    data.clinicConfirmedAt = now();
    await run('UPDATE clinics SET data=? WHERE id=?', [JSON.stringify(data), req.clinic.id]);
  }
  await run('UPDATE clinics SET published=? WHERE id=?', [publish ? 1 : 0, req.clinic.id]);
  await event(req.clinic.id, publish ? 'Clinic website published' : 'Clinic website unpublished'); res.json({ ok: true });
});
app.get('/api/clinic/preview', auth, (req, res) => res.type('html').send(clinicSite(req.clinic, true)));
app.get('/clinic-booking.js', (req, res) => res.type('application/javascript').send(bookingScript));
app.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /verify\nDisallow: /reset\nSitemap: ${appUrl}/sitemap.xml\n`));
app.get('/sitemap.xml', async (req, res) => {
  const clinics = await all('SELECT slug,data FROM clinics WHERE published=1');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(appUrl)}</loc></url>${clinics.map(c => {const d=JSON.parse(c.data);const services=d.website?.treatments?.length?d.website.treatments:(d.services||[]).map(name=>({slug:treatmentSlug(name),active:true}));return [ `${appUrl}/c/${c.slug}`, ...services.filter(s=>s.active).map(s=>`${appUrl}/c/${c.slug}/${s.slug}`) ].map(url=>`<url><loc>${escapeHtml(url)}</loc></url>`).join('')}).join('')}</urlset>`);
});
app.get('/c/:slug', async (req, res) => {
  const clinic = await one('SELECT * FROM clinics WHERE slug=? AND published=1', [req.params.slug]);
  if (!clinic) return res.status(404).type('html').send('<h1>Clinic website unavailable</h1><p>Please contact the clinic directly.</p>');
  res.type('html').send(clinicSite(clinic));
});
app.get('/c/:slug/:treatment',async(req,res)=>{
  const clinic=await one('SELECT * FROM clinics WHERE slug=? AND published=1',[req.params.slug]);if(!clinic)return res.status(404).send('Clinic not found');
  const c=JSON.parse(clinic.data),services=c.website?.treatments?.length?c.website.treatments:(c.services||[]).map(name=>({slug:treatmentSlug(name),active:true}));
  if(!services.some(s=>s.active&&s.slug===req.params.treatment))return res.status(404).send('Treatment page not found');
  res.type('html').send(clinicSite(clinic,false,req.params.treatment));
});
app.post('/c/:slug/book', async (req, res) => {
  await limit(req, 'booking', 5, 60); const input = bookingSchema.parse(req.body);
  if (input.website) return res.status(201).json({ ok: true });
  const clinic = await one('SELECT * FROM clinics WHERE slug=? AND published=1', [req.params.slug]);
  if (!clinic) fail(404, 'This clinic is not accepting online requests.');
  if (JSON.parse(clinic.data).demo) fail(400, 'This is a demonstration clinic and cannot accept appointment requests.');
  if (input.preferredTime && !slotsForDate(clinicOpeningHours(JSON.parse(clinic.data)), input.preferredDate).includes(input.preferredTime)) fail(400, 'Choose a time during the clinic’s opening hours.');
  const leadId = id();
  await run('INSERT INTO leads(id,clinic_id,data,source,status,created_at) VALUES(?,?,?,?,?,?)', [leadId, clinic.id, encrypt({ name: input.name, phone: input.phone, preferredDate: input.preferredDate, service: input.service,
    preferredTime:input.preferredTime||'',patientType:input.patientType||'new',consent: input.consent, consentAt: input.consent ? now() : null, consentSource: 'Clinic website appointment form' }), input.source || 'website', 'new', now()]);
  await queueJob({ clinicId: clinic.id, kind: 'ownerAlert', data: { leadId }, key: `ownerAlert:${leadId}` });
  await event(clinic.id, 'New website appointment request received'); res.status(201).json({ ok: true });
});
async function savePatient(clinicId, input, existingId) {
  if (input.consent && !input.consentSource?.trim()) fail(400, 'Record where the patient gave messaging permission.');
  const existing = existingId ? await one('SELECT * FROM patients WHERE id=? AND clinic_id=?', [existingId, clinicId]) : null;
  if (existingId && !existing) fail(404, 'Patient not found.');
  const patientId = existingId || id();
  const contact = { ...(existing ? decrypt(existing.data) : {}), name:input.name, phone:input.phone, ...Object.fromEntries(['email','dateOfBirth','gender'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])) };
  if (existingId) await run('UPDATE patients SET data=?,phone_hash=?,consent=?,consent_at=?,consent_source=?,recall_date=? WHERE id=? AND clinic_id=?',
    [encrypt(contact), phoneHash(input.phone), input.consent ? 1 : 0, input.consent ? existing?.consent_at || now() : now(), input.consentSource || '', input.recallDate || null, patientId, clinicId]);
  else await run('INSERT INTO patients(id,clinic_id,data,phone_hash,consent,consent_at,consent_source,recall_date,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [patientId, clinicId, encrypt(contact), phoneHash(input.phone), input.consent ? 1 : 0, input.consent ? now() : null, input.consentSource || '', input.recallDate || null, now()]);
  if (!input.consent) await run("UPDATE jobs SET state='cancelled' WHERE patient_id=? AND clinic_id=? AND state='pending'", [patientId, clinicId]);
  return await one('SELECT * FROM patients WHERE id=? AND clinic_id=?', [patientId, clinicId]);
}
app.post('/api/patients', auth, async (req, res) => { const patient = await savePatient(req.clinic.id, patientSchema.parse(req.body)); await schedulePatient(req.clinic, patient); await audit(req,'Patient created',patient.id); res.status(201).json({ id: patient.id }); });
app.patch('/api/patients/:id', auth, async (req, res) => { const patient = await savePatient(req.clinic.id, patientSchema.parse(req.body), req.params.id); await schedulePatient(req.clinic, patient); await audit(req,'Patient updated',patient.id); res.json({ ok: true }); });
app.delete('/api/patients/:id', auth, async (req, res) => {
  if (!await run('DELETE FROM patients WHERE id=? AND clinic_id=?', [req.params.id, req.clinic.id])) fail(404, 'Patient not found.');
  await audit(req,'Patient removed',req.params.id); await event(req.clinic.id, 'Patient record removed'); res.json({ ok: true });
});
app.post('/api/patients/import', auth, async (req, res) => {
  const records = z.array(patientSchema).min(1).max(500).parse(req.body.records);
  let imported = 0, skipped = 0;
  for (const record of records) {
    if (await one('SELECT id FROM patients WHERE clinic_id=? AND phone_hash=?', [req.clinic.id, phoneHash(record.phone)])) { skipped++; continue; }
    const patient = await savePatient(req.clinic.id, record); await schedulePatient(req.clinic, patient); imported++;
  }
  await event(req.clinic.id, `${imported} patient records imported`); res.json({ imported, skipped });
});
app.post('/api/leads/:id/book', auth, async (req, res) => {
  const input = appointmentSchema.omit({ patientId: true, leadId: true }).parse(req.body);
  if (input.doctorId && !JSON.parse(req.clinic.data).website?.doctors?.some(d => d.id === input.doctorId)) fail(400, 'Choose a clinic doctor.');
  const appointmentId = id();
  const patient = await transaction(async tx => {
    const lead = await tx.one('SELECT * FROM leads WHERE id=? AND clinic_id=?', [req.params.id, req.clinic.id]);
    if (!lead) fail(404, 'Enquiry not found.');
    if (await tx.one('SELECT id FROM appointments WHERE clinic_id=? AND lead_id=?', [req.clinic.id, lead.id])) fail(409, 'This enquiry already has an appointment. Open reception to manage it.');
    if (await tx.one("SELECT id FROM appointments WHERE clinic_id=? AND doctor_id=? AND starts_at=? AND status='booked'", [req.clinic.id, input.doctorId, input.startsAt])) fail(409, 'This time already has an appointment for this doctor. Choose another time.');
    const contact = decrypt(lead.data);
    let patient = await tx.one('SELECT * FROM patients WHERE clinic_id=? AND phone_hash=?', [req.clinic.id, phoneHash(contact.phone)]);
    if (!patient) {
      const patientId = id();
      await tx.run('INSERT INTO patients(id,clinic_id,data,phone_hash,consent,consent_at,consent_source,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [patientId, req.clinic.id, encrypt({ name: contact.name, phone: contact.phone }), phoneHash(contact.phone), contact.consent ? 1 : 0, contact.consentAt || null, contact.consentSource || '', now()]);
      patient = await tx.one('SELECT * FROM patients WHERE id=?', [patientId]);
    }
    await tx.run('INSERT INTO appointments(id,clinic_id,patient_id,lead_id,doctor_id,starts_at,status,created_at) VALUES(?,?,?,?,?,?,?,?)', [appointmentId, req.clinic.id, patient.id, lead.id, input.doctorId, input.startsAt, 'booked', now()]);
    await tx.run("UPDATE leads SET status='booked' WHERE id=? AND clinic_id=?", [lead.id, req.clinic.id]);
    await audit(req, 'Enquiry booked', appointmentId, tx);
    return patient;
  });
  await schedulePatient(req.clinic, patient, { id: appointmentId, starts_at: input.startsAt, status: 'booked' });
  await event(req.clinic.id, 'Appointment booked from enquiry');
  res.status(201).json({ id: appointmentId, patientId: patient.id, startsAt: input.startsAt });
});
app.post('/api/appointments', auth, async (req, res) => {
  const input = appointmentSchema.parse(req.body);
  if(input.doctorId && !JSON.parse(req.clinic.data).website?.doctors?.some(d=>d.id===input.doctorId))fail(400,'Choose a doctor from this clinic.');
  const patient = await one('SELECT * FROM patients WHERE id=? AND clinic_id=?', [input.patientId, req.clinic.id]);
  if (!patient) fail(404, 'Choose a patient from your clinic.');
  if (input.leadId && !await one('SELECT id FROM leads WHERE id=? AND clinic_id=?', [input.leadId, req.clinic.id])) fail(404, 'Appointment request not found.');
  const appointmentId = id();
  await transaction(async tx => {
    if (await tx.one("SELECT id FROM appointments WHERE clinic_id=? AND doctor_id=? AND starts_at=? AND status='booked'", [req.clinic.id, input.doctorId,input.startsAt])) fail(409, 'This time already has an appointment for this doctor. Choose another time.');
    if (input.leadId && await tx.one('SELECT id FROM appointments WHERE clinic_id=? AND lead_id=?', [req.clinic.id, input.leadId])) fail(409, 'This request already has an appointment.');
    await tx.run('INSERT INTO appointments(id,clinic_id,patient_id,lead_id,doctor_id,starts_at,status,created_at) VALUES(?,?,?,?,?,?,?,?)', [appointmentId, req.clinic.id, patient.id, input.leadId || null,input.doctorId, input.startsAt, 'booked', now()]);
    if (input.leadId) await tx.run('UPDATE leads SET status=? WHERE id=? AND clinic_id=?', ['booked', input.leadId, req.clinic.id]);
  });
  await schedulePatient(req.clinic, patient, { id: appointmentId, starts_at: input.startsAt, status: 'booked' });
  await audit(req,'Appointment booked',appointmentId); await event(req.clinic.id, 'Appointment booked'); res.status(201).json({ id: appointmentId });
});
app.patch('/api/appointments/:id', auth, async (req, res) => {
  const input = appointmentUpdate.parse(req.body);
  const appt = await one('SELECT * FROM appointments WHERE id=? AND clinic_id=?', [req.params.id, req.clinic.id]);
  if (!appt) fail(404, 'Appointment not found.');
  await updateAppointment(req.clinic, appt.id, { ...input, ...(req.role === 'receptionist' ? { revenue: appt.revenue } : {}) });
  await audit(req,`Appointment ${input.status}${input.startsAt&&input.startsAt!==appt.starts_at?' rescheduled':''}`,appt.id);
  await event(req.clinic.id, `Appointment marked ${input.status.replace('_', ' ')}`); res.json({ ok: true });
});
app.patch('/api/leads/:id', auth, async (req, res) => {
  const status = z.enum(['new','contacted','lost','closed']).parse(req.body.status);
  if (await one("SELECT id FROM appointments WHERE lead_id=? AND clinic_id=? AND status IN ('booked','attended')", [req.params.id, req.clinic.id])) fail(400, 'Manage the linked appointment in reception to change its booking status.');
  if (!await run('UPDATE leads SET status=? WHERE id=? AND clinic_id=?', [status, req.params.id, req.clinic.id])) fail(404, 'Request not found.'); res.json({ ok: true });
});
app.post('/api/google/connect', auth, async (req, res) => {
  if (JSON.parse(req.clinic.data).demo) fail(400, 'Create your own clinic workspace to connect a real business.');
  if (!googleConfigured()) fail(503, 'Google connection is not available until the platform API account is configured.');
  if (!req.user.verified) fail(400, 'Verify your email before connecting Google.');
  const state = id() + id();
  await run('INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)', [hash(state), req.user.id, `google:${hash(req.authSession.id)}`, new Date(Date.now() + 10 * 60000).toISOString()]);
  res.json({ url: googleAuthorize(state) });
});
app.get('/api/google/callback', auth, async (req, res) => {
  if (req.query.error) return res.redirect('/app/connections?google=cancelled');
  const state = z.string().length(64).parse(req.query.state);
  const token = await one('SELECT * FROM tokens WHERE token_hash=? AND user_id=? AND kind=? AND expires_at>?', [hash(state), req.user.id, `google:${hash(req.authSession.id)}`, now()]);
  if (!token || !await run('DELETE FROM tokens WHERE token_hash=?', [hash(state)])) fail(400, 'Connection request expired. Try again from your dashboard.');
  const data = await exchangeGoogle(z.string().min(1).max(3000).parse(req.query.code));
  if (!data.refresh_token) fail(400, 'Google did not provide offline access. Reconnect with consent.');
  await saveConnection(req.clinic.id, 'google', { ...data, expires_at: Date.now() + data.expires_in * 1000 });
  await event(req.clinic.id, 'Google account connected'); res.redirect('/app/connections?google=connected');
});
app.get('/api/google/locations', auth, async (req, res) => res.json({ locations: await googleLocations(req.clinic.id) }));
app.get('/api/google/setup', auth, async (req, res) => {
  const google = await connection(req.clinic.id, 'google');
  res.json({ configured: googleConfigured(), verified: Boolean(req.user.verified), demo: Boolean(JSON.parse(req.clinic.data).demo),
    redirectUri: `${appUrl}/api/google/callback`, connected: Boolean(google), location: google?.title || null,
    publicUrl: !['localhost', '127.0.0.1', '[::1]'].includes(new URL(appUrl).hostname) });
});
app.post('/api/google/test', auth, async (req, res) => {
  await limit(req, 'google-test', 5, 15);
  if (JSON.parse(req.clinic.data).demo) fail(400, 'Create your own clinic workspace to test your real business.');
  const google = await connection(req.clinic.id, 'google');
  if (!google?.location) fail(400, 'Connect Google and choose your business location first.');
  const profile = await googleRequest(req.clinic.id, `https://mybusinessbusinessinformation.googleapis.com/v1/${google.location}?readMask=title,websiteUri,phoneNumbers`);
  const result = { checkedAt: now(), profile: { title: profile.title, website: profile.websiteUri || '', phone: profile.phoneNumbers?.primaryPhone || '' }, reviews: { ok: false } };
  try {
    const reviews = await googleRequest(req.clinic.id, `https://mybusiness.googleapis.com/v4/${google.account}/${google.location}/reviews?pageSize=1`);
    result.reviews = { ok: true, count: reviews.totalReviewCount || 0, averageRating: reviews.averageRating || null };
  } catch (error) { result.reviews = { ok: false, error: error.message }; }
  res.json(result);
});
app.post('/api/google/location', auth, async (req, res) => {
  const location = z.string().regex(/^locations\/[\w-]+$/).parse(req.body.location);
  const locations = await googleLocations(req.clinic.id), selected = locations.find(l => l.name === location);
  if (!selected) fail(403, 'This Google location is not available to your account.');
  const data = await connection(req.clinic.id, 'google');
  await saveConnection(req.clinic.id, 'google', { ...data, location: selected.name, account: selected.account, title: selected.title });
  await run('DELETE FROM reviews WHERE clinic_id=?', [req.clinic.id]);
  await run("DELETE FROM jobs WHERE clinic_id=? AND kind='googleReply'", [req.clinic.id]);
  res.json({ ok: true });
});
app.get('/api/google/audit', auth, async (req, res) => {
  const token = await connection(req.clinic.id, 'google'); if (!token?.location) fail(400, 'Choose a Google location first.');
  const profile = await googleRequest(req.clinic.id, `https://mybusinessbusinessinformation.googleapis.com/v1/${token.location}?readMask=title,storefrontAddress,phoneNumbers,websiteUri,regularHours`);
  const data = JSON.parse(req.clinic.data);
  res.json({ profile, expected: { title: req.clinic.name, primaryPhone: data.phone, websiteUri: `${appUrl}/c/${req.clinic.slug}`, address: `${data.address}, ${data.city}` },
    changes: [{ field: 'phoneNumbers', current: profile.phoneNumbers?.primaryPhone || '', proposed: data.phone }, { field: 'websiteUri', current: profile.websiteUri || '', proposed: `${appUrl}/c/${req.clinic.slug}` }].filter(c => c.current !== c.proposed) });
});
app.post('/api/google/correct', auth, async (req, res) => {
  requirePaid(req); const fields = z.array(z.enum(['phoneNumbers','websiteUri'])).min(1).max(2).parse(req.body.fields);
  if (req.body.confirm !== true) fail(400, 'Approve the specific proposed corrections first.');
  const token = await connection(req.clinic.id, 'google'); if (!token?.location) fail(400, 'Choose a Google location first.');
  if (fields.includes('websiteUri') && !req.clinic.published) fail(400, 'Publish your website before adding its address to Google.');
  const data = JSON.parse(req.clinic.data), body = {};
  if (fields.includes('phoneNumbers')) body.phoneNumbers = { primaryPhone: data.phone };
  if (fields.includes('websiteUri')) body.websiteUri = `${appUrl}/c/${req.clinic.slug}`;
  await googleRequest(req.clinic.id, `https://mybusinessbusinessinformation.googleapis.com/v1/${token.location}?updateMask=${fields.join(',')}`, { method: 'PATCH', body: JSON.stringify(body) });
  await event(req.clinic.id, 'Approved Google profile corrections submitted'); res.json({ ok: true });
});
app.delete('/api/google/connect', auth, async (req, res) => {
  const google = await connection(req.clinic.id, 'google');
  if (google?.refresh_token) await remote('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: google.refresh_token }) });
  await run("DELETE FROM connections WHERE clinic_id=? AND provider='google'", [req.clinic.id]);
  await run('DELETE FROM reviews WHERE clinic_id=?', [req.clinic.id]);
  await run("DELETE FROM jobs WHERE clinic_id=? AND kind='googleReply'", [req.clinic.id]);
  await event(req.clinic.id, 'Google account disconnected'); res.json({ ok: true });
});
app.post('/api/reviews/sync', auth, async (req, res) => { requirePaid(req); await limit(req, 'sync', 5, 15); await syncReviews(req.clinic); res.json({ ok: true }); });
app.post('/api/reviews/:id/reply', auth, async (req, res) => {
  requirePaid(req); const reply = z.string().trim().min(10).max(1000).parse(req.body.reply);
  if (req.body.confirm !== true) fail(400, 'Approve this reply before publishing.');
  const review = await one('SELECT * FROM reviews WHERE id=? AND clinic_id=?', [req.params.id, req.clinic.id]);
  if (!review) fail(404, 'Review not found.');
  await publishReply(req.clinic, review, reply); res.json({ ok: true });
});
app.post('/api/whatsapp', auth, async (req, res) => {
  if(JSON.parse(req.clinic.data).testAccess) fail(400,'Live WhatsApp connections are disabled for this private test clinic. You can prepare manual drafts instead.');
  const input = z.object({ phoneId: z.string().regex(/^\d{6,30}$/), token: z.string().max(4000).optional(), language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
    templates: z.object({ reminder: z.string().regex(/^[a-z0-9_]{1,100}$/), review: z.string().regex(/^[a-z0-9_]{1,100}$/), recall: z.string().regex(/^[a-z0-9_]{1,100}$/) }) }).parse(req.body);
  const old = await connection(req.clinic.id, 'whatsapp');
  const token = input.token || old?.token; if (!token) fail(400, 'Enter your WhatsApp access token.');
  // Validate credentials before claiming the connection works.
  await remote(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/${input.phoneId}`, { headers: { Authorization: `Bearer ${token}` } });
  await saveConnection(req.clinic.id, 'whatsapp', { ...input, token });
  await event(req.clinic.id, 'WhatsApp connection saved'); res.json({ ok: true });
});
app.delete('/api/whatsapp', auth, async (req, res) => { await run("DELETE FROM connections WHERE clinic_id=? AND provider='whatsapp'", [req.clinic.id]); await run("UPDATE jobs SET state='cancelled' WHERE clinic_id=? AND kind IN ('reminder','review','recall') AND state='pending'", [req.clinic.id]); res.json({ ok: true }); });
app.post('/api/jobs/:id/retry', auth, async (req, res) => {
  const job = await one('SELECT kind FROM jobs WHERE id=? AND clinic_id=?', [req.params.id, req.clinic.id]);
  if (!job) fail(404, 'Message not found.');
  if (job.kind !== 'ownerAlert') requirePaid(req);
  if (req.body.confirm !== true) fail(400, 'Check the provider for an existing delivery and confirm before retrying.');
  if (!await run("UPDATE jobs SET state='pending',due_at=?,error=NULL,updated_at=? WHERE id=? AND clinic_id=? AND state IN ('failed','needs_review')", [now(), now(), req.params.id, req.clinic.id])) fail(404, 'This message cannot be retried.'); res.json({ ok: true });
});
app.post('/api/billing/subscribe', auth, async (req, res) => {
  if(JSON.parse(req.clinic.data).complimentaryAccess) fail(400,'Your complimentary access has no payment or automatic renewal. Checkout is disabled for this account.');
  if(JSON.parse(req.clinic.data).testAccess) fail(400,'This private test clinic is complimentary. Payments and automatic renewal are disabled.');
  if(prelaunch) fail(503,'Paid subscriptions open after launch setup is complete.');
  if (!req.user.verified) fail(400, 'Verify your email before subscribing.');
  const plan = z.enum(['growth','pro']).parse(req.body.plan);
  if (['creating','needs_review'].includes(req.clinic.billing_status)) fail(409, 'Subscription creation is awaiting confirmation. Contact support before trying again.');
  if (req.clinic.subscription_id && !['cancelled','completed','expired'].includes(req.clinic.billing_status)) fail(409, 'Cancel the existing subscription before starting a new one.');
  const planId = process.env[plan === 'growth' ? 'RAZORPAY_GROWTH_PLAN_ID' : 'RAZORPAY_PRO_PLAN_ID'];
  if (!planId) fail(503, 'This billing plan is not configured yet.');
  if (!billingConfigured()) fail(503, 'Billing is not configured yet.');
  const providerPlan = await razorpay(`plans/${planId}`, null, 'GET');
  if(providerPlan.period!=='monthly'||providerPlan.interval!==1||providerPlan.item?.currency!=='INR'||providerPlan.item?.amount!==plans[plan].price*100) fail(503,'The payment provider plan does not match the advertised monthly price. Contact platform support.');
  const claimed = await run("UPDATE clinics SET billing_status='creating' WHERE id=? AND billing_status IN ('inactive','cancelled','completed','expired')", [req.clinic.id]);
  if (!claimed) fail(409, 'A subscription is already being created or is active.');
  let result;
  try { result = await razorpay('subscriptions', { plan_id: planId, total_count: 120, quantity: 1, customer_notify: 1, notes: { clinic_id: req.clinic.id, plan } }); }
  catch (error) { await run('UPDATE clinics SET billing_status=? WHERE id=? AND billing_status=?', [error.uncertain ? 'needs_review' : 'inactive', req.clinic.id, 'creating']); throw error; }
  await run('UPDATE clinics SET subscription_id=?,billing_status=?,plan=? WHERE id=?', [result.id, 'created', plan, req.clinic.id]);
  res.json({ url: result.short_url });
});
async function refreshBilling(clinic) {
  const sub = await razorpay(`subscriptions/${clinic.subscription_id}`, null, 'GET');
  const plan = sub.plan_id === process.env.RAZORPAY_GROWTH_PLAN_ID ? 'growth' : sub.plan_id === process.env.RAZORPAY_PRO_PLAN_ID ? 'pro' : null;
  if (!plan) fail(400, 'Subscription does not match a configured plan.');
  const end = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
  await run('UPDATE clinics SET billing_status=?,plan=?,paid_until=? WHERE id=? AND subscription_id=?', [sub.status, plan, end, clinic.id, sub.id]);
  if (sub.status === 'active') {
    const updated = { ...clinic, plan, billing_status: sub.status, paid_until: end };
    const patients = await all('SELECT * FROM patients WHERE clinic_id=?', [clinic.id]);
    for (const patient of patients) {
      await schedulePatient(updated, patient);
      const appointments = await all("SELECT * FROM appointments WHERE clinic_id=? AND patient_id=? AND status='booked' AND starts_at>?", [clinic.id, patient.id, now()]);
      for (const appointment of appointments) await schedulePatient(updated, patient, appointment);
    }
  }
}
app.post('/api/billing/refresh', auth, async (req, res) => { if (!req.clinic.subscription_id) fail(400, 'No subscription to refresh.'); await refreshBilling(req.clinic); res.json({ ok: true }); });
app.post('/api/billing/cancel', auth, async (req, res) => {
  if (req.body.confirm !== true) fail(400, 'Confirm subscription cancellation.');
  if (!req.clinic.subscription_id) fail(400, 'No active subscription.');
  await razorpay(`subscriptions/${req.clinic.subscription_id}/cancel`, { cancel_at_cycle_end: 1 });
  await refreshBilling(req.clinic); await event(req.clinic.id, 'Subscription cancellation requested for the end of the billing cycle'); res.json({ ok: true });
});
app.get('/api/export', auth, async (req, res) => {
  const data = {};
  for (const table of ['patients','leads','appointments','events','jobs','care_records','appointment_details','audit_log']) {
    data[table] = await all(`SELECT * FROM ${table} WHERE clinic_id=?`, [req.clinic.id]);
    if (['patients','leads','jobs','care_records','appointment_details'].includes(table)) data[table] = data[table].map(row => ({ ...row, data: decrypt(row.data) }));
  }
  data.clinic = { name: req.clinic.name, slug: req.clinic.slug, ...JSON.parse(req.clinic.data) };
  res.set('Content-Disposition', 'attachment; filename="dantam-export.json"').json(data);
});
app.delete('/api/account', auth, async (req, res) => {
  const password = z.string().min(1).max(128).parse(req.body.password);
  if (!await passwordMatches(password, req.user.password)) fail(401, 'Password is incorrect.');
  if (req.clinic.subscription_id && !['cancelled','completed','expired'].includes(req.clinic.billing_status)) fail(400, 'Finish cancelling your paid subscription before deleting this account.');
  const google = await connection(req.clinic.id, 'google');
  if (google?.refresh_token) await remote('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: google.refresh_token }) });
  forwardCookies(await authApi('signOut', { headers: requestHeaders(req), asResponse: true }), res);
  await transaction(async tx => {
    const staff=await tx.all('SELECT user_id FROM memberships WHERE clinic_id=?',[req.clinic.id]);
    for(const member of staff){await tx.run('DELETE FROM auth_user WHERE id=?',[member.user_id]);await tx.run('DELETE FROM users WHERE id=?',[member.user_id]);}
    await tx.run('DELETE FROM auth_user WHERE id=?', [req.user.id]);
    await tx.run('DELETE FROM users WHERE id=?', [req.user.id]);
  });
  res.json({ ok: true });
});
app.get('/privacy', (req, res) => res.type('html').send(legalPage('Privacy policy', `<p>Dantam is operated by ${escapeHtml(process.env.LEGAL_ENTITY || 'the platform operator (development configuration)')}. We process clinic account information, contact details, appointment requests and messaging permissions to provide websites and practice management services.</p><p>Clinics control their patient records. Dantam does not require diagnosis or treatment records. Connected providers receive the information needed for email, authorised Google profile management, subscription payments and opted-in WhatsApp messages. Payment card details are handled by the payment provider.</p><p>Clinic account and patient records remain until removed by the clinic or the account is deleted. Clinic owners can export their records and delete patient records in their dashboard. Google review data is retained temporarily for up to 29 days. Operational logs contain action descriptions, not patient message content. Hosting backups may retain deleted records until their retention window expires; the operator must document that window before launch.</p><p>To request access, correction or deletion, contact your clinic for patient records or ${escapeHtml(process.env.SUPPORT_EMAIL || 'the platform support contact (not configured)')} for platform account records. Messages can be stopped by replying STOP on WhatsApp or contacting your clinic.</p>`)));
app.get('/terms', (req, res) => res.type('html').send(legalPage('Terms of service', `<p>Dantam supplies clinic website and practice workflow software. Clinic owners must be authorised to represent their clinic and confirm the accuracy of the information they publish.</p><p>Free plans include a website hosted at a Dantam clinic URL. Paid plans include defined monthly automation allowances. External messaging charges, advertising, custom domains and applicable taxes are separate. Subscription prices are displayed before checkout. Cancel through Billing; cancellation takes effect at the end of the current billing cycle. Contact support for billing disputes; mandatory statutory rights are unaffected.</p><p>Clinics must obtain permission before messaging patients and authorise Google changes. Dantam does not provide clinical advice or guarantee search rankings, patient growth or revenue. Published review responses must not disclose patient or treatment information.</p><p>Service operator: ${escapeHtml(process.env.LEGAL_ENTITY || 'not configured')}, ${escapeHtml(process.env.LEGAL_ADDRESS || 'address not configured')}. Contact: ${escapeHtml(process.env.SUPPORT_EMAIL || 'not configured')}. These launch policy drafts require operator review before commercial use.</p>`)));
function legalPage(title, body) { return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Dantam</title><style>body{max-width:760px;margin:60px auto;padding:24px;color:#173b40;font:16px/1.7 system-ui}a{color:#074d4c}</style><a href="/">Dantam</a><h1>${title}</h1>${body}</html>`; }
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
  if (error.code === '23505' || /UNIQUE constraint failed/.test(error.message)) return res.status(409).json({ error: 'This record already exists. Check the email, phone number or appointment time.' });
  const status = error.status || (error.name === 'ProviderError' ? 502 : error instanceof SyntaxError ? 400 : 500);
  if (status >= 500) console.error('Request failed:', req.method, req.path, error.message);
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again or contact support.' : error.message });
}
