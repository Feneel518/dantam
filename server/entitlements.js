import { paid } from './workflows.js';
export function requireTier(req,tier='growth'){
 const settings=JSON.parse(req.clinic.data);
 if(settings.demo&&!settings.testAccess)return;
 if(!paid(req.clinic)||(tier==='pro'&&req.clinic.plan!=='pro'))throw Object.assign(new Error(`This workflow requires an active ${tier==='pro'?'Pro':'Growth or Pro'} plan. Your existing records are preserved.`),{status:402});
}
