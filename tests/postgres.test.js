import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
process.env.NODE_ENV='test'; process.env.SQLITE_PATH=':memory:'; process.env.ENCRYPTION_KEY='c'.repeat(64);
const { schema, closeDb } = await import('../server/db.js');
const db = new PGlite();
after(async () => { await db.close(); await closeDb(); });
test('schema and indexes execute idempotently in PostgreSQL', async () => { await db.exec(schema); await db.exec(schema); const result=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");assert.ok(result.rows.some(r=>r.tablename==='clinics')); });
test('PostgreSQL supports app upserts, encrypted text and parameterized writes', async () => {
  await db.query('INSERT INTO users(id,email,password,created_at) VALUES($1,$2,$3,$4)',['u','test@pg.local','hash','2026-10-01']);
  await db.query('INSERT INTO clinics(id,user_id,slug,name,data,created_at) VALUES($1,$2,$3,$4,$5,$6)',['c','u','pg-clinic','Clinic','{}','2026-10-01']);
  await db.query('INSERT INTO patients(id,clinic_id,data,phone_hash,created_at) VALUES($1,$2,$3,$4,$5)',['p','c','encrypted','phone-hash','2026-10-01']);
  await db.query('INSERT INTO rate_limits(id,count,expires_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET count=rate_limits.count+1',['bucket',1,'2026-10-03']);
  await db.query('INSERT INTO rate_limits(id,count,expires_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET count=rate_limits.count+1',['bucket',1,'2026-10-03']);
  assert.equal((await db.query("SELECT count FROM rate_limits WHERE id='bucket'")).rows[0].count,2);
});
test('PostgreSQL rejects simultaneous bookings at an occupied start time',async()=>{
  await db.query('INSERT INTO appointments(id,clinic_id,patient_id,starts_at,created_at) VALUES($1,$2,$3,$4,$5)',['a','c','p','2026-11-01T05:30:00.000Z','2026-10-01']);
  await assert.rejects(db.query('INSERT INTO appointments(id,clinic_id,patient_id,starts_at,created_at) VALUES($1,$2,$3,$4,$5)',['b','c','p','2026-11-01T05:30:00.000Z','2026-10-01']),e=>e.code==='23505');
});
test('PostgreSQL transactions roll back partial writes',async()=>{
  await assert.rejects(db.transaction(async tx=>{await tx.query("UPDATE clinics SET name='Changed' WHERE id='c'");throw new Error('rollback');}));
  assert.equal((await db.query("SELECT name FROM clinics WHERE id='c'")).rows[0].name,'Clinic');
});
test('PostgreSQL deletion cascades clinic records without orphaning patient data',async()=>{
  await db.query("DELETE FROM users WHERE id='u'");
  assert.equal((await db.query('SELECT * FROM clinics')).rows.length,0);assert.equal((await db.query('SELECT * FROM patients')).rows.length,0);assert.equal((await db.query('SELECT * FROM appointments')).rows.length,0);
});
