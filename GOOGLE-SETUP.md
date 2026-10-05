# Test Dantam with your own Google Business Profile

The app is ready for a read-only connection test. Google project approval and your credentials still need configuration. Owning a Google Business Profile does not automatically grant API access.

## 1. Prepare your Google project

Use the Google account that owns or manages your verified business. Create a project in [Google Cloud Console](https://console.cloud.google.com/projectcreate). Follow [Google's prerequisites and access application](https://developers.google.com/my-business/content/prereqs). Google currently requires an active, verified profile of at least 60 days and a business website. Review the current criteria before applying; Google controls approval.

Follow [Google's API enablement guide](https://developers.google.com/my-business/content/basic-setup). Dantam calls My Business Account Management API, My Business Business Information API and Google My Business API (reviews). A 403 or zero quota can indicate missing approval or a disabled API.

## 2. Create an OAuth client

In Google Auth Platform, configure Branding with your app name and support contact. Configure Audience; for an external app in Testing, add your own Google account as a test user. Under Data Access, add `https://www.googleapis.com/auth/business.manage`.

Create a **Web application** client. Add this exact authorised redirect URI for local development:

```text
http://localhost:3000/api/google/callback
```

The app uses a server redirect flow. Its callback must exactly match the URI registered with Google. See [Google's web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

## 3. Configure Dantam locally

Copy `.env.example` to `.env` if it does not exist. Preserve existing values. Fill these in locally:

```dotenv
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Keep the secret out of chat and version control. Restart with `npm run dev` after editing.

Register your own clinic at [local registration](http://localhost:3000/register). The fictional demo cannot connect a real business. Without SMTP, verification emails are saved as JSON files in `data/mail/`; open the link in the email matching your new account. With SMTP configured, check your inbox.

## 4. Run the free test

Open **Connections**. The guide shows configuration and verification status. Click **Connect Google**, grant access, then **Choose location** to select your business.

Click **Test connection**. It displays the business name, phone, website and review summary when available. Profile success and review failure are reported separately. It does not edit your listing, publish replies or send patient messages, and does not require a paid plan.

No locations: check that the Google account manages the business. Redirect mismatch: compare the callback character for character. Access denied: check the test user, enabled APIs and approval. Testing-mode authorisations may expire; reconnect when required.

## 5. Try the customer journey

1. Finish **Your website** with your real details, preview it and publish when ready.
2. In **Growth plan**, select a channel and copy its tracked booking link.
3. Open it in a private browser window and submit an enquiry using your own test contact details.
4. Check **Website requests**, record an appointment, then attendance. Inspect the source and outcome in Growth plan.
5. Add a dentist-chosen recall date to a test patient and check the recall queue. Automated delivery separately requires WhatsApp, an active paid plan, enabled workflows, a running worker and patient permission.

Localhost links work only on your computer. Deploy to public HTTPS, update APP_URL and register that callback before sharing with patients or adding your website to Google. Profile corrections and review replies remain separate approved paid workflows.

## Verification status

Local tests cover mocked Google responses, complete and partial connection checks, account isolation and authentication. Browser checks cover setup, demo and growth pages on desktop and mobile. Live Google access remains untested because project approval and credentials have not been supplied.
