# Hosted verification — 5 October 2026 live rehearsal

Final release: `dpl_FSJCuUpXgkW8DCndSeDyk8KUrbQP`, READY at https://dantam-orpin.vercel.app. Final guide panel spacing was visually verified; health is OK, prelaunch is false, and the final deployment's ten-minute error-log scan returned no entries.

- Live mode enables registration and normal customer checkout. Hosted `/api/public-config` reports `prelaunch:false`; health returns OK. An empty registration request returns field validation errors (400), rather than the preview restriction (503), without creating an account or sending email.
- The configured Gmail is allowlisted for complimentary Pro after actual email verification, with fixed expiry `2026-11-04T09:17:26.219Z`. No real account was preverified or created on the owner's behalf, and no charge/subscription was made. User signup and inbox verification remain the next steps.
- The grant permits live publishing/connections and worker processing but permanently blocks checkout for the complimentary account. It cannot be forged through clinic settings, renewed by changing its environment cutoff, or applied to unrelated/unverified accounts. Expiry retains records and removes paid access.
- Production build and 76 isolated tests passed, including the four new complimentary-access tests. A subsequent CSS-only adjustment added guide-panel padding and was built by Vercel.
- Testing guide is available in the sidebar at `/app/guide`, with 18 feature areas, an eight-step journey and six automation triggers. Browser verified the guide, live registration fields, removed preview banner and preserved restricted demo protections.
- The first live deployment's error-log scan returned no entries. Real Google authorization, actual email receipt, payment/webhook lifecycle, WhatsApp Business setup, final legal details and backup restoration remain outstanding acceptance items.

Screenshots: `test-results/live-signup.jpg`, `test-results/live-testing-guide.jpg`. See `TESTING-GUIDE.md` for the user walkthrough.

# Historical hosted verification — 5 October 2026 pricing update

Release: `dpl_4jQSCn2oV4KCbEUsY1zWJxmSQupt`, READY on the `feneel518-s-team` Pro team at https://dantam-orpin.vercel.app.

- Growth changed to ₹1,999/month and Pro to ₹2,999/month in the public landing page, server plan catalogue and Billing page. Billing now reads prices from the server catalogue.
- Production build and all 72 tests passed, including mocked checkout acceptance for both new prices, rejection of former provider amounts, and complimentary-access restrictions. No real subscription was created.
- Read-only Razorpay API checks authenticated the supplied Live Mode credentials and confirmed both plans: INR, monthly, interval 1, amounts 199900 and 299900 paise. The five supplied Razorpay variables were saved in Vercel Production and deployed.
- Hosted health, plans and public-config endpoints returned 200; public-config still reports prelaunch=true. The authenticated readiness page reports Razorpay configuration present.
- Browser verification shows ₹1,999 and ₹2,999, complimentary test access with no renewal through 1 November, and disabled payment buttons. Screenshot: `test-results/revised-pricing.jpg`.
- The deployment error-log scan returned no entries. This is a short post-deployment check, not ongoing monitoring.

Live webhook delivery and subscription lifecycle remain unverified. Preview restrictions and the customer-launch limitations below still apply.

# Historical hosted verification — 2 October 2026

Release: `dpl_GMpx2f6KdFoPPh3RKpjscZmDAf2m`, deployed to the existing `feneel518-s-team` Pro team.
Public address: https://dantam-orpin.vercel.app

## Passed

- `npm run check`: production build and 69 automated tests passed. Tests cover authentication, tenant isolation, staff permissions, encrypted records, appointment collisions, billing signatures and amount validation, workflow idempotency, media normalization, PostgreSQL schema/transactions, and preview restrictions.
- Hosted demo login and authenticated workspace access.
- Created a fictional general follow-up task, completed it, and confirmed it persisted after reload in Neon.
- All four public template previews loaded at a mobile breakpoint without broken images or page-level horizontal overflow. The Gentle template was also visually inspected at desktop width.
- Updated mobile follow-up rows remain compact; the data table scrolls horizontally to expose additional columns.
- Hosted launch readiness reports HTTPS, PostgreSQL and recent scheduled worker execution as configured; email, Google, Razorpay and operator details correctly report that setup is needed.
- Hosted missed-call setup UI is present. Automated tests verify signed duplicate events create only one enquiry and callback task.
- Public `/api/health`, `/api/public-config`, and `/api/plans` return 200. Preview remains enabled; plans return Free, Growth at ₹1,499 and Pro at ₹2,499.
- An authenticated worker invocation succeeded on the preceding deployment. After deployment, the hosted readiness check and direct database inspection confirmed a recent successful scheduled worker cycle.
- No captured browser console errors in the reviewed hosted workspace. Vercel's error-log query for the preceding ten minutes returned no entries.

Screenshot: `test-results/hosted-gentle-preview.jpg`.

## Not yet accepted for a customer launch

Live email delivery, Google business access, Razorpay subscription lifecycle, custom-domain HTTPS, and backup restoration still require operator configuration and end-to-end acceptance. WhatsApp Business is not configured. Registration and paid checkout remain disabled in launch-preview mode.

See `LAUNCH.md` for secure configuration, manual test journeys, and current feature limitations. This verification is not a claim that all external integrations or every originally proposed feature are complete.
