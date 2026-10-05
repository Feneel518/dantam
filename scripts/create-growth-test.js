import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const config=JSON.parse(readFileSync('.vercel/hosted-secrets.json','utf8'));
Object.assign(process.env,config,{DATABASE_URL:config.DATABASE_URL_UNPOOLED,NODE_ENV:'production',LAUNCH_MODE:'preview',APP_URL:'https://dantam-orpin.vercel.app'});
const {one,transaction,closeDb}=await import('../server/db.js');
const {id,now,passwordHash}=await import('../server/security.js');
const email='growth-test@dantam.local',file='.vercel/GROWTH-TEST-ACCESS.txt';
try {
  const existing=await one('SELECT id FROM users WHERE email=?',[email]);
  if(existing){if(!existsSync(file))throw new Error('Test account exists but its private access file is missing. No credentials changed.');console.log('Private Growth test account already exists. See '+file);}
  else {
    const userId=id(),clinicId=id(),password=randomBytes(20).toString('base64url'),end=new Date(Date.now()+30*86400000).toISOString(),passwordDigest=await passwordHash(password);
    const data={demo:true,testAccess:true,city:'Your city',phone:'+919999000099',address:'',doctor:'',qualifications:'',registration:'',tagline:'Thoughtful care for your smile.',about:'',hours:'',services:['Dental consultation','Preventive dentistry','Restorative dentistry'],reviewUrl:'',colour:'lagoon',reminders:false,recalls:false,reviewRequests:false,autoReplies:false,website:{template:'gentle'}};
    await transaction(async tx=>{
      await tx.run('INSERT INTO users(id,email,password,verified,created_at) VALUES(?,?,?,?,?)',[userId,email,passwordDigest,1,now()]);
      await tx.run('INSERT INTO clinics(id,user_id,slug,name,data,plan,billing_status,paid_until,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[clinicId,userId,'growth-test-'+id().slice(0,8),'Your Test Dental Clinic',JSON.stringify(data),'growth','testing',end,now()]);
    });
    writeFileSync(file,`PRIVATE GROWTH TEST CLINIC\n\nLogin: ${process.env.APP_URL}/login\nEmail: ${email}\nPassword: ${password}\n\nGrowth access until: ${end}\nAmount charged: Rs 0. No card, payment, subscription, or automatic renewal.\n\nStart at Your website. This account begins with no patients, appointments or sample workflows.\nGrowth features are enabled; Pro-only features are locked. Use fictional records.\nEmail verification is pre-set for this synthetic test identity. This does not test signup or email delivery.\nPublishing, automatic messages and live Google actions remain disabled.\nKeep this file private.\n`,{mode:0o600});
    writeFileSync('.vercel/growth-test-access.json',JSON.stringify({email,password,clinicId,expiresAt:end}),{mode:0o600});
    console.log('Created empty private Growth clinic. Credentials saved in '+file+'. No payment or subscription created.');
  }
} finally {await closeDb();}
