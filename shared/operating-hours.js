export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const shortDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const clock = (hour, minute, ampm) => `${String(ampm ? (hour % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0) : hour).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;

export function legacyOpeningHours(text = '') {
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return [];
  let [, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod] = match;
  if (!startPeriod && endPeriod) startPeriod = endPeriod.toLowerCase() === 'pm' && Number(startHour) > Number(endHour) ? 'am' : endPeriod;
  if (!endPeriod && startPeriod) endPeriod = startPeriod;
  if (!startPeriod && !endPeriod && Number(endHour) < Number(startHour) && Number(endHour) <= 12) endPeriod = 'pm';
  const open = clock(Number(startHour), startMinute, startPeriod), close = clock(Number(endHour), endMinute, endPeriod);
  if (minutes(close) <= minutes(open)) return [];
  const lower = text.toLowerCase();
  const start = shortDays.findIndex(day => lower.includes(day.toLowerCase()));
  let end = -1;
  for (let i = 6; i >= 0; i--) if (lower.includes(shortDays[i].toLowerCase())) { end = i; break; }
  return weekdays.map((day, i) => ({ day: i, open, close, closed: start >= 0 && end >= 0 ? !(i >= start && i <= end) : i === 6 }));
}

export function clinicOpeningHours(clinic) {
  return Array.isArray(clinic.openingHours) && clinic.openingHours.length === 7 ? clinic.openingHours : legacyOpeningHours(clinic.hours);
}

export function slotsForDate(schedule, date, current = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const dateObject = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(dateObject.getTime()) || dateObject.toISOString().slice(0, 10) !== date) return [];
  const day = (dateObject.getUTCDay() + 6) % 7;
  const hours = schedule.find(row => row.day === day);
  if (!hours || hours.closed) return [];
  const open = minutes(hours.open), close = minutes(hours.close);
  if (!Number.isFinite(open) || !Number.isFinite(close) || open >= close) return [];
  const nowInIndia = new Date(current.getTime() + 19800000).toISOString().slice(0, 16);
  const result = [];
  for (let minute = Math.ceil(open / 30) * 30; minute + 30 <= close; minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    if (`${date}T${time}` > nowInIndia) result.push(time);
  }
  return result;
}

export function openingHoursSummary(schedule) {
  if (!schedule.length) return '';
  const active = schedule.filter(row => !row.closed);
  if (!active.length) return 'Closed all week';
  const groups = [];
  for (const row of active) {
    const last = groups.at(-1);
    if (last && last.end === row.day - 1 && last.open === row.open && last.close === row.close) last.end = row.day;
    else groups.push({ start: row.day, end: row.day, open: row.open, close: row.close });
  }
  return groups.map(group => `${shortDays[group.start]}${group.end !== group.start ? `–${shortDays[group.end]}` : ''} ${group.open}–${group.close}`).join(', ');
}
