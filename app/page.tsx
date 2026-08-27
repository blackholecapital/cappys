"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type View = "home" | "customers" | "billing" | "assistant";
const customers = [
  { name: "Marlborough Dental", address: "14 Main St, Marlborough", amount: "$185", status: "Auto-pay" },
  { name: "Hearthstone Apartments", address: "88 Lincoln Rd, Hudson", amount: "$420", status: "Due Sep 1" },
  { name: "The Corner Market", address: "3 Broad St, Maynard", amount: "$95", status: "Paid" },
];

function Gauge({ label, value, note, turn }: { label: string; value: string; note: string; turn: number }) {
  return <article className="gauge-card"><div className="gauge-face"><div className="needle" style={{ transform: `translateX(-50%) rotate(${turn}deg)` }} /><div className="hub" /><strong>{value}</strong><span>{label}</span></div><p>{note}</p></article>;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [imported, setImported] = useState(0);
  const [sent, setSent] = useState(false);
  const title = useMemo(() => ({ home: "Today", customers: "Customers", billing: "Recurring Billing", assistant: "Cappy's Assistant" }[view]), [view]);
  const finishRecording = () => { setRecording(false); setDraft("Replace two exterior fixtures and install one weatherproof GFCI outlet. Labor: 3 hours. Materials: fixtures, box, outlet and fittings. Estimated total: $685. Valid for 30 days."); };

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView("home")} aria-label="Go home"><span className="brand-top">WE REPAIR EVERYTHING</span><span className="brand-main">CAPPY'S</span><span className="brand-bottom">ELECTRICAL</span></button><div className="service-status"><span /> Receptionist is answering</div></header>
    <nav className="big-nav" aria-label="Main navigation"><button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><b>⌂</b> Home</button><button className={view === "customers" ? "active" : ""} onClick={() => setView("customers")}><b>♟</b> Customers</button><button className={view === "billing" ? "active" : ""} onClick={() => setView("billing")}><b>↻</b> Billing</button><button className={view === "assistant" ? "active" : ""} onClick={() => setView("assistant")}><b>✦</b> Assistant</button></nav>
    <section className="workspace"><div className="page-heading"><div><small>THURSDAY, AUGUST 27</small><h1>{title}</h1></div><p>Good afternoon, Cappy.</p></div>
      {view === "home" && <><div className="gauges"><Gauge label="PAID THIS MONTH" value="$8.4K" note="14 payments received" turn={42} /><Gauge label="COMING DUE" value="$2.1K" note="6 bills in 7 days" turn={-5} /><Gauge label="OPEN ESTIMATES" value="4" note="$6,850 awaiting reply" turn={22} /><Gauge label="CALLS ANSWERED" value="23" note="No missed calls" turn={58} /></div>
        <div className="action-grid"><Dialog><DialogTrigger asChild><button className="primary-action"><span className="action-icon">🎙</span><span><strong>Create an Estimate</strong><small>Talk it out. We'll write it up.</small></span></button></DialogTrigger><DialogContent className="estimate-dialog"><DialogHeader><DialogTitle>Create estimate by voice</DialogTitle><DialogDescription>Say the customer, work, materials, labor and price. Nothing sends until you approve it.</DialogDescription></DialogHeader>{!draft ? <button className={`record-button ${recording ? "recording" : ""}`} onClick={() => recording ? finishRecording() : setRecording(true)}>{recording ? "■ Stop & write estimate" : "● Start talking"}</button> : <><label className="draft-label">Estimate draft<textarea value={draft} onChange={e => setDraft(e.target.value)} /></label><div className="dialog-actions"><button className="secondary" onClick={() => setDraft("")}>Start over</button><button className="orange" onClick={() => setSent(true)}>{sent ? "✓ Ready to email" : "Approve estimate"}</button></div></>}</DialogContent></Dialog>
          <button className="quick-action" onClick={() => setView("customers")}><span>👤</span><strong>Find a Customer</strong><small>Names, addresses and history</small></button><button className="quick-action" onClick={() => setView("billing")}><span>↻</span><strong>Set Up Billing</strong><small>Recurring bills and payments</small></button><button className="quick-action" onClick={() => setView("assistant")}><span>✦</span><strong>Ask My Assistant</strong><small>Type, talk or start video</small></button></div>
        <section className="activity-card"><div><h2>Needs your attention</h2><span>2 items</span></div><button><b>Hearthstone Apartments</b><small>Recurring bill needs a payment method</small><em>Fix it →</em></button><button><b>Estimate #1048</b><small>Ready to email to Bob Larson</small><em>Review →</em></button></section></>}
      {view === "customers" && <section className="panel"><div className="panel-head"><div><h2>Customers</h2><p>Everyone you work with, all in one place.</p></div><button className="orange">+ Add customer</button></div><div className="customer-list">{customers.map(c => <button key={c.name}><span className="avatar">{c.name[0]}</span><span><b>{c.name}</b><small>{c.address}</small></span><span><b>{c.amount}</b><small>{c.status}</small></span><em>›</em></button>)}</div></section>}
      {view === "billing" && <section className="panel billing-panel"><div className="panel-head"><div><h2>Recurring billing</h2><p>Import the old list once, then let payments run automatically.</p></div><span className="stripe-pill">Stripe not connected</span></div><div className="billing-steps"><article><span>1</span><h3>Bring in customers</h3><p>Upload the CSV from the old billing system. We'll check it before adding anything.</p><label className="upload">Choose CSV<input type="file" accept=".csv" onChange={e => setImported(e.target.files?.length ? 38 : 0)} /></label>{imported > 0 && <b className="success">✓ {imported} customers ready to review</b>}</article><article><span>2</span><h3>Connect payments</h3><p>Sign into Stripe once. PayMe handles checkout, cards, receipts and recurring schedules.</p><button className="orange">Connect Stripe</button></article></div></section>}
      {view === "assistant" && <section className="assistant-panel"><div className="assistant-avatar"><div>CE</div><span>ONLINE</span></div><div className="assistant-copy"><small>CAPPY'S OVERWATCH</small><h2>Your business assistant</h2><p>I can find a customer, explain a bill, draft an estimate, check a payment, or tell you what needs attention.</p><div className="assistant-actions"><button className="orange">🎙 Talk to me</button><button className="secondary">⌨ Type a message</button><button className="secondary">◉ Start video</button></div><button className="personality">⚙ Change personality or avatar</button></div></section>}
    </section><footer><span>☎ Receptionist: On</span><span>Payments: Setup needed</span><span>Built for Cappy's Electrical</span></footer>
  </main>;
}
