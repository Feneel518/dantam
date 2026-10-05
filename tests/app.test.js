import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createHmac } from 'node:crypto';
process.env.SQLITE_PATH = ':memory:';
process.env.ENCRYPTION_KEY = 'b'.repeat(64);
process.env.APP_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
const { app, errorHandler } = await import('../server/app.js');
app.use(errorHandler);
const { one, all, run, closeDb } = await import('../server/db.js');
const { hash, decrypt, encrypt, id, now, validSignature, escapeHtml } = await import('../server/security.js');
const { schedulePatient, queueJob, processJobs, maintenance, paid, needsAttention } = await import('../server/workflows.js');
const { saveConnection } = await import('../server/providers.js');
const { clinicSchema } = await import('../server/validation.js');
const origin = 'http://localhost:3000';
let owner, other, clinic, otherClinic, patientId, appointmentId, leadId;
const originalFetch = globalThis.fetch;
const post = (agent, path, data) => agent.post(path).set('Origin', origin).send(data);
const patch = (agent, path, data) => agent.patch(path).set('Origin', origin).send(data);
const del = (agent, path, data = {}) => agent.delete(path).set('Origin', origin).send(data);
before(async () => {
  owner = request.agent(app); other = request.agent(app);
  const first = await post(owner, '/api/auth/register', { email: 'owner@example.in', password: 'A secure test password 123!', name: 'Test Dental', city: 'Hyderabad', phone: '9999000010' });
  assert.equal(first.status, 201);
  const second = await post(other, '/api/auth/register', { email: 'other@example.in', password: 'Another test password 456!', name: 'Other Dental', city: 'Chennai', phone: '9999000020' });
  assert.equal(second.status, 201);
  clinic = await one('SELECT * FROM clinics WHERE name=?', ['Test Dental']);
  otherClinic = await one('SELECT * FROM clinics WHERE name=?', ['Other Dental']);
});
after(async () => { globalThis.fetch = originalFetch; await closeDb(); });
test('anonymous users cannot read clinic records', async () => { assert.equal((await request(app).get('/api/workspace')).status, 401); });
test('Better Auth issues signed HttpOnly sessions and rejects unsigned tokens', async () => {
  const agent = request.agent(app);
  const response = await post(agent, '/api/auth/login', { email: 'owner@example.in', password: 'A secure test password 123!' });
  assert.equal(response.status, 200); assert.match(response.headers['set-cookie'][0], /HttpOnly/); assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
  const session = await one('SELECT * FROM auth_session LIMIT 1'); assert.ok(session.token);
  assert.equal((await all('SELECT * FROM sessions')).length, 0);
  assert.equal((await request(app).get('/api/workspace').set('Cookie', `dantam.session_token=${session.token}`)).status, 401);
});
test('owners can inspect devices and revoke other sessions without logging themselves out', async () => {
  const device = request.agent(app);
  assert.equal((await post(device, '/api/auth/login', { email: 'owner@example.in', password: 'A secure test password 123!' })).status, 200);
  const listed = await owner.get('/api/auth/sessions');
  assert.ok(listed.body.sessions.some(s => s.current));
  assert.ok(listed.body.sessions.some(s => !s.current));
  assert.ok(!JSON.stringify(listed.body).includes('token'));
  assert.equal((await post(owner, '/api/auth/revoke-others', {})).status, 200);
  assert.equal((await device.get('/api/workspace')).status, 401);
  assert.equal((await owner.get('/api/workspace')).status, 200);
});
test('Google setup reports configuration without exposing secrets and requires authentication', async () => {
  assert.equal((await request(app).get('/api/google/setup')).status, 401);
  const result = await owner.get('/api/google/setup');
  assert.equal(result.status, 200);
  assert.equal(result.body.redirectUri, `${origin}/api/google/callback`);
  assert.equal(result.body.publicUrl, false);
  assert.ok(!JSON.stringify(result.body).includes('client_secret'));
  assert.equal((await post(owner, '/api/google/test', {})).status, 400);
});
test('free owners can test Google profile and review access without modifying Google', async () => {
  await saveConnection(clinic.id, 'google', { access_token: 'test-access', expires_at: Date.now()+3600000, location: 'locations/123', account: 'accounts/456' });
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, method: options.method }); return { ok: true, json: async () => String(url).includes('/reviews?') ? { totalReviewCount: 12, averageRating: 4.5 } : { title: 'Live test clinic', websiteUri: 'https://clinic.example', phoneNumbers: { primaryPhone: '+919999000010' } } }; };
  try {
    const result = await post(owner, '/api/google/test', {});
    assert.equal(result.status, 200); assert.equal(result.body.profile.title, 'Live test clinic'); assert.equal(result.body.reviews.count, 12);
    assert.equal(calls.length, 2); assert.ok(calls.every(c => !c.method || c.method === 'GET'));
    assert.equal((await one('SELECT plan FROM clinics WHERE id=?', [clinic.id])).plan, 'free');
    globalThis.fetch = async url => ({ ok: !String(url).includes('/reviews?'), status: 403, json: async () => ({ title: 'Live test clinic' }) });
    const partial = await post(owner, '/api/google/test', {});
    assert.equal(partial.status, 200); assert.equal(partial.body.reviews.ok, false);
  } finally { globalThis.fetch = originalFetch; await run("DELETE FROM connections WHERE clinic_id=? AND provider='google'", [clinic.id]); }
});
test('invalid passwords do not grant sessions', async () => { const response = await post(request.agent(app), '/api/auth/login', { email: 'owner@example.in', password: 'wrong password' }); assert.equal(response.status, 401); assert.equal(response.headers['set-cookie'], undefined); });
test('cross-origin writes are rejected before clinic mutation', async () => { const response = await owner.post('/api/patients').set('Origin', 'https://evil.example').send({ name: 'Bad', phone: '9999000999', consent: false }); assert.equal(response.status, 403); });
test('unverified clinics cannot publish websites', async () => { assert.equal((await post(owner, '/api/clinic/publish', { publish: true, confirm: true })).status, 400); });
test('verification tokens are single-use and expire', async () => {
  const token = id() + id();
  await run('INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)', [hash(token), clinic.user_id, 'verify', new Date(Date.now()+3600000).toISOString()]);
  assert.equal((await post(owner, '/api/auth/verify', { token })).status, 200);
  assert.equal((await post(owner, '/api/auth/verify', { token })).status, 400);
  const expired = id()+id(); await run('INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)', [hash(expired), clinic.user_id,'verify','2000-01-01T00:00:00.000Z']);
  assert.equal((await post(owner, '/api/auth/verify', { token: expired })).status, 400);
});
test('clinic details save and the preview escapes HTML injection', async () => {
  const input = { name:'Test Dental',...JSON.parse(clinic.data),address:'Example address',doctor:'Dr. Test',qualifications:'BDS',registration:'EXAMPLE-123',hours:'Mon–Sat 10 am–7 pm',about:'<script>alert(1)</script>',tagline:'<img src=x onerror=alert(1)>' };
  assert.equal((await patch(owner, '/api/clinic', input)).status, 200);
  const preview = await owner.get('/api/clinic/preview'); assert.equal(preview.status, 200); assert.match(preview.text, /&lt;script&gt;/); assert.ok(!preview.text.includes('<script>alert(1)</script>'));
  assert.match(preview.text,/noindex,nofollow/);
});
test('publishing needs specific approval and accurate required details', async () => {
  assert.equal((await post(owner, '/api/clinic/publish', { publish:true })).status, 400);
  assert.equal((await post(owner, '/api/clinic/publish', { publish:true,confirm:true })).status, 200);
  assert.equal((await request(app).get(`/c/${clinic.slug}`)).status, 200);
  assert.equal((await request(app).get(`/c/${otherClinic.slug}`)).status, 404);
});
test('booking requests are encrypted enquiries, not appointments', async () => {
  const response = await post(request(app), `/c/${clinic.slug}/book`, { name:'New Visitor',phone:'9999000030',preferredDate:'2026-10-10',service:'Consultation',consent:false,source:'google' });
  assert.equal(response.status, 201);
  const lead = await one('SELECT * FROM leads WHERE clinic_id=?', [clinic.id]); leadId = lead.id;
  assert.equal(lead.status,'new'); assert.ok(!lead.data.includes('New Visitor')); assert.equal(decrypt(lead.data).consent,false);
  assert.equal((await all('SELECT * FROM appointments WHERE clinic_id=?',[clinic.id])).length,0);
});
test('public booking honeypot rejects bots without creating leads', async () => {
  const before = (await all('SELECT * FROM leads')).length;
  assert.equal((await post(request(app), `/c/${clinic.slug}/book`, { name:'Spam Bot',phone:'9999000040',preferredDate:'2026-10-11',service:'Consultation',consent:true,website:'https://spam.example' })).status,201);
  assert.equal((await all('SELECT * FROM leads')).length,before);
});
test('patients require permission evidence and Indian phone validation', async () => {
  assert.equal((await post(owner,'/api/patients',{name:'Patient Test',phone:'123',consent:false})).status,400);
  assert.equal((await post(owner,'/api/patients',{name:'Patient Test',phone:'9999000030',consent:true})).status,400);
  const result=await post(owner,'/api/patients',{name:'Patient Test',phone:'9999000030',consent:true,consentSource:'Test signed form',recallDate:'2026-12-10'}); assert.equal(result.status,201); patientId=result.body.id;
  const patient = await one('SELECT * FROM patients WHERE id=?',[patientId]); assert.ok(!patient.data.includes('Patient Test')); assert.equal(decrypt(patient.data).phone,'+919999000030');
});
test('one clinic cannot access or alter another clinic’s patient', async () => {
  const workspace = await other.get('/api/workspace'); assert.equal(workspace.body.patients.length,0); assert.equal(workspace.body.leads.length,0);
  assert.equal((await patch(other,`/api/patients/${patientId}`,{name:'Stolen',phone:'9999000030',consent:false})).status,404);
  assert.equal((await del(other,`/api/patients/${patientId}`)).status,404);
  assert.equal((await post(other,'/api/appointments',{patientId,startsAt:'2027-01-02T05:30:00.000Z'})).status,404);
});
test('booking links a website enquiry to a confirmed appointment', async () => {
  const response=await post(owner,'/api/appointments',{patientId,leadId,startsAt:'2027-01-02T05:30:00.000Z'}); assert.equal(response.status,201); appointmentId=response.body.id;
  assert.equal((await one('SELECT status FROM leads WHERE id=?',[leadId])).status,'booked');
});
test('duplicate appointment requests and occupied slots are rejected', async () => {
  assert.equal((await post(owner,'/api/appointments',{patientId,leadId,startsAt:'2027-01-03T05:30:00.000Z'})).status,409);
  assert.equal((await post(owner,'/api/appointments',{patientId,startsAt:'2027-01-02T05:30:00.000Z'})).status,409);
});
test('appointments cannot be updated across clinics', async () => { assert.equal((await patch(other,`/api/appointments/${appointmentId}`,{status:'attended',revenue:10000})).status,404); });
test('attendance records actual collected revenue without accepting negative amounts', async () => {
  assert.equal((await patch(owner,`/api/appointments/${appointmentId}`,{status:'attended',revenue:-1})).status,400);
  assert.equal((await patch(owner,`/api/appointments/${appointmentId}`,{status:'attended',revenue:120000})).status,200);
  const a=await one('SELECT * FROM appointments WHERE id=?',[appointmentId]);assert.equal(a.status,'attended');assert.equal(a.revenue,120000);
});
test('free and expired subscriptions cannot use paid features', async () => {
  assert.equal((await post(owner,'/api/reviews/sync',{})).status,402);
  assert.equal(paid({...clinic,plan:'growth',billing_status:'active',paid_until:'2000-01-01T00:00:00.000Z'}),false);
  const input={name:'Test Dental',...JSON.parse((await one('SELECT * FROM clinics WHERE id=?',[clinic.id])).data),autoReplies:true,googleConsent:true};
  assert.equal((await patch(owner,'/api/clinic',input)).status,400);
});
test('unsigned payment webhooks cannot activate subscriptions', async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET='test_webhook_secret';
  const response=await request(app).post('/api/webhooks/razorpay').send({event:'subscription.activated',payload:{subscription:{entity:{id:'sub_test'}}}});assert.equal(response.status,401);
  assert.equal((await one('SELECT billing_status FROM clinics WHERE id=?',[clinic.id])).billing_status,'inactive');
});
test('signed billing events reconcile provider state and reject duplicate event processing', async () => {
  process.env.RAZORPAY_KEY_ID='test_key';process.env.RAZORPAY_KEY_SECRET='test_secret';process.env.RAZORPAY_GROWTH_PLAN_ID='plan_growth';process.env.RAZORPAY_PRO_PLAN_ID='plan_pro';
  await run('UPDATE clinics SET subscription_id=? WHERE id=?',['sub_test',clinic.id]);
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({id:'sub_test',plan_id:'plan_growth',status:'active',current_end:Math.floor(Date.now()/1000)+30*86400}),{status:200,headers:{'Content-Type':'application/json'}});};
  const body=JSON.stringify({event:'subscription.activated',payload:{subscription:{entity:{id:'sub_test'}}}}),signature=createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  const send=()=>request(app).post('/api/webhooks/razorpay').set('Content-Type','application/json').set('x-razorpay-signature',signature).set('x-razorpay-event-id','test-event-1').send(body);
  assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal(calls,1);
  clinic=await one('SELECT * FROM clinics WHERE id=?',[clinic.id]);assert.equal(paid(clinic),true);globalThis.fetch=originalFetch;
});
test('automatic replies require specific clinic consent even with active billing', async()=>{
  const settings=JSON.parse(clinic.data);
  assert.equal((await patch(owner,'/api/clinic',{name:clinic.name,...settings,autoReplies:true})).status,400);
  assert.equal((await patch(owner,'/api/clinic',{name:clinic.name,...settings,autoReplies:true,googleConsent:true,reminders:true,recalls:true,messagingConsent:true})).status,200);
  clinic=await one('SELECT * FROM clinics WHERE id=?',[clinic.id]);assert.ok(JSON.parse(clinic.data).googleConsentAt);
});
test('scheduling is idempotent for a patient’s recall and an appointment reminder',async()=>{
  const patient=await one('SELECT * FROM patients WHERE id=?',[patientId]);
  const appointment={id:'idempotency-test',status:'booked',starts_at:new Date(Date.now()+3*86400000).toISOString()};
  await schedulePatient(clinic,patient,appointment);await schedulePatient(clinic,patient,appointment);
  assert.equal((await all('SELECT * FROM jobs WHERE id=?',[`reminder:${appointment.id}:${appointment.starts_at}`])).length,1);
  assert.equal((await all('SELECT * FROM jobs WHERE id=?',[`recall:${patientId}:${patient.recall_date}`])).length,1);
});
test('review classifier holds clinical or negative content for owner approval',()=>{
  for(const text of ['Root canal went well','Terrible service','Pain after extraction','Good but expensive','The treatment helped'])assert.equal(needsAttention(text),true);
  assert.equal(needsAttention('Friendly team, thank you!'),false);
});
test('owner opt-out cancels queued messages and prevents delivery',async()=>{
  const patient=await one('SELECT * FROM patients WHERE id=?',[patientId]);
  await queueJob({clinicId:clinic.id,patientId,kind:'recall',data:{recallDate:patient.recall_date},key:'optout-test'});
  const result=await patch(owner,`/api/patients/${patientId}`,{name:'Patient Test',phone:'9999000030',consent:false,recallDate:patient.recall_date});assert.equal(result.status,200);
  assert.equal((await one('SELECT state FROM jobs WHERE id=?',['optout-test'])).state,'cancelled');
  let deliveries=0;globalThis.fetch=async()=>{deliveries++;return new Response('{}');};await processJobs();assert.equal(deliveries,0);globalThis.fetch=originalFetch;
});
test('signed WhatsApp STOP revokes consent only for the matching clinic',async()=>{
  process.env.META_APP_SECRET='meta_test_secret';
  await run('UPDATE patients SET consent=1 WHERE id=?',[patientId]);
  await saveConnection(clinic.id,'whatsapp',{phoneId:'123456789',token:'private_test_token',templates:{}});
  const body=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'123456789'},messages:[{from:'919999000030',text:{body:'STOP'}}]}}]}]});
  const signature=createHmac('sha256',process.env.META_APP_SECRET).update(body).digest('hex');
  assert.equal((await request(app).post('/api/webhooks/whatsapp').set('Content-Type','application/json').set('x-hub-signature-256',`sha256=${signature}`).send(body)).status,200);
  assert.equal((await one('SELECT consent FROM patients WHERE id=?',[patientId])).consent,0);
});
test('connection responses never expose encrypted provider secrets',async()=>{
  const row=await one('SELECT data FROM connections WHERE clinic_id=? AND provider=?',[clinic.id,'whatsapp']);assert.ok(!row.data.includes('private_test_token'));
  const response=await owner.get('/api/workspace');assert.ok(!JSON.stringify(response.body).includes('private_test_token'));
});
test('maintenance expires review content and holds interrupted deliveries',async()=>{
  await run('INSERT INTO reviews(id,clinic_id,data,rating,reply,status,fetched_at) VALUES(?,?,?,?,?,?,?)',['old-review',clinic.id,'{}',5,null,'ready','2000-01-01T00:00:00.000Z']);
  await queueJob({clinicId:clinic.id,patientId,kind:'recall',key:'interrupted-send'});
  await run("UPDATE jobs SET state='sending',updated_at=? WHERE id=?",['2000-01-01T00:00:00.000Z','interrupted-send']);
  await maintenance();assert.equal(await one('SELECT id FROM reviews WHERE id=?',['old-review']),undefined);assert.equal((await one('SELECT state FROM jobs WHERE id=?',['interrupted-send'])).state,'needs_review');
});
test('invalid signatures and unsafe review links are rejected',()=>{
  assert.equal(validSignature('body','abc','secret'),false);assert.equal(validSignature('body','0'.repeat(64),'secret'),false);assert.equal(escapeHtml('<a>'), '&lt;a&gt;');
  assert.equal(clinicSchema.safeParse({name:clinic.name,...JSON.parse(clinic.data),reviewUrl:'https://evil.example'}).success,false);
});
test('data exports contain only the owner’s records and no provider credentials',async()=>{
  const response=await owner.get('/api/export');assert.equal(response.status,200);assert.ok(response.headers['content-disposition'].includes('attachment'));
  assert.ok(response.body.patients.every(p=>p.clinic_id===clinic.id));assert.ok(!JSON.stringify(response.body).includes('private_test_token'));
});
test('patient deletion cascades their appointments and jobs',async()=>{
  assert.equal((await del(owner,`/api/patients/${patientId}`)).status,200);
  assert.equal((await all('SELECT * FROM appointments WHERE patient_id=?',[patientId])).length,0);assert.equal((await all('SELECT * FROM jobs WHERE patient_id=?',[patientId])).length,0);
});
test('password reset invalidates existing sessions and is single-use',async()=>{
  const token=id()+id();await run('INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)',[hash(token),otherClinic.user_id,'reset',new Date(Date.now()+3600000).toISOString()]);
  const input={token,password:'Replacement secure password 789!'};
  assert.equal((await post(request(app),'/api/auth/reset',input)).status,200);assert.equal((await other.get('/api/workspace')).status,401);assert.equal((await post(request(app),'/api/auth/reset',input)).status,400);
  assert.equal((await post(request.agent(app), '/api/auth/login', { email: 'other@example.in', password: 'Another test password 456!' })).status, 401);
  assert.equal((await post(request.agent(app), '/api/auth/login', { email: 'other@example.in', password: input.password })).status, 200);
});
test('two workers claim a job once and record accepted delivery separately from attendance',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T06:00:00Z').getTime()});
  await run('UPDATE clinics SET paid_until=? WHERE id=?',['2027-10-02T06:00:00.000Z',clinic.id]);
  const pId=id();await run('INSERT INTO patients(id,clinic_id,data,phone_hash,consent,recall_date,created_at) VALUES(?,?,?,?,?,?,?)',[pId,clinic.id,encrypt({name:'Queue Test',phone:'+919999000090'}),'queue-phone',1,'2026-10-02',now()]);
  await saveConnection(clinic.id,'whatsapp',{phoneId:'123456789',token:'test_token',language:'en',templates:{recall:'test_recall'}});
  await queueJob({clinicId:clinic.id,patientId:pId,kind:'recall',data:{recallDate:'2026-10-02'},key:'single-delivery'});
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({messages:[{id:'wamid.test-one'}]}),{status:200});};
  await Promise.all([processJobs(),processJobs()]);
  assert.equal(calls,1);assert.equal((await one('SELECT state FROM jobs WHERE id=?',['single-delivery'])).state,'sent');
  assert.equal((await all('SELECT * FROM message_usage WHERE job_id=?',['single-delivery'])).length,1);
  globalThis.fetch=originalFetch;
});
test('ambiguous delivery is held rather than automatically retried',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T06:00:00Z').getTime()});
  const patient=await one('SELECT * FROM patients WHERE phone_hash=?',['queue-phone']);
  await queueJob({clinicId:clinic.id,patientId:patient.id,kind:'recall',data:{recallDate:'2026-10-02'},key:'uncertain-delivery'});
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Network timeout');};
  await processJobs();await processJobs();
  assert.equal(calls,1);assert.equal((await one('SELECT state FROM jobs WHERE id=?',['uncertain-delivery'])).state,'needs_review');
  assert.equal((await all('SELECT * FROM message_usage WHERE job_id=?',['uncertain-delivery'])).length,1);globalThis.fetch=originalFetch;
});
test('monthly allowance reservations prevent extra deliveries',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T06:00:00Z').getTime()});
  const patient=await one('SELECT * FROM patients WHERE phone_hash=?',['queue-phone']);
  for(let i=2;i<300;i++)await run('INSERT INTO message_usage(id,clinic_id,job_id,created_at) VALUES(?,?,?,?)',[id(),clinic.id,'single-delivery',now()]);
  await queueJob({clinicId:clinic.id,patientId:patient.id,kind:'recall',data:{recallDate:'2026-10-02'},key:'allowance-delivery'});
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response('{}');};await processJobs();
  assert.equal(calls,0);assert.equal((await one('SELECT state FROM jobs WHERE id=?',['allowance-delivery'])).state,'failed');globalThis.fetch=originalFetch;
});
test('out-of-order WhatsApp callbacks cannot downgrade a read receipt',async()=>{
  const makeBody=status=>JSON.stringify({entry:[{changes:[{value:{statuses:[{id:'wamid.test-one',status}]}}]}]});
  for(const status of ['read','delivered']){
    const body=makeBody(status),signature=createHmac('sha256',process.env.META_APP_SECRET).update(body).digest('hex');
    assert.equal((await request(app).post('/api/webhooks/whatsapp').set('Content-Type','application/json').set('x-hub-signature-256',`sha256=${signature}`).send(body)).status,200);
  }
  assert.equal((await one('SELECT state FROM jobs WHERE id=?',['single-delivery'])).state,'read');
});
test('free clinics receive owner email alerts without sending patient details',async()=>{
  await run("UPDATE clinics SET billing_status='inactive' WHERE id=?",[clinic.id]);
  await queueJob({clinicId:clinic.id,kind:'ownerAlert',data:{leadId},key:'free-owner-alert'});
  await processJobs();assert.equal((await one('SELECT state FROM jobs WHERE id=?',['free-owner-alert'])).state,'sent');
  const { readdirSync,readFileSync }=await import('node:fs');
  const mails=readdirSync('data/mail').map(file=>JSON.parse(readFileSync(`data/mail/${file}`,'utf8')));
  const mail=mails.findLast(m=>m.subject==='New appointment request for Test Dental');
  assert.ok(mail);assert.ok(mail.text.includes('/app/requests'));assert.ok(!mail.text.includes('9999000030'));assert.ok(!mail.text.includes('New Visitor'));
});
test('sitemap includes only published clinics',async()=>{
  const response=await request(app).get('/sitemap.xml');assert.equal(response.status,200);assert.ok(response.text.includes(clinic.slug));assert.ok(!response.text.includes(otherClinic.slug));
  assert.match((await request(app).get('/robots.txt')).text,/Disallow: \/api\//);
});
test('fictional demo clinics cannot publish, accept requests or send owner alerts',async()=>{
  const saved=await one('SELECT data FROM clinics WHERE id=?',[clinic.id]);
  await run('UPDATE clinics SET data=? WHERE id=?',[JSON.stringify({...JSON.parse(saved.data),demo:true}),clinic.id]);
  try {
    assert.equal((await post(owner,'/api/clinic/publish',{publish:true,confirm:true})).status,400);
    const booking=await post(request(app),`/c/${clinic.slug}/book`,{name:'Demo visitor',phone:'9999000088',preferredDate:'2026-10-15',service:'Consultation',consent:false});
    assert.equal(booking.status,400);assert.match(booking.body.error,/demonstration clinic/);
    await queueJob({clinicId:clinic.id,kind:'ownerAlert',data:{leadId},key:'demo-owner-alert'});
    await processJobs();
    const job=await one('SELECT state,error FROM jobs WHERE id=?',['demo-owner-alert']);
    assert.equal(job.state,'needs_review');assert.match(job.error,/Demo clinics/);
  } finally { await run('UPDATE clinics SET data=? WHERE id=?',[saved.data,clinic.id]); }
});
