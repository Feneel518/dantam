import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyOpeningHours, clinicOpeningHours, slotsForDate } from '../shared/operating-hours.js';

test('website slots follow opening hours, closed days and complete half-hour visits', () => {
  const schedule = legacyOpeningHours('Mon–Sat, 10 am–7 pm');
  const now = new Date('2026-10-05T00:00:00Z');
  const slots = slotsForDate(schedule, '2026-10-07', now);
  assert.equal(slots[0], '10:00');
  assert.equal(slots.at(-1), '18:30');
  assert.deepEqual(slotsForDate(schedule, '2026-10-11', now), []);
  assert.deepEqual(slotsForDate(schedule, '2026-02-31', now), []);
});

test('saved weekday hours override legacy text and exclude elapsed times in India', () => {
  const schedule = legacyOpeningHours('Mon–Sat, 9 am–5 pm');
  schedule[0] = { day: 0, open: '11:15', close: '13:15', closed: false };
  const resolved = clinicOpeningHours({ openingHours: schedule, hours: 'Mon–Sat 10 am–7 pm' });
  assert.deepEqual(slotsForDate(resolved, '2026-10-05', new Date('2026-10-05T06:00:00Z')), ['12:00', '12:30']);
  assert.deepEqual(slotsForDate(resolved, '2026-10-04', new Date('2026-10-05T00:00:00Z')), []);
});
