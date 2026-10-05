# Dantam design direction

The product serves an independent Indian dentist and their receptionist. The primary task is keeping the appointment book healthy.

Palette: cobalt #2459d3, ink #192b49, white #ffffff, mist #f4f6fa, pale blue #eaf0ff and amber #e99064 for focus. Aptos/Segoe UI carry operational content; Georgia carries the public editorial headlines. Fonts remain local so the first visit does not depend on a font service.

Desktop: a white navigation rail and a quiet blue-grey workspace. Three actionable patient-growth columns lead into the diary and reports. The website builder retains its editing-and-preview layout. Mobile uses a drawer navigation and stacked content.

The landing leads with “Great care deserves a growing practice.” A keyboard-accessible interactive preview demonstrates the clinic website, confirming an enquiry and preparing a recall, using explicitly fictional local state. Six benefit-led features, a three-step workflow, monthly pricing with Growth highlighted, and practical FAQs lead to free workspace registration and later upgrade through Billing. Scoped landing styles combine cobalt actions, generous spacing and Georgia italic accents. Press feedback uses short, explicit transitions; keyboard interactions are immediate and reduced-motion preferences are respected. The public clinic template pairs a large editorial headline with an arched visit card containing address and hours, followed by services, clinician details, booking and practical FAQs. No stock clinician photographs or invented testimonials.

Landing verification: `npm run test:landing` checks the interactive demo, reset, keyboard tabs, FAQs, signup and sign-in routes, reduced motion and overflow at 320, 390, 768, 1024 and 1440 pixels. It submits no forms and sends no mutations. Set `LANDING_CHECK_URL` to test a production frontend preview; screenshots and the result are saved under `test-results/landing-redesign-*`.

Review: replaced the tooth illustration and green dashboard chrome. Kept charts subordinate to next actions. Google setup states describe configuration separately from proven live connectivity. Desktop and 390px mobile screenshots were reviewed under test-results; forms, overflow, navigation, sessions and the public demo were checked with Playwright.
