import React from 'react';
import { testingSteps, featureGuide, automationGuide, testingLimits } from './testing-guide-data.js';
import './testing-guide.css';

export default function TestingGuide() {
  return <div className="testing-guide">
    <div className="page-title"><div><h1>Test your clinic, from start to finish.</h1><p>Your guide to setup, daily work, connections and automations.</p></div></div>
    <section className="panel"><h2>Start here</h2><p>Use your real verified account for live connections. Approved complimentary Pro access includes Growth features and does not require a card or payment.</p><ol className="launch-list">{testingSteps.map(([title, text]) => <li key={title}><strong>{title}</strong><p>{text}</p></li>)}</ol></section>
    <section className="panel due-panel"><h2>What each feature does</h2><p>18 feature areas. Plans describe normal customer access; complimentary Pro unlocks both paid tiers during its access period.</p><div className="table-scroll"><table><thead><tr><th>Feature</th><th>Plan</th><th>What it does</th></tr></thead><tbody>{featureGuide.map(([name, plan, text]) => <tr key={name}><td><strong>{name}</strong></td><td>{plan}</td><td>{text}</td></tr>)}</tbody></table></div></section>
    <section className="panel due-panel"><h2>When automations run</h2><p>Switch on one workflow at a time. Scheduling can be checked before any external delivery.</p><div className="table-scroll"><table><thead><tr><th>Workflow</th><th>Trigger</th><th>Expected behaviour</th></tr></thead><tbody>{automationGuide.map(([name, trigger, text]) => <tr key={name}><td><strong>{name}</strong></td><td>{trigger}</td><td>{text}</td></tr>)}</tbody></table></div></section>
    <section className="panel due-panel"><h2>Know what you are testing</h2><ul className="launch-list">{testingLimits.map(text => <li key={text}>{text}</li>)}</ul></section>
  </div>;
}
