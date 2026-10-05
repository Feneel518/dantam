import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const configUrl=new URL('../server/config.js',import.meta.url).href;
test('local env overrides load while process variables and test isolation are preserved',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dantam-config-'));
 try {
  writeFileSync(join(dir,'.env.local'),'APP_URL=http://localhost:3456\nGOOGLE_CLIENT_SECRET=local-fixture-only\n');
  writeFileSync(join(dir,'.env'),'APP_URL=http://localhost:4567\n');
  for(const [mode,url,expected,secret] of [['development','', 'http://localhost:3456',true],['development','http://localhost:5678','http://localhost:5678',true],['test','','http://localhost:3000',false]]){
   const env={...process.env,NODE_ENV:mode,ENCRYPTION_KEY:'a'.repeat(64)};delete env.APP_URL;delete env.GOOGLE_CLIENT_SECRET;delete env.VERCEL;if(url)env.APP_URL=url;
   const result=spawnSync(process.execPath,['--input-type=module','-e',`const c=await import(${JSON.stringify(configUrl)});console.log(JSON.stringify({url:c.appUrl,secret:!!process.env.GOOGLE_CLIENT_SECRET}));`],{cwd:dir,env,encoding:'utf8'});
   assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout.trim()),{url:expected,secret});
  }
 }finally{for(const name of ['.env.local','.env'])unlinkSync(join(dir,name));if(existsSync(join(dir,'data')))rmdirSync(join(dir,'data'));rmdirSync(dir);}
});
