export const indiaInput = value => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 16);
export const clinicDay = (value = new Date()) => indiaInput(value).slice(0, 10);
export const addDays = (date, count) => new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
export const indiaInstant = value => new Date(`${value}+05:30`).toISOString();
export const receptionPath = startsAt => `/app/reception?date=${clinicDay(startsAt)}`;
