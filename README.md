# Dantam

A dental practice SaaS for India: a free hosted clinic website plus paid reputation and patient-follow-up workflows. This repository contains the web application, persistent backend, queue worker, real provider adapters and deployment configuration. It is not a live commercial deployment. Provider accounts, production infrastructure and live acceptance testing remain necessary.

## Run locally

Requires Node.js 24 or later. Run `npm ci`, `npm run dev`, then open http://localhost:3000. Local development uses `data/dantam.sqlite`. An encryption key is generated once at `data/development.key`; preserve it with the database. Account emails are saved privately in `data/mail/` when SMTP is absent. Open the verification link from the latest matching JSON email to verify a new account. No SMTP delivery is claimed in this mode.

Optional: run `npm run demo`. Sign in as `demo@dantam.local` with `DantamDemo2026!` (or set `DEMO_PASSWORD` before seeding). All records are fictional. The demo subscription is simulated, its website is unpublished, and demo clinics cannot send live messages or automatically publish Google replies. Create your own clinic account for real connections. Never put the development database or demo account into production.

Run `npm run worker` in a separate terminal for background processing. The worker schedules no messages without an active paid subscription, clinic authorisation and patient opt-in. The server remains usable without a worker; automation needs the worker running.

## Product flows

Open `/demo` to view the refreshed clinic website without signing in. **Growth plan** now adds enquiry follow-ups, a due-recall queue and channel-specific booking links. **Connections** includes guided Google setup and a free read-only live connection test. Follow [GOOGLE-SETUP.md](GOOGLE-SETUP.md) for your own business.

Authentication uses Better Auth 1.7.7 for credential sign-in and signed HttpOnly database sessions, including device listing and revocation under Settings. Existing account IDs and hashes are imported on first successful login; old custom sessions are no longer accepted. Registration, verification and reset orchestration retain the app's endpoints; resets synchronize Better Auth credentials and revoke sessions. Native Better Auth HTTP endpoints are not mounted, preventing alternate password changes from bypassing synchronization. Additive `auth_*` tables are created at startup. Back up the database before upgrading. Production requires a separate `BETTER_AUTH_SECRET` of at least 32 characters. See [Better Auth database](https://better-auth.com/docs/concepts/database) and [session documentation](https://better-auth.com/docs/concepts/session-management).

Run `node scripts/refinement-check.js` with the local app running for additional responsive clinic-demo, growth-link, setup, device-listing and logout checks.

- Register → verify email → add clinic details → preview → explicitly publish a free clinic page at `/c/:slug`.
- Website form → request inbox and owner email alert → contact patient → confirm appointment → mark attendance and actual collections. The worker sends alerts even on the free plan, with no patient details in the notification email.
- Patients: individual CRUD, consent evidence, clinician-selected recall date, CSV import, JSON export and deletion.
- Google: OAuth connection, location selection, profile audit, explicitly approved phone/website correction, review polling, approved reply publishing. Name, address, categories, hours and verification are reviewed manually in Google; the app does not fabricate or automatically overwrite them.
- Authorised routine replies use a conservative fixed template. No generative AI account is required. Reviews mentioning dental care, complaints or other sensitive content go to owner approval. This is intentionally conservative and is not a clinical content classifier.
- WhatsApp: encrypted clinic-owned credentials and approved template names; 24-hour-before reminders, post-attendance review requests, chosen-date recalls, quiet hours, monthly allowances, provider delivery status and STOP handling.
- Billing: Razorpay recurring subscription links, raw-body signed webhooks, current-state reconciliation, paid-period enforcement and cancellation at the cycle end.
- Reporting: enquiry cohort funnel, attended visits, returning patients, recorded collections and UTM source attribution. These are recorded outcomes, not proof of incremental growth.

## Initial plans

Free: website and core clinic records. Growth: ₹1,999/month with 300 WhatsApp messages. Pro: ₹2,999/month with 1,000 messages. External message charges, domains, advertising spend and applicable taxes are separate. These are initial product prices, not validated willingness-to-pay research. Prices shown in the app must match the plans you create in Razorpay. Multi-location organisations, ads management, duration-based chair scheduling and practice-management-system integrations are not included. Custom domain verification and routing are included; DNS and Vercel domain attachment are operator-managed. See LAUNCH.md for current deployment status and testing instructions.

## Provider setup

Copy `.env.example` to `.env`, then populate it. Never commit secrets.

### Google

Request Business Profile API project access before launching this feature. API prerequisites include a verified, active profile for at least 60 days and a business website. Enable Business Information, Account Management and Google My Business APIs. Configure an OAuth web client with `${APP_URL}/api/google/callback` as the redirect URI, the `business.manage` scope, the public privacy/terms pages and complete Google's required OAuth verification.

Each clinic signs in to Google and chooses a location it owns/manages. Obtain specific express workflow authorisation before automatic replies. Do not create an API relay that lets third parties programmatically use your Google project. Do not revert Google edits automatically. Profile correction notices are recorded immediately in the dashboard. Review content is retained temporarily for 29 days; the worker performs expiry cleanup. Configure backups so Google content does not outlive its policy retention limit. Account disconnect revokes the token and deletes cached reviews.

