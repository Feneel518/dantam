import { z } from 'zod';
import { one, transaction } from './db.js';
import { id, now, validSignature, encrypt, hash } from './security.js';
import { connection } from './providers.js';
import { phone } from './validation.js';
// Provider bridges post this normalized event. No automatic patient message is sent.
export function mountMissedCalls(app,express){
 app.post('/api/webhooks/missed-call/:clinicId',express.raw({type:'application/json',limit:'20kb'}),async(req,res)=>{
  const provider=await connection(req.params.clinicId,'telephony');
  if(!provider?.secret||!validSignature(req.body,req.get('x-dantam-signature'),provider.secret))return res.status(401).json({error:'Invalid webhook signature'});
  const event=z.object({eventId:z.string().min(1).max(150),phone,name:z.string().max(100).default('Missed call'),occurredAt:z.iso.datetime()}).parse(JSON.parse(req.body.toString()));
  const clinic=await one('SELECT * FROM clinics WHERE id=?',[req.params.clinicId]);if(!clinic)return res.sendStatus(404);
  const key=`call:${clinic.id}:${hash(event.eventId)}`;
  await transaction(async tx=>{
   if(!await tx.run('INSERT INTO webhook_events(id,created_at) VALUES(?,?) ON CONFLICT(id) DO NOTHING',[key,now()]))return;
   const leadId=id();
   await tx.run('INSERT INTO leads(id,clinic_id,data,source,status,created_at) VALUES(?,?,?,?,?,?)',[leadId,clinic.id,encrypt({name:event.name,phone:event.phone,service:'Callback requested',notes:`Missed call at ${event.occurredAt}`,consent:false}),'phone','new',now()]);
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   await tx.run('INSERT INTO care_records(id,clinic_id,kind,status,due_date,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',[id(),clinic.id,'task','pending',date,encrypt({title:'Return missed call',sourceId:leadId,assignedTo:clinic.user_id,type:'lead',notes:'Review the enquiry and call back. Messaging permission has not been recorded.',amount:0}),now(),now()]);
  });res.json({received:true});
 });
}
