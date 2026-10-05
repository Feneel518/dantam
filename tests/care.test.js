import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createHmac} from 'node:crypto';
import sharp from 'sharp';
process.env.SQLITE_PATH=':memory:';process.env.ENCRYPTION_KEY='d'.repeat(64);process.env.NODE_ENV='test';process.env.APP_URL='http://localhost:3000';
const {app,errorHandler}=await import('../server/app.js');app.use(errorHandler);
const {one,run,closeDb}=await import('../server/db.js');
const {hash}=await import('../server/security.js');
const owner=request.agent(app),other=request.agent(app),reception=request.agent(app),doctor=request.agent(app);
const origin='http://localhost:3000';
const send=(a,url,body,method='post')=>a[method](url).set('Origin',origin).send(body);
let clinic,patient,otherPatient,treatment,recall,appointment;
before(async()=>{
 for(const [a,email,name] of [[owner,'care@example.in','Care Dental'],[other,'othercare@example.in','Other Care']])assert.equal((await send(a,'/api/auth/register',{email,name,password:'Long care test password 2026!',phone:'9999000700',city:'Surat'})).status,201);
 clinic=await one("SELECT * FROM clinics WHERE name='Care Dental'");await run('UPDATE users SET verified=1');
 await run("UPDATE clinics SET plan='pro',billing_status='active',paid_until=?",[new Date(Date.now()+30*86400000).toISOString()]);
 patient=(await send(owner,'/api/patients',{name:'Care Patient',phone:'9999000701',consent:true,consentSource:'Test permission',recallDate:''})).body.id;
 otherPatient=(await send(other,'/api/patients',{name:'Other Patient',phone:'9999000702',consent:false,recallDate:''})).body.id;
});
after(closeDb);
test('treatment records persist and reject cross-clinic patient references',async()=>{
 assert.equal((await send(owner,'/api/care/treatment',{patientId:otherPatient,title:'Crown',status:'proposed',amount:450000})).status,404);
 const r=await send(owner,'/api/care/treatment',{patientId:patient,title:'Crown',status:'proposed',amount:450000,dueDate:'2026-10-02'});assert.equal(r.status,201);treatment=r.body.id;
 const data=(await owner.get('/api/workspace')).body;assert.equal(data.records.find(r=>r.id===treatment).amount,450000);
 assert.equal((await send(other,`/api/care/${treatment}`,{status:'accepted',version:1},'patch')).status,404);
});
test('care record updates use versions to prevent lost changes',async()=>{
 assert.equal((await send(owner,`/api/care/${treatment}`,{status:'deciding',version:1},'patch')).status,200);
 assert.equal((await send(owner,`/api/care/${treatment}`,{status:'accepted',version:1},'patch')).status,409);
 assert.equal((await send(owner,`/api/care/${treatment}`,{status:'invented',version:2},'patch')).status,400);
});
test('recalls synchronize earliest active date and validate dates and assignees',async()=>{
 assert.equal((await send(owner,'/api/care/recall',{patientId:patient,title:'Review',status:'upcoming',dueDate:'2026-02-30'})).status,400);
 assert.equal((await send(owner,'/api/care/task',{patientId:patient,title:'Call patient',status:'pending',dueDate:'2026-10-03',assignedTo:'outsider'})).status,400);
 const r=await send(owner,'/api/care/recall',{patientId:patient,title:'Review',status:'upcoming',dueDate:'2026-10-03'});assert.equal(r.status,201);recall=r.body.id;
 assert.equal((await one('SELECT recall_date FROM patients WHERE id=?',[patient])).recall_date,'2026-10-03');
});
test('manual enquiries retain source and cannot be edited across clinics',async()=>{
 const r=await send(owner,'/api/leads',{name:'Caller',phone:'9999000703',source:'phone',notes:'Call back tomorrow'});assert.equal(r.status,201);
 assert.equal((await send(other,`/api/lead-details/${r.body.id}`,{notes:'Changed',assignedTo:'',status:'lost'},'patch')).status,404);
});
test('staff invitation is single-use and staff sees only its own clinic',async()=>{
 for(const [agent,email,role] of [[reception,'reception@example.in','receptionist'],[doctor,'doctor@example.in','doctor']]){
  const invited=await send(owner,'/api/team/invite',{email,role});assert.equal(invited.status,200);const token=new URL(invited.body.url).searchParams.get('token');
  assert.equal((await send(agent,'/api/team/join',{token,name:role,password:'Staff password long 2026!'})).status,201);
  assert.equal((await send(agent,'/api/team/join',{token,name:role,password:'Staff password long 2026!'})).status,400);
  assert.equal((await send(agent,'/api/auth/login',{email,password:'Staff password long 2026!'})).status,200);
  const w=(await agent.get('/api/workspace')).body;assert.equal(w.clinic.id,clinic.id);assert.equal(w.user.role,role);assert.ok(!w.patients.some(p=>p.id===otherPatient));
 }
});
test('reception cannot modify treatment finances, delete patients, export or manage website and billing',async()=>{
 for(const [url,method,body] of [[`/api/care/${treatment}`,'patch',{status:'accepted',version:2}],[`/api/patients/${patient}`,'delete',{}],['/api/website','patch',{}],['/api/billing/subscribe','post',{plan:'pro'}],['/api/team/invite','post',{}]])assert.equal((await send(reception,url,body,method)).status,403,url);
 assert.equal((await reception.get('/api/export')).status,403);
 const r=(await reception.get('/api/workspace')).body.records.find(r=>r.id===treatment);assert.equal(r.amount,undefined);
 assert.equal((await send(doctor,`/api/care/${treatment}`,{status:'accepted',version:2},'patch')).status,200);
});
test('reception can work through assigned tasks and visit stages',async()=>{
 const task=await send(reception,'/api/care/task',{patientId:patient,title:'Follow up tomorrow',dueDate:'2026-10-03',status:'pending'});assert.equal(task.status,201);
 assert.equal((await send(reception,`/api/care/${task.body.id}`,{status:'completed',version:1},'patch')).status,200);
 const booked=await send(reception,'/api/appointments',{patientId:patient,startsAt:'2026-11-02T06:00:00.000Z'});assert.equal(booked.status,201);appointment=booked.body.id;
 assert.equal((await send(reception,`/api/visit-details/${appointment}`,{doctorId:'',reason:'Consultation',notes:'',stage:'arrived'},'patch')).status,200);
 const w=(await owner.get('/api/workspace')).body;assert.equal(w.appointmentDetails.find(d=>d.id===appointment).stage,'arrived');
 assert.equal((await send(owner,`/api/care/${recall}`,{status:'booked',appointmentId:appointment,version:1},'patch')).status,200);
 assert.equal((await one('SELECT recall_date FROM patients WHERE id=?',[patient])).recall_date,null);
});
test('website schema rejects cross-clinic assets and duplicate service URLs',async()=>{
 const r=await send(owner,'/api/website',{template:'gentle',heroImage:'/media/'+'a'.repeat(32)},'patch');assert.equal(r.status,400);
 const s={id:'a',name:'Cleaning',slug:'cleaning',description:'Care',image:'',active:true};assert.equal((await send(owner,'/api/website',{template:'modern',treatments:[s,{...s,id:'b'}]},'patch')).status,400);
});
test('all templates render escaped clinic content with safe booking endpoints',async()=>{
 for(const template of ['botanical','studio','modern','gentle']){
  assert.equal((await send(owner,'/api/website',{template,faqs:[{question:'Question <script>',answer:'Safe <b>answer</b>'}]},'patch')).status,200);
  const r=await owner.get('/api/clinic/preview');assert.equal(r.status,200);assert.ok(r.text.includes(`template-${template}`));assert.ok(r.text.includes('&lt;script&gt;'));assert.ok(r.text.includes('data-endpoint='));assert.ok(r.text.includes('disabled'));
 }
});
test('new website content survives saving legacy clinic details',async()=>{
 const w=(await owner.get('/api/workspace')).body;assert.equal((await send(owner,'/api/clinic',{...w.clinic,address:'Test road',doctor:'Dr Test',qualifications:'BDS',registration:'TEST',hours:'9 am–5 pm'},'patch')).status,200);
 assert.equal((await owner.get('/api/workspace')).body.clinic.website.template,'gentle');
});
test('published treatment pages and booking requests work without a session',async()=>{
 assert.equal((await send(owner,'/api/website',{template:'studio',treatments:[{id:'clean',name:'Cleaning',slug:'cleaning',description:'A consultation for cleaning options.',image:'',active:true}]},'patch')).status,200);
 assert.equal((await send(owner,'/api/clinic/publish',{publish:true,confirm:true})).status,200);
 const page=await request(app).get(`/c/${clinic.slug}/cleaning`);assert.equal(page.status,200);assert.ok(page.text.includes('A consultation for cleaning options.'));
 assert.equal((await request(app).get(`/c/${clinic.slug}/unknown`)).status,404);
 const r=await send(request(app),`/c/${clinic.slug}/book`,{name:'Public Patient',phone:'9999000704',preferredDate:'2026-11-02',preferredTime:'11:30',patientType:'existing',service:'Cleaning',consent:false});assert.equal(r.status,201);
 const lead=(await owner.get('/api/workspace')).body.leads.find(l=>l.name==='Public Patient');assert.equal(lead.preferredTime,'11:30');assert.equal(lead.patientType,'existing');
});
test('signed missed-call webhooks create a lead exactly once',async()=>{
 const secret='telephony-secret-test-32-characters';await send(owner,'/api/telephony',{secret});
 const body=JSON.stringify({eventId:'call-1',phone:'9999000705',name:'Missed caller',occurredAt:new Date().toISOString()}),signature=createHmac('sha256',secret).update(body).digest('hex');
 const path=`/api/webhooks/missed-call/${clinic.id}`;
 assert.equal((await request(app).post(path).set('Content-Type','application/json').send(body)).status,401);
 for(let i=0;i<2;i++)assert.equal((await request(app).post(path).set('Content-Type','application/json').set('x-dantam-signature',signature).send(body)).status,200);
 assert.equal((await owner.get('/api/workspace')).body.leads.filter(l=>l.name==='Missed caller').length,1);
 const workspace=(await owner.get('/api/workspace')).body,lead=workspace.leads.find(l=>l.name==='Missed caller');assert.equal(workspace.records.filter(r=>r.sourceId===lead.id&&r.title==='Return missed call').length,1);
});
test('export includes new care records and audit actors',async()=>{const r=await owner.get('/api/export');assert.equal(r.status,200);assert.ok(r.body.care_records.some(r=>r.id===treatment));assert.ok(r.body.audit_log.length>0);assert.ok(!JSON.stringify(r.body).includes('telephony-secret'));});

