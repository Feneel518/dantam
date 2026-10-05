import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
process.env.SQLITE_PATH = ':memory:';
process.env.ENCRYPTION_KEY = 'e'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:3000';
const { app, errorHandler } = await import('../server/app.js');
app.use(errorHandler);
const { one, run, closeDb } = await import('../server/db.js');
const { encrypt, decrypt } = await import('../server/security.js');
const owner = request.agent(app), other = request.agent(app);
const send = (agent, url, body, method = 'post') => agent[method](url).set('Origin', process.env.APP_URL).send(body);
let clinic, leadId, appointmentId;
before(async () => {
  for (const [agent, email, name] of [[owner, 'booking@test.in', 'Booking Clinic'], [other, 'outside@test.in', 'Other Clinic']]) {
    assert.equal((await send(agent, '/api/auth/register', { email, name, password: 'Booking regression 2026!', phone: '9999000911', city: 'Hyderabad' })).status, 201);
  }
  clinic = await one("SELECT * FROM clinics WHERE name='Booking Clinic'");
  await run('UPDATE clinics SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(clinic.data), hours: 'Mon–Sat, 10 am–7 pm' }), clinic.id]);
  await run('UPDATE users SET verified=1');
  await run('UPDATE clinics SET published=1 WHERE id=?', [clinic.id]);
});
after(closeDb);

test('website enquiry is visible to the workspace and queues an owner alert', async () => {
  const page = (await request(app).get(`/c/${clinic.slug}`)).text;
  assert.match(page, /<select name="preferredTime" required>/);
  assert.equal((page.match(/name="preferredTime"/g) || []).length, 1);
  assert.equal((await send(request(app), `/c/${clinic.slug}/book`, { name: 'Calendar Patient', phone: '9999000912', preferredDate: '2027-01-10', preferredTime: '10:00', service: 'Consultation', consent: false })).status, 400);
  assert.equal((await send(request(app), `/c/${clinic.slug}/book`, { name: 'Calendar Patient', phone: '9999000912', preferredDate: '2027-01-11', preferredTime: '09:00', service: 'Consultation', consent: false })).status, 400);
  assert.equal((await send(request(app), `/c/${clinic.slug}/book`, { name: 'Calendar Patient', phone: '9999000912', preferredDate: '2027-01-11', preferredTime: '10:00', service: 'Consultation', consent: false })).status, 201);
  const workspace = (await owner.get('/api/workspace')).body;
  const lead = workspace.leads.find(l => l.name === 'Calendar Patient');
  leadId = lead.id;
  assert.equal(lead.status, 'new');
  assert.ok(await one("SELECT id FROM jobs WHERE clinic_id=? AND kind='ownerAlert' AND state='pending'", [clinic.id]));
});

test('enquiry edits retain website preferences and reject fake booking status', async () => {
  const fields = { notes: 'Confirmed by phone', assignedTo: '', status: 'contacted', name: 'Calendar Patient Updated', preferredDate: '2027-01-11', preferredTime: '11:30' };
  assert.equal((await send(owner, `/api/lead-details/${leadId}`, { ...fields, status: 'booked' }, 'patch')).status, 400);
  assert.equal((await send(owner, `/api/lead-details/${leadId}`, fields, 'patch')).status, 200);
  assert.equal((await send(other, `/api/lead-details/${leadId}`, fields, 'patch')).status, 404);
  const lead = (await owner.get('/api/workspace')).body.leads.find(l => l.id === leadId);
  assert.equal(lead.name, fields.name);
  assert.equal(lead.preferredTime, '11:30');
  assert.equal(lead.phone, '+919999000912');
});

test('booking creates a linked patient and visit once, and protects clinic boundaries', async () => {
  const input = { startsAt: '2027-01-11T06:00:00.000Z', doctorId: '' };
  assert.equal((await send(other, `/api/leads/${leadId}/book`, input)).status, 404);
  const result = await send(owner, `/api/leads/${leadId}/book`, input);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  appointmentId = result.body.id;
  assert.equal((await send(owner, `/api/leads/${leadId}/book`, input)).status, 409);
  const workspace = (await owner.get('/api/workspace')).body;
  assert.equal(workspace.leads.find(l => l.id === leadId).status, 'booked');
  assert.equal(workspace.appointments.find(a => a.id === appointmentId).starts_at, input.startsAt);
  assert.equal(workspace.patients.filter(p => p.phone === '+919999000912').length, 1);
  assert.equal((await send(owner, `/api/leads/${leadId}`, { status: 'closed' }, 'patch')).status, 400);
});

test('reception rescheduling persists date, stage and notes and cancels old reminders', async () => {
  const appointment = await one('SELECT * FROM appointments WHERE id=?', [appointmentId]);
  await run('INSERT INTO jobs(id,clinic_id,patient_id,kind,data,due_at,state,updated_at) VALUES(?,?,?,?,?,?,?,?)', ['old-reminder', clinic.id, appointment.patient_id, 'reminder', encrypt({ appointmentId }), '2027-01-10T06:00:00.000Z', 'pending', new Date().toISOString()]);
  const fields = { startsAt: '2027-01-12T18:45:00.000Z', doctorId: '', stage: 'arrived', reason: 'Review', notes: 'Rescheduled' };
  assert.equal((await send(owner, `/api/visit-details/${appointmentId}`, fields, 'patch')).status, 200);
  const workspace = (await owner.get('/api/workspace')).body;
  assert.equal(workspace.appointments.find(a => a.id === appointmentId).starts_at, fields.startsAt);
  assert.equal(workspace.appointmentDetails.find(a => a.id === appointmentId).stage, 'arrived');
  assert.equal((await one("SELECT state FROM jobs WHERE id='old-reminder'")).state, 'cancelled');
  // 18:45 UTC is the following calendar day in India.
  const { clinicDay } = await import('../src/lib/clinic-time.js');
  assert.equal(clinicDay(fields.startsAt), '2027-01-13');
});

test('collisions roll back date and notes; attendance keeps enquiry status in sync', async () => {
  const appointment = await one('SELECT * FROM appointments WHERE id=?', [appointmentId]);
  const occupied = '2027-01-14T06:00:00.000Z';
  assert.equal((await send(owner, '/api/appointments', { patientId: appointment.patient_id, startsAt: occupied })).status, 201);
  assert.equal((await send(owner, `/api/visit-details/${appointmentId}`, { startsAt: occupied, doctorId: '', stage: 'confirmed', reason: 'Lost change', notes: 'Should roll back' }, 'patch')).status, 409);
  assert.equal((await one('SELECT starts_at FROM appointments WHERE id=?', [appointmentId])).starts_at, appointment.starts_at);
  assert.equal(decrypt((await one('SELECT data FROM appointment_details WHERE appointment_id=?', [appointmentId])).data).notes, 'Rescheduled');
  assert.equal((await send(owner, `/api/visit-details/${appointmentId}`, { doctorId: '', stage: 'completed', reason: 'Review', notes: 'Done' }, 'patch')).status, 200);
  assert.equal((await one('SELECT status FROM leads WHERE id=?', [leadId])).status, 'converted');
  assert.equal((await send(owner, `/api/appointments/${appointmentId}`, { status: 'cancelled' }, 'patch')).status, 200);
  assert.equal((await one('SELECT status FROM leads WHERE id=?', [leadId])).status, 'contacted');
});

test('failed booking never leaves an orphan patient and retry succeeds', async () => {
  const lead = await send(owner, '/api/leads', { name: 'Retry Patient', phone: '9999000913', source: 'phone' });
  assert.equal((await send(owner, `/api/leads/${lead.body.id}/book`, { startsAt: '2027-01-14T06:00:00.000Z' })).status, 409);
  assert.ok(!(await owner.get('/api/workspace')).body.patients.some(p => p.name === 'Retry Patient'));
  assert.equal((await send(owner, `/api/leads/${lead.body.id}/book`, { startsAt: '2027-01-14T07:00:00.000Z' })).status, 201);
});
