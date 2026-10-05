import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
mkdirSync('data/backups', { recursive: true });
const target = `data/backups/dantam-${Date.now()}.sqlite`;
const db = new DatabaseSync(process.env.SQLITE_PATH || 'data/dantam.sqlite');
db.exec(`VACUUM INTO '${target}'`);
db.close();
console.log(`Database snapshot saved: ${target}. Preserve data/development.key separately.`);