Primary references: [API prerequisites](https://developers.google.com/my-business/content/prereqs), [API policies](https://developers.google.com/my-business/content/policies), [review replies](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply), [profile updates](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch).

### WhatsApp

Set the supported `META_GRAPH_VERSION`, app secret and a strong webhook verification token. Each clinic enters its WhatsApp Cloud API phone-number ID and a permanent system-user token. The platform app must be subscribed to each clinic's WhatsApp Business Account `messages` events (do this in Meta during onboarding; this app does not automate Embedded Signup). Set callback `${APP_URL}/api/webhooks/whatsapp`. Test signature checking, delivery notifications and incoming STOP before enabling clinic automations. For scale, implement Meta Embedded Signup/Tech Provider onboarding rather than asking clinics to enter credentials.

Create and approve these templates, with three **body** variables and the chosen language:

| Workflow | Body variables, in order | Example message |
| --- | --- | --- |
| reminder | Patient name, clinic name, appointment date/time | Hello {{1}}, your appointment at {{2}} is scheduled for {{3}}. Contact the clinic to change it. Reply STOP to stop updates. |
| review | Patient name, clinic name, Google review URL | Hello {{1}}, thank you for your time. If you would like to share honest feedback about {{2}}, here is the review link: {{3}}. Reply STOP to stop updates. |
| recall | Patient name, clinic name, booking URL | Hello {{1}}, {{2}} invites you to arrange your next visit. Request a time here: {{3}}. Contact the clinic with any questions. Reply STOP to stop updates. |

Choose the template classification Meta requires; review requests or re-engagement may incur marketing pricing. Ask every eligible opted-in attendee for honest feedback regardless of sentiment. No incentives or review gating. Patient permission is never inferred from a phone number alone. This release does not send diagnoses, treatment advice or clinical records.

References: [WhatsApp messaging policy](https://business.whatsapp.com/policy), [Google review content policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en).

### Razorpay and email

Activate your Razorpay business account. Create monthly INR plans matching Growth and Pro prices, and set their plan IDs plus API keys. Configure `${APP_URL}/api/webhooks/razorpay` for relevant `subscription.*` events with a separate webhook secret. Browser checkout never activates access; only verified provider state does. Test subscribe, charge, renew, pause/fail, cancellation and delayed/replayed events in test mode before live keys.

Configure SMTP with a verified sending domain and SPF/DKIM/DMARC. Verify registration, email resend, password reset and SMTP failure recovery. Production refuses startup without SMTP and public operator details.

References: [Create subscription](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/), [Webhook signatures](https://razorpay.com/docs/webhooks/validate-test/).

## Production deployment

The supplied Dockerfile builds the frontend, installs only runtime packages and runs as a non-root user. `compose.yaml` runs PostgreSQL, web and a separate worker. Docker is not installed in this workspace, so these deployment files require infrastructure validation.

1. Use a clean PostgreSQL database. Set a persistent 32-byte encryption key as 64 hex characters. Generate one using the command in `.env.example`. Keep it in a secrets manager and escrow it separately from backups. Changing it without re-encryption makes stored data unreadable.
2. Set HTTPS `APP_URL`, SMTP, operator name/address/contact, PostgreSQL credentials and provider settings. Set `POSTGRES_PASSWORD` for Compose; use a URL-safe database password or supply a correctly URL-encoded connection string in your deployment configuration.
3. Run `docker compose up --build -d` behind a TLS reverse proxy that is the only public entry point. Web binds to loopback. `TRUST_PROXY=1` assumes exactly one trusted proxy; adjust the topology deliberately. Do not expose port 3000 directly.
4. Run the acceptance checks below against the actual providers. Confirm worker monitoring, database backups and restore, delivery alerts, encryption-key recovery and rate limiting at the edge. Queue failures are visible in Automations; ambiguous sends require provider inspection before an explicit retry.
5. Finalise privacy, terms, refund handling, taxes, operator support and dental advertising requirements for your launch. The built-in policy pages are launch drafts, not a legal review. Document backup deletion and retention periods.

SQLite is a local development fallback. Production requires PostgreSQL. Schema creation is idempotent for a new installation; future schema revisions must ship explicit versioned migrations. One clinic owner per account and one booked appointment per exact start time are supported. Slot duration, multiple chairs and external calendar synchronisation are outside this release.

## Verification and launch acceptance

Run `npm run check` for the frontend build and backend tests. Run `npm audit`. Tests cover authentication, tenancy, encrypted records, publishing, booking lifecycle, entitlement checks, provider consent, idempotent scheduling, opt-out behaviour and signature handling. Mock provider tests do not certify Google approval, real message delivery or production infrastructure.

For browser checks, run `npx playwright install chromium`, seed the local demo, start `npm run dev`, then run `npm run test:browser`. This operates only on fictional local records and writes screenshots under `test-results/`.

Before charging real clinics, run a pilot with 5–10 clinics and record 30 days of baseline enquiries, attended new visits, returning visits and no-shows. Evaluate the first 60–90 days with comparable clinic periods; do not sell a guaranteed patient count. Validate that busy front desks can keep attendance and recall dates current. If those records are not kept current, integrate the clinic's practice software before promising hands-off retention.

Live acceptance: two separate clinic accounts; cross-clinic access rejected; email verification/reset; free website publication; public form and lead booking; successful and failed subscription lifecycle; authorised Google correction and positive/sensitive review handling; template delivery; STOP cancelling a pending recall; restart during provider send; allowance exhaustion; export/deletion; HTTPS cookies and backup restore.
