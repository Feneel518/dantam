import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const secrets=JSON.parse(readFileSync('.vercel/hosted-secrets.json','utf8'));
const env={...process.env,...secrets,NODE_ENV:'development',DATABASE_URL:secrets.DATABASE_URL_UNPOOLED,APP_URL:'https://dantam-orpin.vercel.app'};
// This project was created empty for Dantam. Seed only fictional data, using a
// unique private password; never publish the documented local demo password.
for(const args of [['--input-type=module','-e',"await import('./server/auth.js'); const {closeDb}=await import('./server/db.js'); await closeDb();"],['scripts/seed-demo.js'],['scripts/seed-care-demo.js']]){
 const p=spawnSync(process.execPath,args,{env,stdio:'pipe',encoding:'utf8'});
 if(p.status!==0){console.error(p.stderr.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));process.exit(1)}
 console.log(`${args.at(-1).startsWith('scripts/')?args.at(-1):'Database schema and authentication'} completed.`);
}
const config={...secrets,NODE_ENV:'production',APP_URL:env.APP_URL,LAUNCH_MODE:'preview',LEGAL_ENTITY:'Dantam — operator details pending',LEGAL_ADDRESS:'Business address pending — launch preview',SUPPORT_EMAIL:'Support contact pending',TRUST_PROXY:'1'};
delete config.DEMO_PASSWORD;delete config.DATABASE_URL_UNPOOLED;
writeFileSync('.vercel/production-env.json',JSON.stringify(Object.entries(config).map(([key,value])=>({key,value,type:'encrypted',target:['production']}))));
writeFileSync('.vercel/TEST-ACCESS.txt',`Dantam launch preview\n${env.APP_URL}/login\nEmail: demo@dantam.local\nPassword: ${secrets.DEMO_PASSWORD}\nFictional records only. Keep this file private.\n`);
console.log('Production variable payload and private test access saved in .vercel.');