test('reception status updates preserve collections, with or without an attempted override',async()=>{
 await run('UPDATE appointments SET revenue=120000 WHERE id=?',[appointment]);
 for(const extra of [{},{revenue:1}]){
  assert.equal((await send(reception,`/api/appointments/${appointment}`,{status:'attended',...extra},'patch')).status,200);
  assert.equal((await one('SELECT revenue FROM appointments WHERE id=?',[appointment])).revenue,120000);
 }
});

test('doctor diaries allow separate doctors at the same time and reject collisions',async()=>{
 const doctors=['first','second'].map(id=>({id,name:`Doctor ${id}`,qualification:'BDS',registration:'TEST',specialization:'',bio:'',photo:''}));
 assert.equal((await send(owner,'/api/website',{template:'gentle',doctors},'patch')).status,200);
 const body={patientId:patient,startsAt:'2026-11-05T06:00:00.000Z',doctorId:'first'};
 const a=await send(owner,'/api/appointments',body);assert.equal(a.status,201);
 assert.equal((await send(owner,'/api/appointments',body)).status,409);
 const b=await send(owner,'/api/appointments',{...body,doctorId:'second'});assert.equal(b.status,201);
 assert.equal((await send(owner,`/api/visit-details/${b.body.id}`,{doctorId:'first',stage:'confirmed',reason:'',notes:''},'patch')).status,409);
});

