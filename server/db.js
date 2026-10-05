import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import './config.js';

export const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clinics (id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, plan TEXT NOT NULL DEFAULT 'free', billing_status TEXT NOT NULL DEFAULT 'inactive', subscription_id TEXT, paid_until TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, data TEXT NOT NULL, phone_hash TEXT NOT NULL, consent INTEGER NOT NULL DEFAULT 0, consent_at TEXT, consent_source TEXT, recall_date TEXT, created_at TEXT NOT NULL, UNIQUE(clinic_id, phone_hash));
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, data TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, lead_id TEXT REFERENCES leads(id), doctor_id TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked', revenue INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, provider TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(clinic_id, provider));
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, data TEXT NOT NULL, rating INTEGER NOT NULL, reply TEXT, status TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE, kind TEXT NOT NULL, data TEXT NOT NULL, due_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, provider_id TEXT, error TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, action TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_usage (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS usage_clinic ON message_usage(clinic_id,created_at);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state, due_at);
CREATE INDEX IF NOT EXISTS appointments_clinic ON appointments(clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS events_clinic ON events(clinic_id, created_at);
CREATE INDEX IF NOT EXISTS leads_clinic ON leads(clinic_id, created_at);
CREATE INDEX IF NOT EXISTS reviews_clinic ON reviews(clinic_id);
CREATE INDEX IF NOT EXISTS patients_clinic ON patients(clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_request ON appointments(clinic_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot ON appointments(clinic_id,doctor_id,starts_at) WHERE status='booked';
CREATE TABLE IF NOT EXISTS memberships (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('doctor','receptionist')), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('doctor','receptionist')), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_records (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE, kind TEXT NOT NULL, status TEXT NOT NULL, due_date TEXT, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS care_clinic_kind ON care_records(clinic_id,kind,due_date);
CREATE TABLE IF NOT EXISTS appointment_details (appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, mime TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clinic_domains (hostname TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, token TEXT NOT NULL, verified_at TEXT);
CREATE TABLE IF NOT EXISTS worker_runs (id TEXT PRIMARY KEY, completed_at TEXT NOT NULL);
INSERT INTO schema_migrations(version,applied_at) VALUES('002-care-workspace','2026-10-02T00:00:00.000Z') ON CONFLICT(version) DO NOTHING;
`;
let sqlite, pool;
if (process.env.DATABASE_URL) {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis:15000, idleTimeoutMillis:10000 });
  if(process.env.VERCEL)attachDatabasePool(pool);
  await pool.query(schema.replace(/CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot[^;]+;/,''));
} else {
  const path = process.env.SQLITE_PATH || 'data/dantam.sqlite';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sqlite.exec(schema.replace(/CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot[^;]+;/,''));
}
// Versioned, additive upgrade for existing installations. All prior bookings retain
// their original shared diary until explicitly assigned to a doctor.
if(pool){
  await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id TEXT NOT NULL DEFAULT ''");
  await pool.query("DROP INDEX IF EXISTS appointments_slot; CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot ON appointments(clinic_id,doctor_id,starts_at) WHERE status='booked'");
  await pool.query("INSERT INTO schema_migrations(version,applied_at) VALUES('003-doctor-diary',NOW()::text) ON CONFLICT(version) DO NOTHING");
}else{
  if(!sqlite.prepare('PRAGMA table_info(appointments)').all().some(c=>c.name==='doctor_id'))sqlite.exec("ALTER TABLE appointments ADD COLUMN doctor_id TEXT NOT NULL DEFAULT ''");
  sqlite.exec("DROP INDEX IF EXISTS appointments_slot; CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot ON appointments(clinic_id,doctor_id,starts_at) WHERE status='booked'");
  sqlite.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES('003-doctor-diary',?) ON CONFLICT(version) DO NOTHING").run(new Date().toISOString());
}
function postgresSql(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
export async function all(sql, params = []) {
  if (!pool) await sqliteQueue;
  return pool ? (await pool.query(postgresSql(sql), params)).rows : sqlite.prepare(sql).all(...params);
}
export async function one(sql, params = []) { return (await all(sql, params))[0]; }
export async function run(sql, params = []) {
  if (!pool) await sqliteQueue;
  return pool ? (await pool.query(postgresSql(sql), params)).rowCount : Number(sqlite.prepare(sql).run(...params).changes);
}
// A dedicated PostgreSQL connection makes multi-step writes atomic; SQLite serialises transactions.
export async function transaction(fn) {
  if (pool) {
    const client = await pool.connect();
    const tx = { all: async (s, p = []) => (await client.query(postgresSql(s), p)).rows,
      run: async (s, p = []) => (await client.query(postgresSql(s), p)).rowCount };
    tx.one = async (s, p) => (await tx.all(s, p))[0];
    try { await client.query('BEGIN'); const result = await fn(tx); await client.query('COMMIT'); return result; }
    catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  // Async transactions are queued so overlapping requests cannot join another transaction.
  const previous = sqliteQueue;
  let release; sqliteQueue = new Promise(resolve => { release = resolve; });
  await previous;
  const tx = {
    all: async (s, p = []) => sqlite.prepare(s).all(...p),
    one: async (s, p = []) => sqlite.prepare(s).get(...p),
    run: async (s, p = []) => Number(sqlite.prepare(s).run(...p).changes),
  };
  try { sqlite.exec('BEGIN IMMEDIATE'); const result = await fn(tx); sqlite.exec('COMMIT'); return result; }
  catch (e) { sqlite.exec('ROLLBACK'); throw e; } finally { release(); }
}
let sqliteQueue = Promise.resolve();
export const authDatabase = pool || sqlite;
// Better Auth uses the same SQLite connection. Serialize its operations with our
// transactions so an overlapping auth write cannot join or roll back a clinic write.
export async function withDatabaseAccess(fn) {
  if (pool) return fn();
  const previous = sqliteQueue;
  let release; sqliteQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await fn(); } finally { release(); }
}
export async function closeDb() { if (pool) await pool.end(); else sqlite.close(); }
