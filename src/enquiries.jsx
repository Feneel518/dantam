import React, { useState } from 'react';
import { CalendarDays, GripVertical, Plus, Search } from 'lucide-react';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Field, FormSelect, DatePicker } from './components/form-controls.jsx';
import { receptionPath } from './lib/clinic-time';
import './enquiries.css';

const stages = [
  { id: 'new', title: 'New', description: 'Needs a first response' },
  { id: 'contacted', title: 'Contacted', description: 'Talking with patient' },
  { id: 'booked', title: 'Booked', description: 'Added to reception' },
  { id: 'converted', title: 'Visited', description: 'Appointment attended' },
  { id: 'lost', title: 'Lost', description: 'Did not proceed' },
  { id: 'closed', title: 'Closed', description: 'No further action' },
];
const label = value => (value || '').replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
const preferred = lead => lead.preferredDate && lead.preferredTime
  ? `${new Date(`${lead.preferredDate}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · ${lead.preferredTime} IST`
  : lead.preferredDate || '';

export function Enquiries({ data, mutate, ui, navigate, busy }) {
  const [editing, setEditing] = useState(null);
  const [booking, setBooking] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [dragged, setDragged] = useState('');
  const [over, setOver] = useState('');
  const rows = data.leads.filter(lead => `${lead.name} ${lead.phone} ${lead.service || ''}`.toLowerCase().includes(query.toLowerCase()));
  const appointmentFor = lead => data.appointments.find(appointment => appointment.lead_id === lead.id);
  const editingAppointment = editing && appointmentFor(editing);
  const editingStatus = editingAppointment?.status === 'attended' ? 'converted' : editingAppointment?.status === 'booked' ? 'booked' : ['booked', 'converted'].includes(editing?.status) ? 'contacted' : editing?.status;

  async function move(lead, status) {
    setOver(''); setDragged('');
    if (status === lead.status) return;
    if (busy) return;
    if (status === 'booked') { const appointment = appointmentFor(lead); if (appointment) navigate(receptionPath(appointment.starts_at)); else setBooking(lead); return; }
    if (status === 'converted') { setError('Mark the linked visit as attended in reception to move an enquiry to Visited.'); return; }
    if (appointmentFor(lead)?.status === 'booked' || appointmentFor(lead)?.status === 'attended') {
      setError('Change the linked appointment in reception before moving this enquiry.');
      return;
    }
    try { await mutate(`/leads/${lead.id}`, { status }, 'PATCH', `Enquiry moved to ${label(status)}`); setError(''); }
    catch (cause) { setError(cause.message); }
  }

  return <>
    <div className="page-title"><div><h1>Enquiry pipeline</h1><p>Move enquiries through each step, then confirm a time to add them to reception.</p></div><div className="page-actions"><button className="button" onClick={() => { setError(''); setEditing({}); }}><Plus size={17}/>Add enquiry</button></div></div>
    <div className="enquiry-toolbar"><div className="enquiry-search"><Search size={17}/><Input aria-label="Search enquiries" placeholder="Search name, mobile or service" value={query} onChange={event => setQuery(event.target.value)}/></div><p>Drag cards between columns, or use Move to on a card.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="enquiry-board" aria-label="Enquiry pipeline" onDragOver={event => { const board = event.currentTarget, bounds = board.getBoundingClientRect(); if (event.clientX < bounds.left + 55) board.scrollLeft -= 24; else if (event.clientX > bounds.right - 55) board.scrollLeft += 24; }}>
      {stages.map(stage => <section className={`enquiry-lane ${over === stage.id ? 'is-over' : ''}`} key={stage.id} aria-label={`${stage.title} enquiries`} onDragOver={event => { event.preventDefault(); setOver(stage.id); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(''); }} onDrop={event => { event.preventDefault(); const lead = data.leads.find(item => item.id === (event.dataTransfer.getData('text/plain') || dragged)); if (lead) move(lead, stage.id); }}>
        <header className="enquiry-lane-head"><div><h2>{stage.title}</h2><p>{stage.description}</p></div><span>{rows.filter(lead => lead.status === stage.id).length}</span></header>
        <div className="enquiry-lane-body">{rows.filter(lead => lead.status === stage.id).map(lead => { const appointment = appointmentFor(lead); return <article className={`enquiry-card ${dragged === lead.id ? 'is-dragged' : ''}`} key={lead.id} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', lead.id); setDragged(lead.id); }} onDragEnd={() => { setDragged(''); setOver(''); }}>
          <div className="enquiry-card-top"><span className="badge neutral">{label(lead.source)}</span><GripVertical size={16} aria-hidden="true"/></div>
          <h3>{lead.name}</h3><a href={`tel:${lead.phone}`}>{lead.phone}</a><p className="enquiry-service">{lead.service || 'General enquiry'}</p>
          {lead.preferredDate && <p className="enquiry-preferred"><CalendarDays size={15}/><span>Requested {preferred(lead)}</span></p>}
          {lead.notes && <p className="enquiry-notes">{lead.notes}</p>}
          {lead.assignedTo && <p className="enquiry-assignee">Assigned to {data.members.find(member => member.id === lead.assignedTo)?.name || 'Former team member'}</p>}
          <div className="enquiry-card-actions"><button className="button small secondary" onClick={() => { setError(''); setEditing(lead); }}>Update</button>{appointment ? <button className="button small" onClick={() => navigate(receptionPath(appointment.starts_at))}>View booking</button> : <button className="button small" onClick={() => setBooking(lead)}>Book</button>}</div>
          <FormSelect aria-label={`Move ${lead.name} to`} value={lead.status} onChange={event => move(lead, event.target.value)}><option value={lead.status}>Move to…</option>{stages.filter(option => option.id !== lead.status && option.id !== 'converted').map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</FormSelect>
          {!appointment && ['booked', 'converted'].includes(lead.status) && <p className="form-error">No linked appointment. Book this enquiry to add it to reception.</p>}
        </article>; })}{!rows.some(lead => lead.status === stage.id) && <p className="enquiry-empty">No enquiries here</p>}</div>
      </section>)}
    </div>
    {editing && <ui.Modal title={editing.id ? 'Update enquiry' : 'Add enquiry'} onClose={() => setEditing(null)}><form onSubmit={async event => { event.preventDefault(); setError(''); try { const fields = Object.fromEntries(new FormData(event.currentTarget)); await mutate(editing.id ? `/lead-details/${editing.id}` : '/leads', fields, editing.id ? 'PATCH' : 'POST', 'Enquiry saved'); setEditing(null); } catch (cause) { setError(cause.message); } }}>
      <Field label="Name"><Input name="name" required minLength={2} maxLength={100} defaultValue={editing.name}/></Field><Field label="Mobile"><Input name="phone" type="tel" required defaultValue={editing.phone}/></Field><Field label="Interested in"><Input name="service" maxLength={100} defaultValue={editing.service || 'Dental consultation'}/></Field>
      {editing.id ? <><div className="form-row"><Field label="Preferred date"><DatePicker name="preferredDate" defaultValue={editing.preferredDate || ''}/></Field><Field label="Preferred time (India)"><Input name="preferredTime" type="time" defaultValue={editing.preferredTime || ''}/></Field></div><input type="hidden" name="status" value={editingStatus}/><Field label="Assigned to"><FormSelect name="assignedTo" defaultValue={editing.assignedTo || ''}><option value="">Unassigned</option>{data.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</FormSelect></Field></> : <Field label="Source"><FormSelect name="source">{['phone','walk_in','referral','whatsapp','instagram','google','other'].map(source => <option key={source} value={source}>{label(source)}</option>)}</FormSelect></Field>}
      <Field label="Notes"><Textarea name="notes" maxLength={2000} rows={3} defaultValue={editing.notes}/></Field>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="button" disabled={busy}>Save enquiry</button></div>
    </form></ui.Modal>}
    {booking && <ui.AppointmentModal data={data} lead={booking} busy={busy} navigate={navigate} onClose={() => setBooking(null)} onSave={async input => { await mutate(`/leads/${booking.id}/book`, input, undefined, 'Enquiry booked — appointment added to reception'); setBooking(null); navigate(receptionPath(input.startsAt)); }}/>} 
  </>;
}
