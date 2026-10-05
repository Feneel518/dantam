# Dantam launch and testing

Updated 5 October 2026. Live-mode onboarding is enabled for the owner's requested hosted rehearsal. Operator details and external acceptance checks below remain incomplete; live mode is not proof of commercial readiness.

The approved Gmail receives complimentary Pro access after real email verification, until 4 November 2026. `COMPLIMENTARY_ACCESS_EMAILS` and `COMPLIMENTARY_ACCESS_UNTIL` are server-only operator settings. The grant is fixed, does not renew, cannot be requested through clinic form fields, and blocks checkout for that account. Real publishing and connections are available for this account. Other accounts follow normal Free/paid-plan rules.

Start with [TESTING-GUIDE.md](TESTING-GUIDE.md), or Testing guide in the hosted sidebar. The older synthetic Growth demo remains restricted and is not the account to use for this rehearsal.

## Infrastructure

- Vercel project: `dantam`, team `feneel518-s-team` (Pro).
- Project ID: `prj_7QWZwju0N7BB6nSnKewBJCtjq88I`.
- Project domain: https://dantam-orpin.vercel.app.
- Neon project: `icy-surf-93289833`, production branch `br-aged-bread-b3z84ciz`, database `neondb`, Singapore.
- The hosted database contains fictional demonstration records only. The local SQLite database was preserved separately.
- Local backup: `data/backups/dantam-1790932197742.sqlite`. Keep the associated development encryption key with the backup.
- Private hosted test credentials are in `.vercel/TEST-ACCESS.txt`. This is ignored and excluded from deployment. Hosted credentials differ from the documented local demo password.

## Before accepting customers

Set these in the project's **Production** environment variables, then redeploy. Never put secrets in a `VITE_` variable or commit an environment file.

1. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM with a verified sender. Test actual verification and reset email delivery.
2. Replace LEGAL_ENTITY, LEGAL_ADDRESS and SUPPORT_EMAIL with real business details. Review the legal pages and document backup retention and deletion procedures.
3. Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Authorize `https://dantam-orpin.vercel.app/api/google/callback` (or your final APP_URL) in the Google OAuth application. Verify profile/review access with a clinic account.
4. Configure RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RAZORPAY_GROWTH_PLAN_ID and RAZORPAY_PRO_PLAN_ID. The plans must be INR monthly, interval 1, for 199900 and 299900 paise. Checkout verifies the provider plan amount before creating a subscription. Register `/api/webhooks/razorpay` and test subscription activation, renewal, failure and cancellation.
5. Set PLATFORM_ADMIN_EMAILS to the verified owner email(s) allowed to view platform adoption metrics. This does not grant access to other clinics' patient records.
6. Verify the five-minute `/api/cron` worker and its CRON_SECRET authorization. The launch screen reports the last successful cycle.
7. Establish a Neon backup/restore policy and perform a restore rehearsal. The initial free database's displayed history window was six hours; configure retention appropriate to the service before real records are stored.
8. Set LAUNCH_MODE to `live` after the above checks. `preview` disables new clinic registration and subscription checkout and displays a launch-preview notice.

ENCRYPTION_KEY and BETTER_AUTH_SECRET are already generated separately. Preserve them: changing the encryption key without migrating encrypted records makes existing records unreadable.

WhatsApp Business is optional and remains unconfigured. Staff can prepare messages that open ordinary WhatsApp; the staff member presses Send there. Opening a draft is never reported as delivery. Automated reminders require each clinic's WhatsApp Cloud API connection, approved templates, Meta webhook verification, and recorded permission.

## Test the product

A separate empty, private Growth test clinic is available through `.vercel/GROWTH-TEST-ACCESS.txt`. It has 30 days of complimentary access, no subscription, no payment and no automatic renewal. Growth limits are enforced, including Pro-only restrictions. Use this account for clinic setup and daily workflow testing; the original demo includes sample records and exposes additional features. The synthetic test identity is preverified: signup and email delivery are not tested by this account. Publishing, automatic delivery and live Google/WhatsApp connections remain disabled.

Use fictional information in the private hosted demo. Do not send messages to sample numbers.

| Journey | What to do | Expected result |
|---|---|---|
| Four templates | Your website → preview Botanical, Warm Studio, Modern Care and Gentle → choose → save → reload | Selection persists; clinic records and URL stay intact |
| Content | Add a doctor, active treatment, FAQ and your own photo → save | Preview includes content; active treatments have dedicated public pages after publishing |
| Reception | Appointments → book a visit → Reception → choose date → Manage visit → Arrived | Diary displays the saved visit stage and reason |
| Enquiry pipeline | Add a phone enquiry → assign and mark contacted → book | Enquiry and confirmed appointment remain linked |
| Treatment pipeline | Add proposal with estimate → deciding → accepted → started → completed | Stage, notes and estimate persist; estimates are separate from collections |
| Follow-ups | Add a patient/enquiry/general task with due date → complete | Due counts update and audit records the actor |
| Recalls | Add a dated recall → contacted → link a booked visit | Recall outcomes appear in reports; skipped/completed records stop scheduling |
| Patient history | Open a patient name | Visits, proposals, tasks, recalls and prepared messages are visible |
| Team | Invite a separate receptionist/doctor email → open invitation | Named account has restricted access; revoking access invalidates its session |
| Reports | Change reporting period | Shows recorded enquiries, visits, estimates, collections and linked recall outcomes |
| Data isolation | Use a separate clinic account after enabling onboarding | Neither clinic can read/edit the other's records or images |

Run `npm run check` for build and backend regression tests. The test suite uses isolated in-memory SQLite and PGlite; live Neon and provider checks are separate.

## Domains and missed calls

Custom domain: add it in Launch & domains, publish the `_dantam.<hostname>` TXT ownership token, verify, then attach the domain to the Vercel project and follow Vercel DNS instructions. HTTPS and DNS must be verified independently. Clinic pages retain `/c/<slug>` routes on the domain.

Missed-call intake is a signed normalized webhook, not a vendor-specific Exotel/Twilio connector. An owner configures a 32+ character shared secret in Launch & domains (or via `POST /api/telephony`). The returned URL accepts JSON `{eventId,phone,name,occurredAt}` signed with HMAC-SHA256 in `x-dantam-signature`. Each event creates an enquiry and an owner-assigned callback task; duplicate events are ignored. A provider bridge must normalize and sign events; no patient message is sent automatically.

## Current scope limits

- Setup is a resumable checklist with editors, not a full sequential wizard.
- Hours are editable text, not a scheduling rules engine. Collision protection covers identical start times per doctor; variable appointment-duration overlap rules are not implemented.
- Treatment proposals are administrative tracking, not EMR, prescriptions or patient invoicing.
- Reactivation is manual, consent-aware outreach with saved campaign records; automated bulk campaigns and campaign revenue attribution are not implemented.
- Platform operations show adoption and subscription metrics; a founder sales CRM is not implemented.
- Live SMTP, Google, Razorpay, Meta, custom-domain TLS and disaster recovery acceptance require their configured accounts and operator details.
