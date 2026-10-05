# Dantam requested product scope

## Implementation update — 2 October 2026

The comparison below is the original gap review. The application now implements four selectable templates, media uploads, doctor and treatment content, public treatment pages, reception diary and doctor assignment, manual enquiries, patient timelines, treatment proposals, assigned tasks, recall records, manual WhatsApp drafts, reactivation segments, reports, staff invitations/roles, audit records, domain verification, signed missed-call intake, operator metrics and updated Free/₹1,999/₹2,999 packaging (approved 5 October 2026).

Vercel Pro and Neon have been connected. The hosted version is a **launch preview** with fictional test data; public registration and checkout remain disabled until live provider/business setup is complete. See [LAUNCH.md](LAUNCH.md) for precise scope limits, acceptance steps and private test-access location. The historical table below is not the current completion status.

Reviewed 2 October 2026 against the local application, the user's shared conversation, and four supplied design references.

Source: https://chatgpt.com/share/6abf7288-02a8-83e8-96c4-0ed1954f7eb8

This is a requirements and gap review, not a claim that the features below have been implemented. Existing local tests passed before this scope review; they cover the current implementation only. External provider delivery and production infrastructure are not certified by those tests.

## Product objective

A patient growth and recall SaaS for independent dental clinics. The main journey is website discovery → enquiry → confirmed appointment → visit → treatment proposal → staff follow-up → treatment decision/completion → recall → return visit.

The user's current request for four selectable website designs supersedes the shared conversation's earlier one-template recommendation. The source includes alternative plans, prices and implementation advice; these are not independent authorization to deploy, contact people, purchase services, or replace the current stack.

## Feature comparison

| Area | Current implementation | Work required for requested scope |
| --- | --- | --- |
| Accounts and tenant isolation | Registration, verification, reset, signed sessions and clinic-scoped records exist. | Organization membership and multiple users per clinic; migrate existing ownership without losing records. |
| Clinic onboarding | Registration plus a clinic details editor and setup indicators. | Resumable wizard for clinic, doctors, treatments, hours, photos, template and preview. |
| Doctor directory | One doctor's name, qualifications and registration in clinic settings. | Multiple doctors with specialization, biography, photo and appointment assignment. |
| Service catalogue | A list of service names. | Descriptions, images, active state, stable slugs and selectable dental service presets. |
| Website templates | One clinic layout with three colour options. | Four distinct layouts with a gallery, preview, selection and persisted template ID. |
| Website content editor | Headline, about, doctor text, services, address, phone, hours and colour. | Logo/cover/gallery uploads, multiple doctors, editable FAQs, structured hours, email, WhatsApp and map settings. |
| Public pages and SEO | One clinic page, metadata, structured data, sitemap, booking form and maps link. | Individual treatment pages; doctor/about, facilities, patient information, FAQ and contact content. Preserve per-clinic URLs and metadata across template changes. |
| Appointment requests | Name, phone, service, preferred date and messaging consent create an enquiry. | Preferred time, new/existing patient choice, and a clear requested-appointment queue. Do not reserve a confirmed slot until reception confirms. |
| Appointment management | Booked, attended, cancelled and no-show states; time updates; collections. | Calendar/day view, doctor assignment, reason, arrived/in-progress/completed progression and reschedule history. |
| Reception home | Summary, upcoming visits, activity, enquiries and basic growth actions. | Today-first work list with confirmations, arrivals, missed visits, due tasks and recalls; direct call and WhatsApp actions. |
| Lead CRM | Website request inbox, source tracking, contacted/closed states and booking conversion. | Manual phone/walk-in/referral leads, pipeline view, assignee, notes, lost/converted outcomes and communication history. |
| Patient profile | Contact list, CRUD, consent, one recall date, CSV import and JSON export. | Individual patient page joining visits, treatment proposals, follow-ups, recalls and communication history; optional additional contact fields. |
| Treatment pipeline | Not implemented. | Proposals with items/title, estimated value, patient, notes, next follow-up and proposed/deciding/accepted/started/completed/declined states. |
| Staff follow-up tasks | No dedicated task system; automated message jobs exist. | Assigned lead, appointment, treatment, payment and general tasks; due dates, notes, completion, cancellation and next-task creation. |
| Recall management | Patient recall date, a basic due list and automated recall scheduling. | Separate recall records with reason and status; due today, overdue, next seven days and upcoming views; contacted/booked/completed/skipped outcomes. |
| Manual WhatsApp | No general staff message-composer workflow. | Prefilled confirmation, reminder, treatment follow-up and recall messages opened in WhatsApp; staff sends manually. Opening WhatsApp must not be reported as message delivery. |
| Automated WhatsApp | Provider adapter, approved-template configuration, queue, delivery events, opt-out and allowance checks exist. | Live acceptance, and any additional consented workflows for the expanded product. |
| Google and reviews | Connection, read-only test, profile audit, approved corrections and reply workflows exist. | Live provider acceptance and connection to the richer patient journey. |
| Analytics | Enquiry funnel, visits, returning patients, collections and source reports. | Proposed/accepted/pending treatment values, task completion, no-show trends and explicitly attributed recall/return outcomes. |
| Staff access | One owner per account/clinic. | Owner, doctor and receptionist roles, invitations, membership management and server-side permissions. Platform administration is a separate scope. |
| Audit history | Basic clinic activity events. | Actor, action, target, timestamp and appropriate change details for appointment, patient, treatment, task and role changes. |
| Demo | Fictional patients, visits, requests and simulated subscription. | Treatment opportunities, assigned follow-ups and varied recall states with dates useful at demo time. |
| SaaS billing | Razorpay subscription adapter and webhook reconciliation exist. | Resolve plan packaging/pricing, then validate test and live lifecycle. SaaS subscription billing is distinct from patient invoices. |
| Custom domains | Not implemented. | Domain ownership verification, clinic routing, TLS and onboarding/status. |
| Missed-call recovery | Not implemented. | Telephony provider, authenticated events, duplicate handling, callback tasks and an appropriate messaging permission flow. |
| Patient reactivation | No campaign workflow. | Eligible patient segments, permission checks, approved messaging, suppression and attribution from campaign to request/visit. |
| Founder operations | Not implemented as a platform dashboard. | Track clinic onboarding, activation, subscription conversion, usage, churn and founder sales follow-ups; keep tenant patient data access restricted. |

