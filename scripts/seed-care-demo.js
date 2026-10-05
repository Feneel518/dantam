import {one,all,run,closeDb} from '../server/db.js';
import {encrypt,now} from '../server/security.js';
if(process.env.NODE_ENV==='production')throw new Error('Demo seeding is disabled in production');
const clinic=await one("SELECT c.* FROM clinics c JOIN users u ON u.id=c.user_id WHERE u.email='demo@dantam.local'");
if(!clinic)throw new Error('Run npm run demo first');
const settings=JSON.parse(clinic.data);if(!settings.demo)throw new Error('Only the fictional demo can be seeded');
settings.website ||= {template:'gentle',onboardingStep:1};
await run('UPDATE clinics SET data=? WHERE id=?',[JSON.stringify(settings),clinic.id]);
const patients=await all('SELECT id FROM patients WHERE clinic_id=? ORDER BY created_at',[clinic.id]);
const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
for(let i=0;i<Math.min(6,patients.length);i++){
 for(const [kind,title,status,amount,due] of [['treatment',['Crown consultation','Aligner consultation','Dental implant consultation'][i%3],['proposed','deciding','accepted','started','completed','declined'][i],(i+1)*450000,date(i-2)],['task','Check in after consultation','pending',0,date(i-3)],['recall',['General checkup','Cleaning review','Post-treatment review'][i%3],i===4?'contacted':'upcoming',0,date(i-2)]]){
  await run('INSERT INTO care_records(id,clinic_id,patient_id,kind,status,due_date,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[`demo-${kind}-${i}`,clinic.id,patients[i].id,kind,status,due,encrypt({title,amount,notes:'Fictional demonstration record.',assignedTo:clinic.user_id,type:'general',appointmentId:'',sourceId:'',inactiveMonths:12}),now(),now()]);
 }
}
await closeDb();console.log('Fictional treatment, follow-up and recall demo data ready.');
