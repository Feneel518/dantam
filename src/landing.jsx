import React, { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, CircleCheck, Globe2, Mail, MessageCircle, MousePointer2, Play, RotateCcw, ShieldCheck, Smile, Star, TrendingUp } from 'lucide-react';
import './landing.css';

const demoTabs = [
  { id: 'website', label: 'Your website', icon: Globe2 },
  { id: 'enquiries', label: 'New enquiries', icon: Mail },
  { id: 'recalls', label: 'Patient recalls', icon: RotateCcw },
];

function ProductDemo() {
  const [tab, setTab] = useState('enquiries');
  const [booked, setBooked] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const tabRefs = useRef([]);
  function changeTab(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % demoTabs.length;
    if (event.key === 'ArrowLeft') next = (index + demoTabs.length - 1) % demoTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = demoTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setTab(demoTabs[next].id);
    tabRefs.current[next].focus();
  }
  return <div className="lp-demo-wrap" id="demo">
    <div className="lp-demo-topline"><span><span className="lp-live-dot"/> A little look inside Dantam</span><span>Interactive preview</span></div>
    <div className="lp-demo">
      <div className="lp-demo-bar"><span className="lp-demo-mark"><Smile size={19}/> dantam.</span><span><ShieldCheck size={13}/> Sample clinic</span><span className="lp-avatar">AS</span></div>
      <div className="lp-demo-tabs" role="tablist" aria-label="Explore Dantam features">{demoTabs.map(({ id, label, icon: Icon }, index) => <button key={id} ref={el => { tabRefs.current[index] = el; }} id={`demo-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`demo-panel-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={event => changeTab(event, index)} onClick={() => setTab(id)}><Icon size={15}/>{label}</button>)}</div>
      <div className="lp-demo-panel" role="tabpanel" id={`demo-panel-${tab}`} aria-labelledby={`demo-tab-${tab}`} tabIndex={0}>
        {tab === 'website' && <div className="lp-site-preview">
          <div className="lp-site-address"><Globe2 size={13}/> Your own corner of the internet</div>
          <div className="lp-site-hero"><span className="lp-eyebrow">SMILE DENTAL · SAMPLE WEBSITE</span><h3>A little care.<br/>A brighter smile.</h3><p>Your team, treatments and appointment requests. All in one welcoming place.</p><a className="lp-btn lp-btn-dark" href="/demo">Explore clinic website <ArrowUpRight size={15}/></a><div className="lp-site-art" aria-hidden="true"><Smile size={87} strokeWidth={1}/></div></div>
          <div className="lp-site-bottom"><span><Check size={14}/> Your clinic’s identity</span><span><Check size={14}/> Mobile friendly</span></div>
        </div>}
        {tab === 'enquiries' && <>
          <div className="lp-demo-heading"><div><span className="lp-eyebrow">YOUR FRONT DESK, CONNECTED</span><h3>Every enquiry. A next step.</h3></div><span className="lp-tiny-icon"><Mail size={20}/></span></div>
          <div className="lp-demo-stats"><div><span>New enquiries</span><strong>{booked ? '02' : '03'}<span>to follow up</span></strong></div><div><span>Appointments</span><strong>{booked ? '09' : '08'}<span>confirmed</span></strong></div></div>
          <div className="lp-patient"><span className="lp-avatar peach">PM</span><div><strong>Priya Mehta</strong><span>Routine check-up · Website enquiry</span></div><span className={`lp-tag ${booked ? 'green' : ''}`}>{booked ? 'Confirmed' : 'New'}</span></div>
          <div className="lp-demo-action"><div><CalendarDays size={17}/><span>Tuesday, 10:30 am<small>{booked ? 'Added to the appointment diary' : 'Sample time agreed with the patient'}</small></span></div><button className={`lp-btn ${booked ? 'lp-btn-done' : 'lp-btn-blue'}`} disabled={booked} onClick={() => setBooked(true)}>{booked ? <><Check size={15}/> Confirmed</> : <>Confirm visit <ArrowRight size={15}/></>}</button></div>
          <div className="lp-patient lp-secondary-patient"><span className="lp-avatar lilac">RK</span><div><strong>Rahul Kapoor</strong><span>Cleaning enquiry · Google booking link</span></div><span className="lp-tag neutral">To contact</span></div>
          <div className="lp-demo-feedback" role="status">{booked ? <><CircleCheck size={15}/> One less enquiry waiting for a reply.</> : <><MousePointer2 size={15}/> Try it: confirm Priya’s visit above.</>}</div>
        </>}
        {tab === 'recalls' && <>
          <div className="lp-demo-heading"><div><span className="lp-eyebrow">MAKE THE NEXT VISIT EASIER</span><h3>Keep familiar smiles close.</h3></div><span className="lp-tiny-icon"><RotateCcw size={20}/></span></div>
          <div className="lp-patient"><span className="lp-avatar lilac">AM</span><div><strong>Arjun Mehra</strong><span>Recall date set by the dentist</span></div><span className="lp-tag green">Opted in</span></div>
          <div className="lp-message"><span><MessageCircle size={14}/> WhatsApp message preview</span><p>Hello Arjun, Smile Dental invites you to arrange your next visit. Request a time using our clinic booking link. Reply STOP to stop updates.</p><small>Sample message <CheckCheck size={14}/></small></div>
          <div className="lp-recall-action"><span role="status">{prepared ? 'Preview ready. No message was sent.' : 'A thoughtful nudge, ready to review.'}</span><button className={`lp-btn ${prepared ? 'lp-btn-done' : 'lp-btn-blue'}`} disabled={prepared} onClick={() => setPrepared(true)}>{prepared ? <><Check size={15}/> Prepared</> : <>Prepare reminder <ArrowRight size={15}/></>}</button></div>
        </>}
      </div>
      <div className="lp-demo-footer"><span><span className="lp-live-dot"/> Fictional data. Nothing is sent.</span><button onClick={() => { setBooked(false); setPrepared(false); setTab('enquiries'); }}><RotateCcw size={12}/> Reset demo</button></div>
    </div>
    <div className="lp-demo-caption"><span className="lp-caption-line"/><span>Your website. Your front desk. Finally together.</span></div>
  </div>;
}

const features = [
  { icon: Globe2, title: 'A website worth sharing', text: 'Give patients a clear picture of your clinic, treatments and team, with a simple way to request a visit.', detail: 'Included free', className: 'blue' },
  { icon: Mail, title: 'No enquiry left in a notebook', text: 'Bring website requests into one inbox. Assign a follow-up and move the conversation towards a booked visit.', detail: 'Follow-up tasks on Growth', className: 'peach' },
  { icon: CalendarDays, title: 'A calmer appointment day', text: 'Confirm visits, track attendance and keep patient contact details close to the appointment diary.', detail: 'Included free', className: 'lilac' },
  { icon: MessageCircle, title: 'A reason to come back', text: 'Work through due recalls and prepare WhatsApp reminders for patients who have opted in.', detail: 'Growth & Pro', className: 'mint' },
  { icon: Star, title: 'Give your reputation attention', text: 'Keep Google reviews in view, approve replies and invite honest feedback after attended visits.', detail: 'Growth & Pro · Google connection required', className: 'sand' },
  { icon: TrendingUp, title: 'See what brings patients in', text: 'Use tracked booking links and recorded visits to understand your enquiry sources. Add treatment and recall reports with Pro.', detail: 'Built for everyday decisions', className: 'blue' },
];

const plans = [
  { name: 'Website', price: '0', description: 'Put your practice on the map.', button: 'Create my free website', features: ['Hosted clinic website', 'Online appointment requests', 'Patient contacts & appointment diary', 'Tracked booking links', 'Google connection & profile check'] },
  { name: 'Growth', price: '1,999', description: 'Make follow-up part of your routine.', button: 'Get started with Growth', featured: true, features: ['Everything in Website', 'Assigned enquiry follow-up tasks', 'Due-recall lists & prepared messages', 'Google reviews & approved automations', '300 automated messages / month'] },
  { name: 'Pro', price: '2,999', description: 'Bring your whole team together.', button: 'Get started with Pro', features: ['Everything in Growth', 'Treatment pipeline & reactivation', 'Doctor & receptionist accounts', 'Treatment & recall reports', '1,000 automated messages / month'] },
];

const faqs = [
  ['Can I try Dantam before paying?', 'Yes. Create a free workspace to build your clinic website, receive appointment requests and manage core patient and appointment records. Upgrade from Billing when you’re ready for the paid workflows.'],
  ['What happens when I choose a paid plan?', 'You’ll create your free workspace first. After setup, open Billing to choose Growth or Pro and complete the monthly subscription checkout. Selecting a plan here does not charge you. Paid checkout is available when billing is enabled.'],
  ['How do WhatsApp reminders work?', 'Connect your clinic’s WhatsApp Business account and approved templates, record patient permission, and authorise the workflows you want. Automated messages use your plan’s allowance; WhatsApp provider charges are separate. Your team can also work from prepared messages and recall lists.'],
  ['Can I keep my existing Google Business Profile?', 'Yes. Connect the profile you already own or manage. You can check your profile on the free plan; managing reviews and approved automations requires a paid plan and an available Google connection.'],
  ['Can I cancel my monthly subscription?', 'You can request cancellation from Billing. Cancellation takes effect at the end of the current paid period. The free website plan remains available.'],
];

export default function NewLanding({ navigate, Brand }) {
  return <div className="lp">
    <a className="lp-skip" href="#main">Skip to content</a>
    <header className="lp-header"><nav className="lp-nav lp-container" aria-label="Main navigation"><a href="/" aria-label="Dantam home"><Brand/></a><div className="lp-nav-center"><a href="#features">Features</a><a href="#demo">See it in action</a><a href="#pricing">Pricing</a></div><div className="lp-nav-actions"><button className="lp-login" onClick={() => navigate('/login')}>Sign in</button><button className="lp-btn lp-btn-blue" onClick={() => navigate('/register')}>Start free <ArrowUpRight size={16}/></button></div></nav></header>
    <main id="main">
      <section className="lp-hero lp-container" aria-labelledby="hero-title">
        <div className="lp-hero-copy"><span className="lp-eyebrow lp-hero-eyebrow"><span className="lp-live-dot"/> MADE FOR DENTAL PRACTICES IN INDIA</span><h1 id="hero-title">Great care deserves<br/>a <em>growing practice.</em></h1><p>Your clinic website, patient enquiries and follow-ups, together. Turn “I’ll book later” into a clear next step—without another notebook for your front desk.</p><div className="lp-hero-actions"><button className="lp-btn lp-btn-blue" onClick={() => navigate('/register')}>Start growing my practice <ArrowUpRight size={18}/></button><a className="lp-demo-link" href="#demo"><span><Play size={12} fill="currentColor"/></span>Try the mini demo</a></div><div className="lp-hero-reassurance"><span><Check size={14}/> Free website to start</span><span><Check size={14}/> No card needed</span></div><div className="lp-hero-note"><span className="lp-note-icon"><Smile size={22}/></span><p>You look after the smiles.<br/><strong>Give the follow-ups a home.</strong></p></div></div>
        <ProductDemo/>
      </section>
      <div className="lp-capabilities lp-container"><span>ONE CONNECTED PRACTICE</span><div><Globe2 size={17}/> Get discovered</div><ArrowRight size={14} className="lp-band-arrow"/><div><CalendarDays size={17}/> Book the visit</div><ArrowRight size={14} className="lp-band-arrow"/><div><RotateCcw size={17}/> Bring patients back</div></div>
      <section className="lp-section lp-container" id="features"><div className="lp-section-heading"><div><span className="lp-eyebrow">LESS CHASING. MORE CARING.</span><h2>Good for your patients.<br/><em>Even better for your day.</em></h2></div><p>From the first enquiry to the next check-up, give your team the tools to keep things moving.</p></div><div className="lp-features">{features.map(({ icon: Icon, title, text, detail, className }) => <article key={title}><span className={`lp-feature-icon ${className}`}><Icon size={23} strokeWidth={1.7}/></span><h3>{title}</h3><p>{text}</p><span className="lp-feature-detail">{detail}</span></article>)}</div></section>
      <section className="lp-workflow"><div className="lp-container lp-workflow-inner"><div><span className="lp-eyebrow">A SMALL CHANGE TO YOUR ROUTINE</span><h2>Less “did anyone<br/>follow up?”<br/><em>More “it’s taken care of.”</em></h2><p>A shared workspace helps the dentist and front desk see the next action, without piecing together separate conversations.</p><a href="#pricing" className="lp-text-link">Find your clinic’s plan <ArrowRight size={17}/></a></div><ol className="lp-steps"><li><span>01</span><div><h3>Make your clinic easy to choose</h3><p>Add your services, team and opening hours. Preview your website, then publish when you’re happy.</p></div></li><li><span>02</span><div><h3>Give every enquiry an owner</h3><p>Contact the patient, agree a time and confirm the appointment. Your team sees what’s next.</p></div></li><li><span>03</span><div><h3>Keep the next visit in sight</h3><p>Set recall dates, review due follow-ups and connect reminders when your clinic is ready.</p></div></li></ol></div></section>
      <section className="lp-section lp-container" id="pricing"><div className="lp-pricing-heading"><span className="lp-eyebrow">A HEALTHIER ROUTINE FOR YOUR PRACTICE</span><h2>Start free. Grow <em>with intention.</em></h2><p>A useful website today. A connected follow-up routine when you’re ready.</p><span className="lp-monthly"><CalendarDays size={14}/> Monthly plans · Per clinic · INR</span></div><div className="lp-plans">{plans.map(plan => <article className={`lp-plan ${plan.featured ? 'lp-plan-featured' : ''}`} key={plan.name}>{plan.featured && <span className="lp-plan-ribbon"><TrendingUp size={13}/> BUILT FOR YOUR DAILY FOLLOW-UP</span>}<div className="lp-plan-name"><h3>{plan.name}</h3>{plan.featured && <span>Grow your practice</span>}</div><p>{plan.description}</p><div className="lp-plan-price">₹{plan.price}<span>/ month</span></div><button className={`lp-btn ${plan.featured ? 'lp-btn-blue' : 'lp-btn-outline'}`} onClick={() => navigate('/register')}>{plan.button}<ArrowUpRight size={16}/></button><span className="lp-plan-subtext">{plan.price === '0' ? 'No card required' : 'Create your workspace, then upgrade'}</span><ul>{plan.features.map(feature => <li key={feature}><Check size={16}/>{feature}</li>)}</ul></article>)}</div><p className="lp-pricing-note">Paid plans renew monthly; cancellation takes effect at the end of your paid period. Provider charges and applicable taxes are additional. Google and WhatsApp features require connected accounts and setup.</p></section>
      <section className="lp-faq lp-container"><div><span className="lp-eyebrow">A FEW THINGS YOU MAY BE WONDERING</span><h2>Clear answers.<br/><em>No guesswork.</em></h2></div><div className="lp-faq-items">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18}/></summary><p>{answer}</p></details>)}</div></section>
      <section className="lp-final lp-container"><div className="lp-final-art" aria-hidden="true"><Smile size={130} strokeWidth={.8}/></div><span className="lp-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Build a practice<br/><em>patients come back to.</em></h2><p>Start with your free clinic website.<br/>Give every patient relationship a next step.</p><button className="lp-btn lp-btn-blue" onClick={() => navigate('/register')}>Create my free workspace <ArrowUpRight size={18}/></button><span className="lp-final-note">No card needed. Upgrade when you’re ready.</span></section>
    </main>
    <footer className="lp-footer lp-container"><div><a href="/" aria-label="Dantam home"><Brand/></a><p>A little less admin. A little more care.</p></div><span>Made for dental practices in India.</span><div className="lp-footer-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><button onClick={() => navigate('/login')}>Clinic sign in <ArrowUpRight size={13}/></button></div></footer>
  </div>;
}