## Four clinic website templates

These apply to each clinic's public website. The SaaS dashboard stays consistent when a clinic changes its website template. Names below are proposed internal catalogue names, not copied reference brands.

| Reference | Proposed name | Design direction |
| --- | --- | --- |
| Image 1: 13da4b84c25dbfbd488905d178b90c40.jpg | Botanical | Forest green and lime; oversized editorial serif headline; rounded split hero with a large smile photograph; playful small accents. |
| Image 2: d585cd1eee427cca2e99b03c71ac6861.jpg | Warm Studio | Warm taupe and brown; immersive photographic hero with text overlay; dark compact booking buttons; white content sections and large supporting photos. |
| Image 3: c25b69ff2463b590ff3378a526186f9c.jpg | Modern Care | Cool blue/teal; wide treatment photograph with overlaid navigation; bold sans-serif headline; photographic service cards and doctor profiles. |
| Image 4: 924bd068512828d8e2ffc1ef6f237fc8.jpg | Gentle | White and pale sage; generous whitespace; split text/doctor portrait hero; restrained pastel service cards; calm booking section. |

### Shared template behavior

1. Clinic owners can preview all four templates on desktop and mobile using their saved clinic content.
2. Selecting a template changes presentation while preserving doctors, services, photos, contact details, booking records and URLs.
3. Each template supports clinic branding, hero, doctor/team, services, facilities/photos, hours, FAQs, directions, contact and appointment requests.
4. Editing uses controlled content fields. A drag-and-drop builder is not required by the brief.
5. Template previews and published pages use the same renderer. All booking forms feed the same clinic-specific inbox.
6. Photography needs replaceable image slots and appropriate responsive crops; a screenshot of the reference is not a functioning template.
7. Reference ratings, patient totals, awards, availability and testimonials are visual examples, not clinic facts. Hide unconfigured claims and show clinic-provided or verified data only.
8. Missing images or optional content must produce an intentional layout, not broken image placeholders.
9. Mobile layouts, contrast, keyboard access, validation, performance and reduced motion are part of acceptance for each template.

### Initial design tokens and structure

- Botanical: forest #174D3C, lime #A0F66A, pale mint #EAF3ED, orange #FFB64D, white #FFFFFF. Display serif with a neutral sans-serif body. Hero: [editorial headline and inset image | large people photograph], then [clinic introduction | practical details].
- Warm Studio: taupe #8D7A68, deep brown #251D16, sand #D3C4B3, white #FFFFFF, ink #181614. Humanist sans-serif. Hero: [left-aligned copy over broad photograph], then [large image | clinic introduction].
- Modern Care: teal #166E7B, ice #E4F1F5, white #FFFFFF, charcoal #202B30, grey #6C7A80. Bold grotesk headline and readable sans-serif body. Hero: [navigation and headline over treatment photo], then [service introduction | image cards].
- Gentle: sage #E0EACB, off-white #F7F8F4, ink #1D241D, mist blue #E8EFF5, muted #70766D. Rounded humanist sans-serif. Hero: [left-aligned headline and booking action | clinician portrait], then [four service panels] and [portrait | team introduction].

Brief review: these are four different compositions, not recolours. Preserve the references' photographic scale and spacing. Do not populate their example statistics, awards or clinician identities into real clinic pages.

## Proposed implementation sequence

1. Extend clinic content, media handling and doctor/service models; add the four-template gallery, previews and editable public pages with working booking.
2. Add onboarding, staff membership/roles, reception home, richer lead and appointment workflows and patient detail pages.
3. Add treatment proposals, assigned follow-ups, dedicated recalls and manual WhatsApp actions.
4. Add treatment and recall reporting, richer audit events and full fictional demo data; verify permissions across two clinics and each staff role.
5. Validate external integrations, then add missed-call recovery, reactivation campaigns, domains and platform operations.

The current React/Vite/Express application can be extended. The shared chat's Next.js suggestion does not itself require a framework rewrite.

## Decisions to resolve before dependent implementation

- Pricing differs: the source suggests Free, Growth at ₹1,499 and Pro at ₹2,499, plus ₹999 founder pricing; the app currently shows ₹2,999 and ₹5,999 paid plans. Confirm pricing and feature gates before changing checkout or live provider plans.
- Clinic logos, portraits and facility photos should be supplied/uploadable; preview imagery must be clearly distinguished from actual clinic staff.
- Define payment follow-ups separately from patient invoicing/accounting, which the source defers.
- Detailed medical records, prescriptions, dental charts, X-rays, inventory, insurance and AI diagnosis are not part of the stated initial product.

## End-to-end acceptance scenario

Create a clinic → add doctors/services/photos → select each template and verify content preservation → publish locally → submit a public request → see it in reception → assign/confirm appointment → mark arrival/completion → create a treatment proposal → assign and complete a follow-up → accept/complete treatment → create recall → book the return visit → verify attributed reports.

Run this with two separate clinics and owner/doctor/receptionist accounts, checking that every operation respects tenant boundaries and role permissions. Validate provider delivery and billing separately with configured test accounts.
