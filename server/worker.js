import { workerCycle as tick } from './worker-cycle.js';
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
console.log('Dantam worker started.');
while (!stopping) {
  try { await tick(); } catch (e) { console.error('Worker cycle failed:', e.message); }
  await new Promise(resolve => setTimeout(resolve, Number(process.env.WORKER_INTERVAL_MS || 30000)));
}
