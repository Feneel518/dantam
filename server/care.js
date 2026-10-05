import { z } from 'zod';
import { all, one, run, transaction } from './db.js';
import { id, now, hash, encrypt, decrypt, passwordHash } from './security.js';
import { updateAppointment } from './appointments.js';
import { phone } from './validation.js';
import { appUrl, prelaunch } from './config.js';
import { schedulePatient } from './workflows.js';
import { resolveTxt } from 'node:dns/promises';
import { saveConnection } from './providers.js';
import { requireTier } from './entitlements.js';
import sharp from 'sharp';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (max = 250) => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Choose a valid date');
export const mediaUrl = z.union([z.literal(''), z.string().regex(/^\/media\/[a-f0-9]{32}$/)]);
export const websiteSchema = z.object({
  template: z.enum(['botanical','studio','modern','gentle']), logo: mediaUrl.default(''), heroImage: mediaUrl.default(''),
  heroImageAlt: text(150).default('Clinic photograph'), gallery: z.array(z.object({ image: mediaUrl, caption: text(200) })).max(12).default([]),
  doctors: z.array(z.object({ id: text(80), name: text(120).min(2), qualification: text(200), specialization: text(120), registration: text(100), bio: text(1200), photo: mediaUrl })).max(12).default([]),
  treatments: z.array(z.object({ id: text(80), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), name: text(100).min(2), description: text(4000), image: mediaUrl, active: z.boolean() })).max(30).default([]),
  faqs: z.array(z.object({ question: text(200).min(3), answer: text(1200).min(3) })).max(20).default([]),
  whatsapp: z.union([z.literal(''), phone]).default(''), email: z.union([z.literal(''), z.email()]).default(''),
  state: text(80).default(''), pincode: z.union([z.literal(''), z.string().regex(/^\d{6}$/)]).default(''),
  onboardingStep: z.number().int().min(0).max(6).default(0), onboardingComplete: z.boolean().default(false)
}).superRefine((v,ctx) => { if(new Set(v.treatments.map(t=>t.slug)).size!==v.treatments.length) ctx.addIssue({code:'custom',message:'Treatment page addresses must be unique.'}); if(new Set(v.doctors.map(d=>d.id)).size!==v.doctors.length) ctx.addIssue({code:'custom',message:'Doctor IDs must be unique.'}); });
const states = { treatment:['proposed','deciding','accepted','started','completed','declined'], task:['pending','completed','cancelled'], recall:['upcoming','contacted','booked','completed','skipped'], campaign:['draft','active','completed'], communication:['opened','contacted'] };
const recordSchema = z.object({ patientId:text(80).optional(), title:text(180).min(2), status:text(40), dueDate:z.union([date,z.literal('')]).default(''), notes:text(2000).default(''), amount:z.number().int().min(0).max(100000000).default(0), assignedTo:text(80).default(''), type:text(80).default('general'), appointmentId:text(80).default(''), sourceId:text(80).default(''), inactiveMonths:z.number().int().min(1).max(60).default(12), version:z.number().int().positive().optional() });
export async function audit(req, action, target = null, db = {run}) { await db.run('INSERT INTO audit_log(id,clinic_id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?,?)',[id(),req.clinic.id,req.user.id,action,target,now()]); }
export async function careWorkspace(req) {
  const records = (await all('SELECT * FROM care_records WHERE clinic_id=? ORDER BY updated_at DESC',[req.clinic.id])).map(r=>({id:r.id,kind:r.kind,patientId:r.patient_id,status:r.status,dueDate:r.due_date || '',version:r.version,createdAt:r.created_at,updatedAt:r.updated_at,...decrypt(r.data)}));
  const members = await all('SELECT m.user_id AS id,m.name,m.role,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.clinic_id=?',[req.clinic.id]);
  const owner = await one('SELECT id,email FROM users WHERE id=?',[req.clinic.user_id]);
  members.unshift({...owner,name:'Clinic owner',role:'owner'});
  const details = (await all('SELECT * FROM appointment_details WHERE clinic_id=?',[req.clinic.id])).map(r=>({id:r.appointment_id,...decrypt(r.data)}));
  const logs = req.role==='owner' ? await all('SELECT a.*,u.email AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE a.clinic_id=? ORDER BY a.created_at DESC LIMIT 200',[req.clinic.id]) : [];
  return { records: records.map(r => req.role==='receptionist' ? {...r,amount:undefined} : r), members, appointmentDetails:details, audit:logs, domains:req.role==='owner' ? await all('SELECT * FROM clinic_domains WHERE clinic_id=?',[req.clinic.id]):[] };
}
export function mountCare(app, auth) {
  const owner = (req,res,next) => req.role==='owner' ? next() : res.status(403).json({error:'Only the clinic owner can do this.'});
  app.get('/api/care',auth,async(req,res)=>res.json(await careWorkspace(req)));
  app.post('/api/telephony',auth,owner,async(req,res)=>{const secret=z.string().min(32).max(200).parse(req.body.secret);await saveConnection(req.clinic.id,'telephony',{secret});res.json({url:`${appUrl}/api/webhooks/missed-call/${req.clinic.id}`});});
  app.post('/api/care/:kind',auth,async(req,res)=>{
    const kind=req.params.kind; if(!states[kind]) fail(404,'Unknown workflow');
    requireTier(req,['treatment','campaign'].includes(kind)?'pro':'growth');
    const input=recordSchema.parse(req.body); if(!states[kind].includes(input.status)) fail(400,'Invalid status');
    if(['treatment','recall','communication'].includes(kind) && !input.patientId) fail(400,'Choose a patient');
    if(kind==='task' && input.sourceId && !await one('SELECT id FROM leads WHERE id=? AND clinic_id=?',[input.sourceId,req.clinic.id]))fail(404,'Enquiry not found');
    if(input.patientId && !await one('SELECT id FROM patients WHERE id=? AND clinic_id=?',[input.patientId,req.clinic.id])) fail(404,'Patient not found');
    if(input.assignedTo && input.assignedTo!==req.clinic.user_id && !await one('SELECT user_id FROM memberships WHERE user_id=? AND clinic_id=?',[input.assignedTo,req.clinic.id])) fail(400,'Choose a member of this clinic');
    if(kind==='treatment' && req.role==='receptionist') fail(403,'A doctor or owner manages treatment proposals');
    if(kind==='campaign' && req.role!=='owner') fail(403,'Only owners manage campaigns');
    if(['task','recall'].includes(kind) && !input.dueDate) fail(400,'Choose a due date');
    if(input.appointmentId && !await one('SELECT id FROM appointments WHERE id=? AND clinic_id=? AND patient_id=?',[input.appointmentId,req.clinic.id,input.patientId||null])) fail(400,'Choose an appointment for this patient');
    const key=id(),{patientId,status,dueDate,version,...data}=input;
    await transaction(async tx=>{await tx.run('INSERT INTO care_records(id,clinic_id,patient_id,kind,status,due_date,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[key,req.clinic.id,patientId||null,kind,status,dueDate||null,encrypt(data),now(),now()]);await audit(req,`${kind} created`,key,tx);});
    if(kind==='recall') await syncRecall(req.clinic,patientId);
    res.status(201).json({id:key});
  });
  app.patch('/api/care/:id',auth,async(req,res)=>{
    const row=await one('SELECT * FROM care_records WHERE id=? AND clinic_id=?',[req.params.id,req.clinic.id]); if(!row) fail(404,'Record not found');
    requireTier(req,['treatment','campaign'].includes(row.kind)?'pro':'growth');
    if(row.kind==='treatment' && req.role==='receptionist') fail(403,'A doctor or owner manages treatment proposals');
    if(row.kind==='campaign' && req.role!=='owner') fail(403,'Only owners manage campaigns');
    const input=recordSchema.parse({...decrypt(row.data),patientId:row.patient_id||undefined,dueDate:row.due_date||'',status:row.status,...req.body});
    if(input.version!==row.version) fail(409,'This record changed in another session. Refresh and try again.');
    if(!states[row.kind].includes(input.status)) fail(400,'Invalid status');
    if((input.patientId||null)!==row.patient_id) fail(400,'The patient cannot be changed');
    if(row.kind==='task'&&input.sourceId&&!await one('SELECT id FROM leads WHERE id=? AND clinic_id=?',[input.sourceId,req.clinic.id]))fail(404,'Enquiry not found');
    if(['task','recall'].includes(row.kind) && !input.dueDate) fail(400,'Choose a due date');
    if(input.assignedTo && input.assignedTo!==req.clinic.user_id && !await one('SELECT user_id FROM memberships WHERE user_id=? AND clinic_id=?',[input.assignedTo,req.clinic.id])) fail(400,'Choose a member of this clinic');
    if(input.appointmentId && !await one('SELECT id FROM appointments WHERE id=? AND clinic_id=? AND patient_id=?',[input.appointmentId,req.clinic.id,row.patient_id])) fail(400,'Choose an appointment for this patient');
    const {patientId,status,dueDate,version,...data}=input;
    await transaction(async tx=>{if(!await tx.run('UPDATE care_records SET status=?,due_date=?,data=?,version=version+1,updated_at=? WHERE id=? AND clinic_id=? AND version=?',[status,dueDate||null,encrypt(data),now(),row.id,req.clinic.id,version])) fail(409,'Record changed. Refresh and try again.');await audit(req,`${row.kind} updated: ${status}`,row.id,tx);});
    if(row.kind==='recall') await syncRecall(req.clinic,row.patient_id);
    res.json({ok:true});
  });
  app.delete('/api/care/:id',auth,owner,async(req,res)=>{const row=await one('SELECT * FROM care_records WHERE id=? AND clinic_id=?',[req.params.id,req.clinic.id]);if(!row)fail(404,'Record not found');await transaction(async tx=>{await tx.run('DELETE FROM care_records WHERE id=? AND clinic_id=?',[row.id,req.clinic.id]);await audit(req,`${row.kind} deleted`,row.id,tx);});if(row.kind==='recall')await syncRecall(req.clinic,row.patient_id);res.json({ok:true});});
  app.post('/api/leads',auth,async(req,res)=>{
    const v=z.object({name:text(100).min(2),phone,source:z.enum(['phone','walk_in','referral','whatsapp','instagram','google','other']),service:text(100).default('Dental consultation'),notes:text(2000).default('')}).parse(req.body);
    const key=id();await run('INSERT INTO leads(id,clinic_id,data,source,status,created_at) VALUES(?,?,?,?,?,?)',[key,req.clinic.id,encrypt({...v,consent:false}),v.source,'new',now()]);await audit(req,'Manual enquiry created',key);res.status(201).json({id:key});
  });
  app.patch('/api/lead-details/:id',auth,async(req,res)=>{
    const r=await one('SELECT * FROM leads WHERE id=? AND clinic_id=?',[req.params.id,req.clinic.id]);if(!r)fail(404,'Enquiry not found');
    const v=z.object({name:text(100).min(2).optional(),phone:phone.optional(),service:text(100).optional(),preferredDate:z.union([date,z.literal('')]).optional(),preferredTime:z.union([z.literal(''),z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional(),notes:text(2000),assignedTo:text(80),status:z.enum(['new','contacted','booked','converted','lost','closed'])}).parse(req.body);
    if(v.assignedTo && v.assignedTo!==req.clinic.user_id && !await one('SELECT user_id FROM memberships WHERE user_id=? AND clinic_id=?',[v.assignedTo,req.clinic.id]))fail(400,'Choose a clinic team member');
    await transaction(async tx => {
      const appointment = await tx.one('SELECT * FROM appointments WHERE lead_id=? AND clinic_id=?', [r.id, req.clinic.id]);
      const linkedStatus = appointment?.status === 'attended' ? 'converted' : appointment?.status === 'booked' ? 'booked' : null;
      if (linkedStatus && v.status !== linkedStatus) fail(400, 'Manage the linked appointment in reception to change its booking status.');
      if (['booked','converted'].includes(v.status) && v.status !== linkedStatus) fail(400, 'Confirm an appointment time to book this enquiry. Completed visits are converted automatically.');
      const {status,...fields}=v;
      await tx.run('UPDATE leads SET data=?,status=? WHERE id=? AND clinic_id=?',[encrypt({...decrypt(r.data),...fields}),status,r.id,req.clinic.id]);
      await audit(req,'Enquiry updated',r.id,tx);
    });
    res.json({ok:true});
  });
  app.patch('/api/visit-details/:id',auth,async(req,res)=>{
    const v=z.object({doctorId:text(80),reason:text(200),notes:text(1000),startsAt:z.iso.datetime().optional(),stage:z.enum(['confirmed','arrived','in_progress','completed','no_show','cancelled'])}).parse(req.body);
    const status={confirmed:'booked',arrived:'booked',in_progress:'booked',completed:'attended',no_show:'no_show',cancelled:'cancelled'}[v.stage];
    const {startsAt,...details}=v;
    await updateAppointment(req.clinic, req.params.id, {status, doctorId:v.doctorId, startsAt}, details);
    await audit(req,`Visit ${v.stage}`,req.params.id);
    res.json({ok:true});
  });
  app.patch('/api/website',auth,owner,async(req,res)=>{
    const v=websiteSchema.parse(req.body);
    const images=[v.logo,v.heroImage,...v.gallery.map(g=>g.image),...v.doctors.map(d=>d.photo),...v.treatments.map(t=>t.image)].filter(Boolean);
    for(const url of images)if(!await one('SELECT id FROM media WHERE id=? AND clinic_id=?',[url.split('/').pop(),req.clinic.id]))fail(400,'Upload images to your own clinic');
    const data=JSON.parse(req.clinic.data);data.website=v;
    await run('UPDATE clinics SET data=? WHERE id=?',[JSON.stringify(data),req.clinic.id]);await audit(req,'Website content updated');res.json({ok:true});
  });
  app.post('/api/media',auth,owner,async(req,res)=>{
    const {data}=z.object({data:z.string().max(2800000)}).parse(req.body);
    const match=data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)fail(400,'Use a JPEG, PNG or WebP image');
    const bytes=Buffer.from(match[2],'base64');if(bytes.length>2000000)fail(400,'Use an image smaller than 2 MB');
    const valid=match[1]==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':match[1]==='image/jpeg'?bytes.subarray(0,3).toString('hex')==='ffd8ff':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)fail(400,'Image contents do not match its format');
    const count=await one('SELECT COUNT(*) AS n FROM media WHERE clinic_id=?',[req.clinic.id]);if(Number(count.n)>=100)fail(400,'This clinic has reached its 100 image limit. Remove unused images first.');
    let normalized;try{normalized=await sharp(bytes,{limitInputPixels:25000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer()}catch{fail(400,'This image could not be decoded. Choose a valid image under 25 megapixels.');}
    const key=id();await run('INSERT INTO media(id,clinic_id,mime,content,created_at) VALUES(?,?,?,?,?)',[key,req.clinic.id,'image/webp',normalized.toString('base64'),now()]);res.status(201).json({url:`/media/${key}`});
  });
  app.get('/media/:id',async(req,res,next)=>{
    const row=await one('SELECT m.*,c.published FROM media m JOIN clinics c ON c.id=m.clinic_id WHERE m.id=?',[req.params.id]);if(!row)return res.sendStatus(404);
    const send=()=>res.set('Cache-Control',row.published?'public, max-age=3600':'private, no-store').type(row.mime).send(Buffer.from(row.content,'base64'));
    if(row.published)return send();await auth(req,res,()=>req.clinic.id===row.clinic_id?send():res.sendStatus(404));
  });
  app.get('/api/media',auth,owner,async(req,res)=>res.json({images:await all('SELECT id,mime,created_at FROM media WHERE clinic_id=?',[req.clinic.id])}));
  app.delete('/api/media/:id',auth,owner,async(req,res)=>{if(JSON.stringify(JSON.parse(req.clinic.data).website||{}).includes(`/media/${req.params.id}`))fail(400,'Remove this image from your website content first');await run('DELETE FROM media WHERE id=? AND clinic_id=?',[req.params.id,req.clinic.id]);res.json({ok:true});});
  app.post('/api/team/invite',auth,owner,async(req,res)=>{
    requireTier(req,'pro');
    const v=z.object({email:z.email().transform(s=>s.toLowerCase()),role:z.enum(['doctor','receptionist'])}).parse(req.body);
    if(!req.user.verified)fail(400,'Verify your email before inviting staff');
    if(await one('SELECT id FROM users WHERE email=?',[v.email]))fail(409,'This email already has an account. Use a separate staff email.');
    const token=id()+id();await run('INSERT INTO invitations(token_hash,clinic_id,email,role,expires_at) VALUES(?,?,?,?,?)',[hash(token),req.clinic.id,v.email,v.role,new Date(Date.now()+7*86400000).toISOString()]);await audit(req,'Staff invitation created');res.json({url:`${appUrl}/join?token=${token}`});
  });
  app.get('/api/invitation',async(req,res)=>{const row=await one('SELECT i.email,i.role,c.name FROM invitations i JOIN clinics c ON c.id=i.clinic_id WHERE i.token_hash=? AND i.expires_at>?',[hash(String(req.query.token||'')),now()]);if(!row)fail(404,'Invitation expired or already used');res.json(row);});
  app.post('/api/team/join',async(req,res)=>{
    const v=z.object({token:z.string().length(64),name:text(100).min(2),password:z.string().min(12).max(128)}).parse(req.body);const password=await passwordHash(v.password);
    await transaction(async tx=>{const invite=await tx.one('SELECT * FROM invitations WHERE token_hash=? AND expires_at>?',[hash(v.token),now()]);if(!invite)fail(400,'Invitation expired or already used');if(!await tx.run('DELETE FROM invitations WHERE token_hash=?',[hash(v.token)]))fail(409,'Invitation already used');const key=id();await tx.run('INSERT INTO users(id,email,password,verified,created_at) VALUES(?,?,?,?,?)',[key,invite.email,password,1,now()]);await tx.run('INSERT INTO memberships(user_id,clinic_id,role,name) VALUES(?,?,?,?)',[key,invite.clinic_id,invite.role,v.name]);});res.status(201).json({ok:true});
  });
  app.delete('/api/team/:id',auth,owner,async(req,res)=>{await transaction(async tx=>{if(!await tx.one('SELECT user_id FROM memberships WHERE user_id=? AND clinic_id=?',[req.params.id,req.clinic.id]))fail(404,'Staff member not found');await tx.run('DELETE FROM auth_user WHERE id=?',[req.params.id]);await tx.run('DELETE FROM users WHERE id=?',[req.params.id]);await audit(req,'Staff access removed',req.params.id,tx);});res.json({ok:true});});
  app.post('/api/domains',auth,owner,async(req,res)=>{const host=z.string().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).max(253).parse(req.body.hostname);const token=id();await run('INSERT INTO clinic_domains(hostname,clinic_id,token) VALUES(?,?,?)',[host,req.clinic.id,token]);res.status(201).json({hostname:host,token});});
  app.post('/api/domains/verify',auth,owner,async(req,res)=>{const row=await one('SELECT * FROM clinic_domains WHERE hostname=? AND clinic_id=?',[String(req.body.hostname),req.clinic.id]);if(!row)fail(404,'Domain not found');let entries=[];try{entries=await resolveTxt(`_dantam.${row.hostname}`);}catch{}if(!entries.some(e=>e.join('')===row.token))fail(400,'Verification TXT record not found yet');await run('UPDATE clinic_domains SET verified_at=? WHERE hostname=?',[now(),row.hostname]);res.json({ok:true});});
  app.delete('/api/domains/:hostname',auth,owner,async(req,res)=>{await run('DELETE FROM clinic_domains WHERE hostname=? AND clinic_id=?',[req.params.hostname,req.clinic.id]);res.json({ok:true});});
  app.get('/api/launch-status',auth,owner,async(req,res)=>{
    const last=await one("SELECT completed_at FROM worker_runs WHERE id='last-success'");
    const check=(label,ready)=>({label,ready:Boolean(ready)});
    res.json({checks:[check('Public HTTPS address',appUrl.startsWith('https://')),check('PostgreSQL database',process.env.DATABASE_URL),check('Email delivery',process.env.SMTP_HOST&&process.env.MAIL_FROM),check('Google OAuth',process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),check('Razorpay subscriptions',process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_GROWTH_PLAN_ID&&process.env.RAZORPAY_PRO_PLAN_ID),check('Operator details',!prelaunch&&process.env.LEGAL_ENTITY&&process.env.LEGAL_ADDRESS&&process.env.SUPPORT_EMAIL),check('Scheduled worker ran in last 15 minutes',last&&Date.now()-Date.parse(last.completed_at)<900000)],workerLastSuccess:last?.completed_at||null});
  });
}
async function syncRecall(clinic,patientId){
  const next=await one("SELECT due_date FROM care_records WHERE clinic_id=? AND patient_id=? AND kind='recall' AND status IN ('upcoming','contacted') ORDER BY due_date LIMIT 1",[clinic.id,patientId]);
  await run('UPDATE patients SET recall_date=? WHERE id=? AND clinic_id=?',[next?.due_date||null,patientId,clinic.id]);
  const pending=await all("SELECT id,data FROM jobs WHERE clinic_id=? AND patient_id=? AND kind='recall' AND state='pending'",[clinic.id,patientId]);
  for(const job of pending)if(decrypt(job.data).recallDate!==next?.due_date)await run("UPDATE jobs SET state='cancelled' WHERE id=?",[job.id]);
  await schedulePatient(clinic,await one('SELECT * FROM patients WHERE id=?',[patientId]));
}