test('general tasks work without a patient and appointment links stay within the patient',async()=>{
 const r=await send(owner,'/api/care/task',{title:'Check tomorrow diary',status:'pending',dueDate:'2026-11-03'});assert.equal(r.status,201);
 assert.equal((await send(owner,`/api/care/${r.body.id}`,{status:'completed',version:1},'patch')).status,200);
 const otherVisit=await send(other,'/api/appointments',{patientId:otherPatient,startsAt:'2026-11-06T06:00:00.000Z'});
 assert.equal((await send(owner,'/api/care/recall',{patientId:patient,title:'Review',status:'booked',dueDate:'2026-11-06',appointmentId:otherVisit.body.id})).status,400);
});

test('uploaded images must decode and are normalized before publication',async()=>{
 const malformed=Buffer.from('89504e470d0a1a0a','hex').toString('base64');
 assert.equal((await send(owner,'/api/media',{data:`data:image/png;base64,${malformed}`})).status,400);
 const png=await sharp({create:{width:8,height:8,channels:3,background:'#aabbcc'}}).png().toBuffer();
 const uploaded=await send(owner,'/api/media',{data:`data:image/png;base64,${png.toString('base64')}`});assert.equal(uploaded.status,201);
 const media=await owner.get(uploaded.body.url);assert.match(media.headers['content-type'],/image\/webp/);
 assert.equal((await send(other,'/api/website',{template:'gentle',heroImage:uploaded.body.url},'patch')).status,400);
});

test('optional patient details survive edits from older clients',async()=>{
 const body={name:'Care Patient',phone:'9999000701',consent:true,consentSource:'Test permission',email:'patient@example.in',dateOfBirth:'1990-04-01',gender:'female'};
 assert.equal((await send(owner,`/api/patients/${patient}`,body,'patch')).status,200);
 delete body.email;delete body.dateOfBirth;delete body.gender;
 assert.equal((await send(owner,`/api/patients/${patient}`,body,'patch')).status,200);
 const p=(await owner.get('/api/workspace')).body.patients.find(p=>p.id===patient);assert.equal(p.email,'patient@example.in');assert.equal(p.dateOfBirth,'1990-04-01');
});

