import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
process.env.SQLITE_PATH=':memory:';process.env.ENCRYPTION_KEY='a'.repeat(64);process.env.NODE_ENV='test';process.env.APP_URL='http://localhost:3000';process.env.LAUNCH_MODE='live';
process.env.COMPLIMENTARY_ACCESS_EMAILS='founder@example.in';
process.env.COMPLIMENTARY_ACCESS_UNTIL=new Date(Date.now()+30*86400000).toISOString();
const {app,errorHandler}=await import('../server/app.js');app.use(errorHandler);
const {one,run,closeDb}=await import('../server/db.js');
const {hash,now}=await import('../server/security.js');
const {paid,schedulePatient}=await import('../server/workflows.js');
after(closeDb);
const owner=request.agent(app),other=request.agent(app);
const send=(agent,path,body,method='post')=>agent[method](path).set('Origin',process.env.APP_URL).send(body);
let clinic;

test('live signup requires email verification before private Pro access is granted',async()=>{
 assert.equal((await request(app).get('/api/public-config')).body.prelaunch,false);
 const r=await send(owner,'/api/auth/register',{email:'founder@example.in',password:'Live testing password 2026!',name:'Founder test clinic',city:'Surat',phone:'9999000651',complimentaryAccess:true});
 assert.equal(r.status,201);
 let w=(await owner.get('/api/workspace')).body;
 assert.equal(w.clinic.plan,'free');assert.equal(w.clinic.paid,false);assert.equal(w.clinic.complimentaryAccess,undefined);
 const user=await one('SELECT * FROM users WHERE email=?',['founder@example.in']);
 const token='a'.repeat(64);
 await run('INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)',[hash(token),user.id,'verify',new Date(Date.now()+3600000).toISOString()]);
 assert.equal((await send(owner,'/api/auth/verify',{token})).status,200);
 w=(await owner.get('/api/workspace')).body;
 assert.equal(w.user.verified,true);assert.equal(w.clinic.plan,'pro');assert.equal(w.clinic.paid,true);
 assert.equal(w.clinic.complimentaryAccess,true);assert.equal(w.demo,false);assert.equal(w.clinic.subscriptionId,null);
 assert.equal(w.clinic.paidUntil,process.env.COMPLIMENTARY_ACCESS_UNTIL);
 clinic=await one('SELECT * FROM clinics WHERE user_id=?',[user.id]);
});

test('complimentary live accounts can use Pro and schedule workflows but never enter checkout',async()=>{
 const patient=await send(owner,'/api/patients',{name:'Own test contact',phone:'9999000652',consent:true,consentSource:'Isolated test permission'});assert.equal(patient.status,201);
 assert.equal((await send(owner,'/api/care/treatment',{patientId:patient.body.id,title:'Test proposal',status:'proposed'})).status,201);
 assert.equal((await send(owner,'/api/care/campaign',{title:'Test campaign',status:'draft'})).status,201);
 const settings=JSON.parse(clinic.data);
 assert.equal((await send(owner,'/api/clinic',{...settings,name:clinic.name,reminders:true,messagingConsent:true,complimentaryAccess:false},'patch')).status,200);
 clinic=await one('SELECT * FROM clinics WHERE id=?',[clinic.id]);assert.equal(JSON.parse(clinic.data).complimentaryAccess,true);
 const appointment=await send(owner,'/api/appointments',{patientId:patient.body.id,startsAt:new Date(Date.now()+3*86400000).toISOString()});assert.equal(appointment.status,201);
 assert.ok(await one("SELECT id FROM jobs WHERE clinic_id=? AND kind='reminder'",[clinic.id]));
 const original=global.fetch;let calls=0;
 try{
  global.fetch=async()=>{calls++;throw Error('No payment provider call allowed')};
  for(const plan of ['growth','pro']){const r=await send(owner,'/api/billing/subscribe',{plan});assert.equal(r.status,400);assert.match(r.body.error,/complimentary/)}
  assert.equal(calls,0);
 }finally{global.fetch=original}
});

test('other users cannot claim complimentary access through registration or clinic edits',async()=>{
 assert.equal((await send(other,'/api/auth/register',{email:'other@example.in',password:'Other test password 2026!',name:'Other clinic',city:'Surat',phone:'9999000653',complimentaryAccess:true})).status,201);
 const u=await one('SELECT * FROM users WHERE email=?',['other@example.in']);await run('UPDATE users SET verified=1 WHERE id=?',[u.id]);
 const row=await one('SELECT * FROM clinics WHERE user_id=?',[u.id]);
 assert.equal((await send(other,'/api/clinic',{...JSON.parse(row.data),name:row.name,complimentaryAccess:true,plan:'pro',billingStatus:'complimentary'},'patch')).status,200);
 const w=(await other.get('/api/workspace')).body;assert.equal(w.clinic.plan,'free');assert.equal(w.clinic.paid,false);assert.equal(w.clinic.complimentaryAccess,undefined);
});

test('complimentary expiry removes paid features without renewal, charges or deleting records',async()=>{
 assert.equal(Boolean(paid({...clinic,paid_until:'2000-01-01T00:00:00.000Z'})),false);
 assert.equal(Boolean(paid({...clinic,data:JSON.stringify({...JSON.parse(clinic.data),complimentaryAccess:false})})),false);
 await run('UPDATE clinics SET paid_until=? WHERE id=?',['2000-01-01T00:00:00.000Z',clinic.id]);
 process.env.COMPLIMENTARY_ACCESS_UNTIL=new Date(Date.now()+60*86400000).toISOString();
 const w=(await owner.get('/api/workspace')).body;assert.equal(w.clinic.paid,false);assert.equal(w.clinic.paidUntil,'2000-01-01T00:00:00.000Z');assert.equal(w.patients.length,1);
 assert.equal((await send(owner,'/api/care/campaign',{title:'Expired access',status:'draft'})).status,402);
 assert.equal((await send(owner,'/api/billing/subscribe',{plan:'pro'})).status,400);
});
