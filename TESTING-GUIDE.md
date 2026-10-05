# Live testing without payment

Open https://dantam-orpin.vercel.app/register and use your configured Gmail. Choose your own password, create the workspace, then verify the email. The approved email receives complimentary Pro access after verification, with checkout blocked and no automatic renewal. The old synthetic Growth login remains a restricted demo.

The complete guide is inside the app at https://dantam-orpin.vercel.app/app/guide (Testing guide in the sidebar). It covers 18 feature areas and six automation/workflow triggers. Its maintained content is in `src/testing-guide-data.js`.

## First test journey

1. Register and verify your Gmail. Reload and check that Billing says complimentary Pro and no payment/renewal.
2. Open Your website. Choose Botanical, Warm Studio, Modern Care or Gentle; add clinic details, photos, doctors, treatments and FAQs. Save and preview.
3. Publish only accurate details for a clinic you are authorized to represent. Open the public clinic link in a private browser window and submit a request with your own test contact details.
4. Find it in Website requests or Enquiry pipeline. Confirm the appointment and select its doctor. The website request itself does not reserve a slot.
5. In Reception, mark arrived, in progress and completed. Record any test collection separately from the treatment estimate.
6. Add a treatment proposal, a follow-up task and a dated recall. Complete the task, link the return appointment to the recall, then inspect the patient timeline and Reports.
7. In Connections, connect the Google account that manages your clinic, choose its location and run the read-only connection test. Google API approval/permissions remain external requirements.
8. In Automations, enable one workflow at a time and inspect the queue. Use only a contact you control for delivery tests. Keep Google auto-replies off until you intend to publish real replies.
9. Test Pro reactivation and team invitations. Use a separate staff email; share the generated invitation link yourself. Inspect role restrictions in another browser.
10. Test record export and session controls in Settings. Clearly label test records so they do not distort real reports.

## Automation timing

| Workflow | Trigger and expected outcome |
|---|---|
| Appointment reminder | Book more than 24 hours ahead with reminders enabled. A message is queued for 24 hours before the visit. |
| Review request | Mark attended with the review-request workflow and Google review URL set. Queued for two hours later. |
| Recall | Save a recall date with recalls enabled. Queued for 10:00 AM India time that day. |
| Google auto-reply | Connected location, explicit approval and enabled workflow. Recent eligible 4–5 star reviews without flagged sensitive/negative content get the standard draft queued. Other reviews require attention. |
| New website request | Queues an email to the verified owner to review the request; does not confirm the appointment. |
| Missed call | Valid signed phone-bridge event creates one enquiry and callback task; duplicate events are ignored. No automatic callback or patient message. |

The worker runs every five minutes. Automated WhatsApp sends need a Cloud API connection, approved templates, clinic authorization, patient opt-in and remaining allowance; messages send between 09:00 and 19:00 India time. Without WhatsApp Business, test queue scheduling and ordinary WhatsApp drafts only. Opening a draft is not a delivery confirmation.

Pending means queued. Sent means provider accepted, not necessarily delivered. Delivered/read require provider callbacks. Failed means fix the issue. Needs review means inspect provider history before retrying.

## Limits to remember

- Complimentary Pro includes Growth and Pro features. It does not pay external Meta/domain/hosting charges or exercise the payment lifecycle.
- Ordinary customer accounts use live Razorpay checkout. Your approved complimentary account cannot enter checkout.
- WhatsApp Business remains unconfigured. Google authorization, real email receipt, live Razorpay lifecycle, custom-domain HTTPS and backup restoration still need separate acceptance.
- Legal business details remain placeholders and must be replaced before selling.
- Reactivation is manual outreach, not automatic bulk sending. Google replies use conservative rules and a standard draft, not bespoke AI writing.
- This is administrative practice software, not a full medical record, prescriptions or invoicing system. Appointment collision checks cover the same doctor/start time, not variable-duration overlaps.
