import { one, transaction } from './db.js';
import { decrypt, encrypt, now } from './security.js';
import { schedulePatient } from './workflows.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const visitStage = { booked: 'confirmed', attended: 'completed', cancelled: 'cancelled', no_show: 'no_show' };

// Both appointment screens use one atomic update for the diary and visit details.
export async function updateAppointment(clinic, appointmentId, input, details) {
  const updated = await transaction(async tx => {
    const current = await tx.one('SELECT * FROM appointments WHERE id=? AND clinic_id=?', [appointmentId, clinic.id]);
    if (!current) fail(404, 'Appointment not found.');
    const next = { ...current, status: input.status, starts_at: input.startsAt || current.starts_at,
      doctor_id: input.doctorId ?? current.doctor_id, revenue: input.revenue ?? current.revenue };
    if (next.doctor_id && !JSON.parse(clinic.data).website?.doctors?.some(d => d.id === next.doctor_id)) fail(400, 'Choose a clinic doctor.');
    if (next.status === 'booked' && await tx.one("SELECT id FROM appointments WHERE clinic_id=? AND doctor_id=? AND starts_at=? AND status='booked' AND id<>?", [clinic.id, next.doctor_id, next.starts_at, current.id])) fail(409, 'This time already has an appointment for this doctor. Choose another time.');
    await tx.run('UPDATE appointments SET status=?,revenue=?,starts_at=?,doctor_id=? WHERE id=? AND clinic_id=?', [next.status, next.revenue, next.starts_at, next.doctor_id, current.id, clinic.id]);
    const oldDetails = await tx.one('SELECT data FROM appointment_details WHERE appointment_id=? AND clinic_id=?', [current.id, clinic.id]);
    const previous = oldDetails ? decrypt(oldDetails.data) : {};
    const stage = details?.stage || (next.status === current.status && previous.stage ? previous.stage : visitStage[next.status]);
    await tx.run('INSERT INTO appointment_details(appointment_id,clinic_id,data) VALUES(?,?,?) ON CONFLICT(appointment_id) DO UPDATE SET data=excluded.data', [current.id, clinic.id, encrypt({ ...previous, ...details, doctorId: next.doctor_id, stage })]);
    if (current.lead_id) await tx.run('UPDATE leads SET status=? WHERE id=? AND clinic_id=?', [next.status === 'attended' ? 'converted' : next.status === 'booked' ? 'booked' : 'contacted', current.lead_id, clinic.id]);
    if (next.starts_at !== current.starts_at || next.status !== current.status) {
      const jobs = await tx.all("SELECT * FROM jobs WHERE clinic_id=? AND patient_id=? AND state='pending'", [clinic.id, current.patient_id]);
      for (const job of jobs) if (decrypt(job.data).appointmentId === current.id) await tx.run("UPDATE jobs SET state='cancelled',updated_at=? WHERE id=?", [now(), job.id]);
    }
    return next;
  });
  await schedulePatient(clinic, await one('SELECT * FROM patients WHERE id=? AND clinic_id=?', [updated.patient_id, clinic.id]), updated);
  return updated;
}
