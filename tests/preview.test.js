import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
process.env.SQLITE_PATH=':memory:';process.env.ENCRYPTION_KEY='e'.repeat(64);process.env.NODE_ENV='test';process.env.APP_URL='http://localhost:3000';process.env.LAUNCH_MODE='preview';
const {app,errorHandler}=await import('../server/app.js');app.use(errorHandler);
const {one,closeDb}=await import('../server/db.js');after(closeDb);
test('launch preview declares its status and prevents unfinished customer onboarding',async()=>{
 assert.deepEqual((await request(app).get('/api/public-config')).body,{prelaunch:true});
 const r=await request(app).post('/api/auth/register').set('Origin','http://localhost:3000').send({email:'blocked@example.in',name:'Blocked clinic',phone:'9999000899',city:'Surat',password:'Long test password!'});
 assert.equal(r.status,503);assert.equal((await one('SELECT COUNT(*) AS n FROM users')).n,0);
});
