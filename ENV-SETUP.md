# Dantam environment setup — 5 October 2026

The Gmail and Google OAuth values supplied in `.env.local` have been copied to the Vercel project's Production environment. Secrets are not included in this document.

## Configured for testing

- Database, encryption, authentication and cron keys: existing hosted values preserved. Empty local key fields were filled with the matching hosted values because the local database URL points to that same Neon database.
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD: configured. Gmail connection and authentication verified without sending a message.
- MAIL_FROM and SUPPORT_EMAIL: use the configured Gmail address for testing.
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: configured; this does not establish Google API approval or a successful user authorization.
- Razorpay: supplied Live Mode keys and webhook secret configured. Read-only provider checks confirm Growth at ₹1,999/month (199900 paise) and Pro at ₹2,999/month (299900 paise), INR, interval 1. No subscription or charge was created. Webhook delivery and the subscription lifecycle still need end-to-end testing; configuration alone does not verify them.
- APP_URL: `http://localhost:3000` locally; `https://dantam-orpin.vercel.app` on Vercel.
- LAUNCH_MODE: hosted `live` for the requested rehearsal; the local environment remains `preview`. New registrations follow real email verification. Ordinary customer checkout uses supplied Live Mode Razorpay credentials.
- COMPLIMENTARY_ACCESS_EMAILS and COMPLIMENTARY_ACCESS_UNTIL: private operator grant for the approved Gmail through 4 November 2026. Applied only after verification, with no payment/renewal and checkout blocked for that account. It does not convert the synthetic demo account.
- NODE_ENV: supplied by the execution environment; do not put `development` in `.env.local`, because that can make a production Vite build include development React.

The server reads `.env.local` before `.env`, while existing process/Vercel variables take precedence. Tests skip local credential files. `.env.local` uses the hosted Neon database; local edits therefore share hosted test records. Do not replace ENCRYPTION_KEY for this database.

## Google console setup still required

For the same Web application OAuth client, allow these redirect URIs for the environments you use:

```
https://dantam-orpin.vercel.app/api/google/callback
http://localhost:3000/api/google/callback
```

Configure Dantam's consent screen, add the connecting Google account as a test user while the Google application is in testing, and complete the Business Profile API access requirements. Credentials being present is not proof of API approval. The synthetic Growth test account still blocks real Google connections separately from these environment settings.

## Optional now; required for their respective launch features

| Variables | When to fill |
|---|---|
| LEGAL_ENTITY, LEGAL_ADDRESS | Replace hosted placeholders with real operator details before customer launch |
| PLATFORM_ADMIN_EMAILS | Optional verified owner email allowlist for the platform dashboard |
| Razorpay test-mode configuration | Use a separate test environment with Test Mode keys and plans to rehearse checkout without real charges. The supplied configuration is Live Mode. |
| META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN | Only when enabling WhatsApp Business webhooks |

WhatsApp number tokens and approved template names are configured per clinic through Connections. No Razorpay or WhatsApp secrets are needed for the private no-payment Growth workflow test.

The owner requested live-mode testing before commercial acceptance is complete. Real email receipt, external integrations and final operator details still need acceptance before selling. Vercel variable changes require a new deployment to take effect.
