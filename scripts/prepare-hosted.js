import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const connection=JSON.parse(readFileSync('.vercel/neon-connection.json','utf8'));
const direct=new URL(connection.DATABASE_URL);direct.hostname=direct.hostname.replace('-pooler.','.');
const db=new pg.Client({connectionString:direct.toString(),connectionTimeoutMillis:15000});
try{await db.connect();const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");console.log(`Neon connection verified: ${tables.rows.length} public tables.`);}catch(e){console.error(`Neon connection failed (${e.code||'connection error'}).`);process.exitCode=1;}finally{await db.end();}
if(process.exitCode)process.exit(process.exitCode);
if(!existsSync('.vercel/hosted-secrets.json')){
 const pooled=new URL(direct);pooled.hostname=pooled.hostname.replace('.','-pooler.');
 writeFileSync('.vercel/hosted-secrets.json',JSON.stringify({DATABASE_URL:pooled.toString(),DATABASE_URL_UNPOOLED:direct.toString(),ENCRYPTION_KEY:randomBytes(32).toString('hex'),BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),CRON_SECRET:randomBytes(32).toString('hex'),DEMO_PASSWORD:randomBytes(18).toString('base64url')},null,2));
 console.log('Deployment secrets generated and saved in ignored .vercel directory.');
}
