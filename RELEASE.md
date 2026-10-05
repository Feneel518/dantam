# Dantam deployment handover — 2 October 2026

The application and deployment package are prepared locally. No live hosting has been selected, and no commercial provider credentials were supplied. This is a tested application package; it is not an externally validated production deployment.

## Verified

- Frontend production build succeeds.
- 41 automated backend and PostgreSQL-engine schema tests pass.
- Desktop and 390px mobile browser checks pass, including all workspace screens, patient creation, saved website preview and dialog keyboard behaviour.
- No browser console errors in the checked flows.
- Runtime dependency audit reports zero known vulnerabilities at handover.
- Web server and separate automation worker start locally.

The tests use SQLite for backend API flows and an embedded PostgreSQL engine for SQL compatibility. Provider responses are mocked in automated tests. Docker is not available on this machine, so the Docker/Compose deployment has not been executed here.

## Before a live launch

Choose hosting and an HTTPS domain. Configure production PostgreSQL, encryption-key storage, SMTP and your public operator details. Connect approved Google API/OAuth access, Razorpay plans and signed webhooks, Meta credentials, approved message templates and incoming-message webhooks. Review the policy drafts and complete the live acceptance checks in README.md.

WhatsApp onboarding currently requires a clinic's Cloud API credentials; Meta Embedded Signup is a future addition. Profile corrections cover owner-approved phone and website changes; other fields and verification require Google owner review. Attendance, actual collections and clinician-selected recall dates are entered by clinic staff. The release does not synchronise an existing clinic management system, manage advertisements, provide custom domains or support multiple chairs or staff roles.

Automations require authorised connections and appropriate patient permission. Medical or negative review content is held for owner review. Patient growth cannot be guaranteed; use a clinic pilot to establish measurable results and renewal willingness before expanding.

## Package

`releases/dantam-deployment.zip` includes source, the built frontend, locked dependencies, tests, Docker/Compose files and setup guides. It excludes `.env`, local encryption keys, databases, mail, screenshots and `node_modules`. Install with `npm ci`; use README.md for local or production startup. The accompanying SHA-256 file lets you verify the archive after transfer.
