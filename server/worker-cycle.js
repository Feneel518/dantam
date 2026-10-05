import { all, run } from './db.js';
import { maintenance, processJobs, syncReviews, paid, event } from './workflows.js';
import { connection, saveConnection } from './providers.js';
import { now } from './security.js';
export async function workerCycle(){
 const deadline=Date.now()+180000;
 await maintenance();
 // Process the message queue before less time-sensitive Google synchronization.
 await processJobs({deadline});
 const clinics=await all("SELECT c.* FROM clinics c JOIN connections x ON x.clinic_id=c.id AND x.provider='google' WHERE c.billing_status IN ('active','complimentary') ORDER BY x.updated_at LIMIT 3");
 for(const clinic of clinics){
  if(Date.now()>=deadline)break;
  if(JSON.parse(clinic.data).demo || !paid(clinic))continue;
  const google=await connection(clinic.id,'google');
  if(google?.location&&(!google.lastSync||google.lastSync<Date.now()-15*60000)){
   await saveConnection(clinic.id,'google',{...google,lastSync:Date.now()});
   try{await syncReviews(clinic)}catch{await event(clinic.id,'Google sync needs attention. Refresh your connection.');}
  }
 }
 await run("INSERT INTO worker_runs(id,completed_at) VALUES('last-success',?) ON CONFLICT(id) DO UPDATE SET completed_at=excluded.completed_at",[now()]);
}
