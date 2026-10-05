import { z } from 'zod';
export const phone = z.string().transform(s => s.replace(/[\s()-]/g, '')).refine(s => /^(\+91[6-9]\d{9}|[6-9]\d{9})$/.test(s), 'Enter an Indian mobile number.').transform(s => s.startsWith('+91') ? s : `+91${s}`);
const text = (max = 200) => z.string().trim().max(max);
export const accountSchema = z.object({ email: z.email().max(254).transform(s => s.toLowerCase()), password: z.string().min(12, 'Use at least 12 characters.').max(128), name: text(100).min(3), city: text(80).min(2), phone });
export const loginSchema = z.object({ email: z.email().transform(s => s.toLowerCase()), password: z.string().min(1).max(128) });
export const clinicSchema = z.object({ name: text(100).min(3), city: text(80).min(2), phone,
  address: text(300), doctor: text(120), qualifications: text(200), registration: text(100),
  tagline: text(180), about: text(1500), hours: text(250),
  openingHours: z.array(z.object({ day: z.number().int().min(0).max(6), open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closed: z.boolean() })).refine(rows => rows.length === 0 || rows.length === 7, 'Choose hours for each day.').superRefine((rows, ctx) => {
    if (rows.length === 0) return;
    if (new Set(rows.map(row => row.day)).size !== 7) ctx.addIssue({ code: 'custom', message: 'Choose hours for each day.' });
    for (const row of rows) if (!row.closed && row.close <= row.open) ctx.addIssue({ code: 'custom', message: 'Closing time must be after opening time.' });
  }).optional(), services: z.array(text(100).min(2)).min(1).max(20),
  reviewUrl: z.union([z.literal(''), z.url().refine(url => { const u = new URL(url); return u.protocol === 'https:' && ['g.page','www.google.com','google.com','maps.google.com'].includes(u.hostname); }, 'Use an HTTPS Google review link.')]),
  colour: z.enum(['lagoon','blue','plum']), reminders: z.boolean(), recalls: z.boolean(), reviewRequests: z.boolean(), autoReplies: z.boolean(),
  googleConsent: z.boolean().optional(), messagingConsent: z.boolean().optional() });
export const patientSchema = z.object({ name: text(100).min(2), phone, consent: z.boolean(), consentSource: text(250).optional(),
  email:z.union([z.literal(''),z.email()]).optional(),dateOfBirth:z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v<=new Date().toISOString().slice(0,10),'Choose a valid birth date')]).optional(),gender:z.enum(['','female','male','other','prefer_not_to_say']).optional(),
  recallDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !isNaN(d.getTime()) && d.toISOString().slice(0,10) === s; }, 'Invalid recall date.')]).optional() }).superRefine((data, ctx) => {
    if (data.consent && !data.consentSource?.trim()) ctx.addIssue({ code: 'custom', path: ['consentSource'], message: 'Record where the patient gave messaging permission.' });
  });
export const bookingSchema = z.object({ name: text(100).min(2), phone, preferredDate: text(30), preferredTime:z.union([z.literal(''),z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional(), patientType:z.enum(['new','existing']).optional(), service: text(100), consent: z.boolean(), source: text(80).optional(), website: text(100).optional() });
export const appointmentSchema = z.object({ patientId: text(80).min(1), startsAt: z.iso.datetime(), leadId: text(80).optional(), doctorId:text(80).default('') });
export const appointmentUpdate = z.object({ status: z.enum(['booked','attended','cancelled','no_show']), revenue: z.number().int().min(0).max(100000000).optional(), startsAt: z.iso.datetime().optional() });
