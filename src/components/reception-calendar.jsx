import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Field, DatePicker, FormSelect } from './form-controls';
import { clinicDay, indiaInput, addDays } from '../lib/clinic-time';
import './reception-calendar.css';

const hourHeight = 72;
const minuteOfDay = value => { const [hour, minute] = indiaInput(value).slice(11).split(':').map(Number); return hour * 60 + minute; };
const statusLabel = value => value.replaceAll('_', ' ');
const timeLabel = value => new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });

// Share horizontal space between visits that overlap the same display slot.
function positionVisits(visits) {
  const groups = [];
  for (const visit of visits) {
    const start = minuteOfDay(visit.starts_at), end = start + 30;
    let group = groups.at(-1);
    if (!group || start >= group.end) { group = { end, visits: [], lanes: [] }; groups.push(group); }
    let lane = group.lanes.findIndex(end => end <= start);
    if (lane === -1) lane = group.lanes.length;
    group.lanes[lane] = end;
    group.end = Math.max(group.end, end);
    group.visits.push({ visit, start, lane });
  }
  return groups.flatMap(group => group.visits.map(item => ({ ...item, columns: group.lanes.length })));
}

export function ReceptionCalendar({ data, date, setDate, onSelect, onBook, focusStartsAt }) {
  const [view, setView] = useState('day'), [doctor, setDoctor] = useState('all'), [status, setStatus] = useState('all'), [now, setNow] = useState(new Date());
  const scroll = useRef(null);
  const today = clinicDay(now);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = Math.max(0, (date === clinicDay() ? minuteOfDay(new Date()) / 60 - 1 : 8) * hourHeight); }, [date, view]);
  useEffect(() => {
    if (!focusStartsAt) return;
    setDoctor('all'); setStatus('all');
  }, [focusStartsAt]);
  useEffect(() => {
    if (focusStartsAt && clinicDay(focusStartsAt) === date && scroll.current) scroll.current.scrollTop = Math.max(0, (minuteOfDay(focusStartsAt) / 60 - 1) * hourHeight);
  }, [focusStartsAt, date, view]);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const firstDay = view === 'week' ? addDays(date, -((weekday + 6) % 7)) : date;
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(firstDay, i));
  const filtered = data.appointments.filter(a => (doctor === 'all' || (doctor === 'unassigned' ? !a.doctor_id : a.doctor_id === doctor)) && (status === 'all' || a.status === status));
  const visibleCount = filtered.filter(a => days.includes(clinicDay(a.starts_at))).length;
  return <section className="panel reception-calendar"><div className="calendar-toolbar"><div><h2>Appointment diary</h2><p>India Standard Time · {visibleCount} {visibleCount === 1 ? 'appointment' : 'appointments'}</p></div><div className="calendar-navigation"><Button variant="outline" onClick={() => setDate(today)}>Today</Button><Button variant="outline" size="icon" aria-label="Previous date" onClick={() => setDate(addDays(date, view === 'week' ? -7 : -1))}><ChevronLeft/></Button><Button variant="outline" size="icon" aria-label="Next date" onClick={() => setDate(addDays(date, view === 'week' ? 7 : 1))}><ChevronRight/></Button><Field label="Visit date"><DatePicker value={date} required onChange={e => { if (e.target.value) setDate(e.target.value); }}/></Field></div></div>
    <div className="calendar-filters"><div className="calendar-view-switch" role="group" aria-label="Calendar view">{['day', 'week'].map(v => <Button key={v} variant={view === v ? 'default' : 'outline'} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'day' ? 'Day' : 'Week'}</Button>)}</div><Field label="Doctor"><FormSelect value={doctor} onChange={e => setDoctor(e.target.value)}><option value="all">All doctors</option><option value="unassigned">Shared clinic diary</option>{data.clinic.website?.doctors?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</FormSelect></Field><Field label="Visit status"><FormSelect value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{['booked', 'attended', 'cancelled', 'no_show'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</FormSelect></Field></div>
    {!visibleCount && <p className="calendar-empty" role="status">No appointments in this view. Choose a time slot to book a visit.</p>}
    <div className="calendar-scroll" ref={scroll}><div className={`calendar-grid ${view}`} style={{ '--days': days.length }}><div className="calendar-corner">IST</div>{days.map(d => <div className={`calendar-day-heading ${d === today ? 'is-today' : ''}`} key={d}><span>{new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', timeZone: 'UTC' })}</span><strong>{Number(d.slice(8))}</strong></div>)}
      <div className="calendar-hours" style={{ height: 24 * hourHeight }}>{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * hourHeight }}>{h === 0 ? '12 am' : `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`}</span>)}</div>
      {days.map(d => <div key={d} className="calendar-day" style={{ height: 24 * hourHeight }} aria-label={`Appointments for ${d}`}>{Array.from({ length: 48 }, (_, slot) => <button key={slot} className="calendar-slot" style={{ top: slot * hourHeight / 2, height: hourHeight / 2 }} aria-label={`Book ${d} at ${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`} onClick={() => onBook(`${d}T${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`, doctor === 'all' || doctor === 'unassigned' ? '' : doctor)}/>)}
        {positionVisits(filtered.filter(a => clinicDay(a.starts_at) === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at))).map(({ visit, start, lane, columns }) => { const patient = data.patients.find(p => p.id === visit.patient_id), detail = data.appointmentDetails.find(item => item.id === visit.id); const doctorName = data.clinic.website?.doctors?.find(item => item.id === visit.doctor_id)?.name; return <button className={`calendar-appointment ${visit.status}`} key={visit.id} style={{ top: start / 60 * hourHeight, height: Math.min(30, 1440 - start) / 60 * hourHeight - 2, left: `calc(${lane / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)` }} title={`${patient?.name || 'Patient'} · ${timeLabel(visit.starts_at)} IST · ${doctorName || 'Shared clinic diary'} · ${statusLabel(detail?.stage || visit.status)}`} onClick={() => onSelect({ ...visit, ...detail, id: visit.id, doctorId: visit.doctor_id })}><strong>{timeLabel(visit.starts_at)} · {patient?.name || 'Patient'}</strong><span>{doctorName || detail?.reason || statusLabel(detail?.stage || visit.status)}</span></button>; })}
        {d === today && <div className="calendar-now" aria-label={`Current time ${timeLabel(now)}`} style={{ top: minuteOfDay(now) / 60 * hourHeight }}><span>{timeLabel(now)}</span></div>}
      </div>)}
    </div></div>
  </section>;
}
