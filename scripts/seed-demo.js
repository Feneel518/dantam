import { run, one, transaction, closeDb } from '../server/db.js';
import { id, now, passwordHash, encrypt, phoneHash } from '../server/security.js';
if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
const email = 'demo@dantam.local', password = process.env.DEMO_PASSWORD || 'DantamDemo2026!';
if (await one('SELECT id FROM users WHERE email=?', [email])) { console.log('Demo workspace already exists.'); await closeDb(); process.exit(0); }
const userId = id(), clinicId = id();
const offset = days => new Date(Date.now() + days * 86400000).toISOString();
const settings = { demo: true, city: 'Hyderabad', phone: '+919999000001', address: 'Example clinic address, Jubilee Hills', doctor: 'Dr. Ananya Rao (fictional)', qualifications: 'BDS · Example qualification', registration: 'DEMO-ONLY',
  tagline: 'Thoughtful care for every smile.', about: 'This fictional clinic demonstrates the Dantam website and patient workflow. These are sample records, not real patients or business results.',
  hours: 'Monday–Saturday, 10 am–7 pm', services: ['Dental consultation','Preventive dentistry','Restorative dentistry','Smile consultation'], colour: 'lagoon', reviewUrl: '',
  reminders: true, recalls: true, reviewRequests: false, autoReplies: false, messagingConsentAt: now(), clinicConfirmedAt: now() };
const hashedPassword = await passwordHash(password);
await transaction(async tx => {
  await tx.run('INSERT INTO users(id,email,password,verified,created_at) VALUES(?,?,?,?,?)', [userId,email,hashedPassword,1,now()]);
  await tx.run('INSERT INTO clinics(id,user_id,slug,name,data,plan,billing_status,paid_until,created_at) VALUES(?,?,?,?,?,?,?,?,?)', [clinicId,userId,'example-dental-demo','The Smile Studio (Demo)',JSON.stringify(settings),'growth','active',offset(30),now()]);
  const names = ['Aarav Shah','Meera Iyer','Kabir Patel','Nisha Reddy','Rohan Verma','Ishita Nair','Vikram Rao','Priya Menon','Dev Sharma','Sneha Das','Arjun Kapoor','Diya Joshi'];
  for (const [index, name] of names.entries()) {
    const patientId = id(), phone = `+91999900${String(index+10).padStart(4,'0')}`;
    await tx.run('INSERT INTO patients(id,clinic_id,data,phone_hash,consent,consent_at,consent_source,recall_date,created_at) VALUES(?,?,?,?,?,?,?,?,?)', [patientId,clinicId,encrypt({name,phone}),phoneHash(phone),index%3===0?0:1,now(),'Fictional demo permission',offset(index+3).slice(0,10),offset(-40)]);
    const pastId = id();
    await tx.run('INSERT INTO appointments(id,clinic_id,patient_id,starts_at,status,revenue,created_at) VALUES(?,?,?,?,?,?,?)', [pastId,clinicId,patientId,offset(-index-2),'attended',(index%4+1)*80000,offset(-40)]);
    if(index < 5) await tx.run('INSERT INTO appointments(id,clinic_id,patient_id,starts_at,status,revenue,created_at) VALUES(?,?,?,?,?,?,?)', [id(),clinicId,patientId,offset(-35-index),'attended',50000,offset(-45)]);
    if(index < 4) {
      const startsAt = new Date(Date.now()+86400000*(index+1)); startsAt.setUTCHours(5+index,0,0,0);
      const appointmentId=id();
      await tx.run('INSERT INTO appointments(id,clinic_id,patient_id,starts_at,status,created_at) VALUES(?,?,?,?,?,?)', [appointmentId,clinicId,patientId,startsAt.toISOString(),'booked',now()]);
      await tx.run('INSERT INTO jobs(id,clinic_id,patient_id,kind,data,due_at,state,updated_at) VALUES(?,?,?,?,?,?,?,?)', [id(),clinicId,patientId,'reminder',encrypt({appointmentId}),startsAt.toISOString(),'cancelled',now()]);
    }
  }
  for(const [index,name] of ['Riya Singh','Aditya Bose','Anjali Kumar'].entries()) await tx.run('INSERT INTO leads(id,clinic_id,data,source,status,created_at) VALUES(?,?,?,?,?,?)', [id(),clinicId,encrypt({name,phone:`+9199990001${index}0`,service:'Dental consultation',preferredDate:offset(index+1).slice(0,10),consent:false}),'website',index===1?'contacted':'new',offset(-index)]);
  for (const action of ['Fictional demo workspace created','Sample clinic website prepared','Example patient records added','Sample attended visits recorded']) await tx.run('INSERT INTO events(id,clinic_id,action,created_at) VALUES(?,?,?,?)',[id(),clinicId,action,now()]);
});
await closeDb();
console.log('Local demo created: demo@dantam.local. Password: DEMO_PASSWORD or the default documented in README.md. No live messages are sent.');
