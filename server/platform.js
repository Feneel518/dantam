import {all} from './db.js';
import {plans} from './config.js';
export const isPlatformAdmin=user=>(process.env.PLATFORM_ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
export function mountPlatform(app,auth){app.get('/api/platform',auth,async(req,res)=>{
 if(!isPlatformAdmin(req.user))return res.status(403).json({error:'Platform operator access is required.'});
 const clinics=await all('SELECT c.id,c.name,c.slug,c.plan,c.billing_status,c.paid_until,c.published,c.created_at,u.email,(SELECT MAX(a.created_at) FROM audit_log a WHERE a.clinic_id=c.id) AS last_activity,(SELECT COUNT(*) FROM appointments x WHERE x.clinic_id=c.id) AS appointments,(SELECT COUNT(*) FROM care_records r WHERE r.clinic_id=c.id AND r.kind=\'task\' AND r.status=\'completed\') AS completed_tasks FROM clinics c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC');
 const active=clinics.filter(c=>c.billing_status==='active'&&c.paid_until>new Date().toISOString());
 res.json({clinics,summary:{clinics:clinics.length,published:clinics.filter(c=>c.published).length,paying:active.length,monthlyValue:active.reduce((n,c)=>n+(plans[c.plan]?.price||0),0),activeThisWeek:clinics.filter(c=>c.last_activity&&Date.parse(c.last_activity)>Date.now()-7*86400000).length}});
 });}
