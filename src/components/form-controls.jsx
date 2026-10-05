import React, { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Button } from './ui/button';

export function Field({ label, hint, children }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{React.isValidElement(children) ? React.cloneElement(children, { id }) : children}{hint && <small>{hint}</small>}</div>;
}

function optionsFrom(children) {
  return React.Children.toArray(children).flatMap(child => !React.isValidElement(child) ? [] : child.type === 'option' ? [{ value: String(child.props.value), label: child.props.children, disabled: child.props.disabled }] : optionsFrom(child.props.children));
}

// Preserve FormData and controlled-field contracts while using shadcn Select.
export function FormSelect({ children, value, defaultValue, onChange, name, required, disabled, ...props }) {
  const options = optionsFrom(children);
  const [internal, setInternal] = useState(defaultValue ?? options[0]?.value ?? '');
  const [invalid, setInvalid] = useState(false);
  const current = value ?? internal;
  const empty = '__empty__';
  return <><Select value={current === '' ? empty : current} onValueChange={next => { const value = next === empty ? '' : next; setInternal(value); setInvalid(false); onChange?.({ target: { value, name } }); }} disabled={disabled}>
    <SelectTrigger {...props} aria-required={required} aria-invalid={invalid}><SelectValue /></SelectTrigger>
    <SelectContent position="popper">{options.map(option => <SelectItem key={option.value || empty} value={option.value || empty} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
  </Select>{name && <input type="hidden" name={name} value={current} disabled={disabled} />}{required && <input className="date-validation" aria-label="Selection required" tabIndex={-1} value={current} onChange={() => {}} required disabled={disabled} onInvalid={e => { e.preventDefault(); setInvalid(true); document.getElementById(props.id)?.focus(); }} />}{invalid && <small className="form-error" role="alert">Choose an option to continue.</small>}</>;
}

export function DatePicker({ value, defaultValue = '', onChange, name, id, required, disabled, min, max, ...props }) {
  const [internal, setInternal] = useState(defaultValue), [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const current = value ?? internal;
  const parsed = current ? parseISO(current) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  return <div className="date-picker"><Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" className="date-picker-trigger" disabled={disabled} aria-required={required} aria-invalid={invalid} {...props}><span>{selected ? format(selected, 'dd MMM yyyy') : 'Choose date'}</span><CalendarDays size={16}/></Button></PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={selected} defaultMonth={selected} captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date(new Date().getFullYear() + 10, 11)} disabled={[...(min ? [{ before: parseISO(min) }] : []), ...(max ? [{ after: parseISO(max) }] : [])]} onSelect={date => { const next = date ? format(date, 'yyyy-MM-dd') : ''; setInternal(next); setInvalid(false); onChange?.({ target: { value: next, name } }); setOpen(false); }} required={required}/></PopoverContent>
  </Popover><input type="hidden" name={name} value={current} disabled={disabled}/>{required && <input className="date-validation" tabIndex={-1} aria-label="Date required" value={selected ? current : ''} onChange={() => {}} required disabled={disabled} onInvalid={e => { e.preventDefault(); setInvalid(true); document.getElementById(id)?.focus(); }} />}{invalid && <small className="form-error" role="alert">Choose a date to continue.</small>}</div>;
}

export function DateTimePicker({ defaultValue = '', value, onChange, name, id, required, disabled }) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const [date = '', time = ''] = current.split('T');
  function update(date, time) { const value = `${date}T${time}`; setInternal(value); onChange?.({ target: { value, name } }); }
  return <div className="date-time-picker"><DatePicker id={id} value={date} required={required} disabled={disabled} onChange={e => update(e.target.value, time)}/><input type="time" aria-label="Time (India)" value={time} required={required} disabled={disabled} onChange={e => update(date, e.target.value)}/><input type="hidden" name={name} value={current}/></div>;
}
