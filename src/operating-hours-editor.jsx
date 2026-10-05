import React, { useEffect, useState } from 'react';
import { clinicOpeningHours, openingHoursSummary, weekdays } from '../shared/operating-hours.js';
import { Input } from './components/ui/input';

function editableHours(clinic) {
  const existing = clinicOpeningHours(clinic);
  return existing.length ? existing : weekdays.map((_, day) => ({ day, open: '09:00', close: '17:00', closed: day === 6 }));
}

export function OperatingHoursEditor({ data, mutate }) {
  const [schedule, setSchedule] = useState(() => editableHours(data.clinic));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setSchedule(editableHours(data.clinic)); }, [data.clinic.openingHours, data.clinic.hours]);
  const update = (day, change) => { setSchedule(current => current.map(row => row.day === day ? { ...row, ...change } : row)); setDirty(true); };
  async function save() {
    setError(''); setSaving(true);
    try {
      if (schedule.some(row => !row.closed && row.close <= row.open)) throw new Error('Closing time must be after opening time.');
      await mutate('/clinic', { ...data.clinic, openingHours: schedule, hours: openingHoursSummary(schedule) }, 'PATCH', 'Clinic opening hours saved');
      setDirty(false);
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }
  return <section className="panel operating-hours-editor" aria-labelledby="opening-hours-title">
    <div className="operating-hours-heading"><div><h2 id="opening-hours-title">Website booking hours</h2><p>Patients choose 30-minute request times within these hours. Your team confirms the appointment.</p></div><button type="button" className="button" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save hours'}</button></div>
    {!data.clinic.openingHours?.length && <p className="operating-hours-note">{clinicOpeningHours(data.clinic).length ? 'These times come from your existing opening hours. Save to manage each day separately.' : 'Review these suggested times, then save them to activate website time choices.'}</p>}
    <div className="operating-hours-grid">{schedule.map(row => <div className="operating-hours-row" key={row.day}><strong>{weekdays[row.day]}</strong><label className="check-label"><input type="checkbox" checked={!row.closed} onChange={event => update(row.day, { closed: !event.target.checked })}/>Open</label><Input aria-label={`${weekdays[row.day]} opens`} type="time" value={row.open} disabled={row.closed} onChange={event => update(row.day, { open: event.target.value })}/><span aria-hidden="true">to</span><Input aria-label={`${weekdays[row.day]} closes`} type="time" value={row.close} disabled={row.closed} onChange={event => update(row.day, { close: event.target.value })}/></div>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