test('free plans cannot write paid workflows and a downgrade retains their records',async()=>{
 await run("UPDATE clinics SET plan='free',billing_status='inactive' WHERE id=?",[clinic.id]);
 assert.equal((await send(owner,'/api/care/task',{title:'Restricted task',status:'pending',dueDate:'2026-11-03'})).status,402);
 assert.ok((await owner.get('/api/workspace')).body.records.some(r=>r.id===treatment));
 await run("UPDATE clinics SET plan='pro',billing_status='active' WHERE id=?",[clinic.id]);
});

test('platform metrics require an explicitly configured operator',async()=>{
 assert.equal((await owner.get('/api/platform')).status,403);
 process.env.PLATFORM_ADMIN_EMAILS='care@example.in';
 const r=await owner.get('/api/platform');assert.equal(r.status,200);assert.ok(r.body.summary.clinics>=2);assert.equal(r.body.patients,undefined);
 delete process.env.PLATFORM_ADMIN_EMAILS;
});

test('checkout rejects provider prices that differ from the advertised plan',async()=>{
 const keys=['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','RAZORPAY_PRO_PLAN_ID'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),original=global.fetch;
 try{
  for(const k of keys)process.env[k]='test';
  await run("UPDATE clinics SET billing_status='inactive' WHERE id=?",[clinic.id]);
  let calls=0;global.fetch=async(url,opts)=>{calls++;assert.ok(String(url).endsWith('/plans/test'));assert.equal(opts.method,'GET');return {ok:true,json:async()=>({period:'monthly',interval:1,item:{currency:'INR',amount:599900}})}};
  assert.equal((await send(owner,'/api/billing/subscribe',{plan:'pro'})).status,503);assert.equal(calls,1);
  assert.equal((await one('SELECT billing_status FROM clinics WHERE id=?',[clinic.id])).billing_status,'inactive');
 }finally{global.fetch=original;for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}await run("UPDATE clinics SET billing_status='active' WHERE id=?",[clinic.id]);}
});
test('revoking staff access invalidates its session',async()=>{const u=await one("SELECT id FROM users WHERE email='reception@example.in'");assert.equal((await send(owner,`/api/team/${u.id}`,{},'delete')).status,200);assert.equal((await reception.get('/api/workspace')).status,401);});
test('checkout accepts the revised monthly prices and rejects the former prices',async()=>{
 const keys=['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','RAZORPAY_GROWTH_PLAN_ID','RAZORPAY_PRO_PLAN_ID'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),original=global.fetch;
 const saved=await one('SELECT plan,billing_status,subscription_id FROM clinics WHERE id=?',[clinic.id]);
 try{
  for(const k of keys)process.env[k]='test';
  for(const [plan,amount,former] of [['growth',199900,149900],['pro',299900,249900]]){
   await run("UPDATE clinics SET billing_status='inactive',subscription_id=NULL WHERE id=?",[clinic.id]);
   let providerAmount=former,calls=[];
   global.fetch=async(url,opts)=>{
    calls.push(opts.method);
    if(String(url).endsWith('/plans/test'))return {ok:true,json:async()=>({period:'monthly',interval:1,item:{currency:'INR',amount:providerAmount}})};
    assert.ok(String(url).endsWith('/subscriptions'));assert.equal(opts.method,'POST');
    assert.equal(JSON.parse(opts.body).plan_id,'test');
    return {ok:true,json:async()=>({id:`sub_mock_${plan}`,short_url:'https://example.test/checkout'})};
   };
   assert.equal((await send(owner,'/api/billing/subscribe',{plan})).status,503);
   assert.deepEqual(calls,['GET']);
   providerAmount=amount;calls=[];
   const response=await send(owner,'/api/billing/subscribe',{plan});
   assert.equal(response.status,200);assert.equal(response.body.url,'https://example.test/checkout');
   assert.deepEqual(calls,['GET','POST']);
   const updated=await one('SELECT plan,billing_status FROM clinics WHERE id=?',[clinic.id]);
   assert.equal(updated.plan,plan);assert.equal(updated.billing_status,'created');
  }
 }finally{
  global.fetch=original;
  for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}
  await run('UPDATE clinics SET plan=?,billing_status=?,subscription_id=? WHERE id=?',[saved.plan,saved.billing_status,saved.subscription_id,clinic.id]);
 }
});
test('scheduled worker refuses unauthenticated calls',async()=>{assert.equal((await request(app).get('/api/cron')).status,401);});
