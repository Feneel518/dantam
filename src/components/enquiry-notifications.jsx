import React from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';

export function EnquiryNotifications({ data, navigate }) {
  const [open, setOpen] = React.useState(false);
  const enquiries = data.leads.filter(l => l.status === 'new');
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button className="icon-button notification-button" aria-label={`Enquiry notifications, ${enquiries.length} new`}><Bell size={19}/>{enquiries.length > 0 && <span className="nav-count">{enquiries.length}</span>}</button></PopoverTrigger><PopoverContent align="end" className="notification-list"><h3>New enquiries</h3>{enquiries.length ? enquiries.slice(0, 8).map(lead => <button key={lead.id} onClick={() => { setOpen(false); navigate('/app/leads'); }}><strong>{lead.name}</strong><small>{lead.service} · {lead.source}</small><small>{new Date(lead.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</small></button>) : <p>No enquiries waiting for a first response.</p>}{enquiries.length > 8 && <button onClick={() => { setOpen(false); navigate('/app/leads'); }}>View all {enquiries.length} enquiries</button>}</PopoverContent></Popover>;
}
