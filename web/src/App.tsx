import { useEffect, useRef, useState } from "react";

type View = "home" | "customers" | "billing" | "assistant";
type Customer = { id: string; name: string; address: string; amount_cents: number; billing_status: string };
type Metrics = { paid_month_cents: number; coming_due_cents: number; open_estimates: number; calls_answered: number };

const emptyMetrics: Metrics = { paid_month_cents: 0, coming_due_cents: 0, open_estimates: 0, calls_answered: 0 };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong");
  return body as T;
}

function Gauge({ label, value, note, turn }: { label: string; value: string; note: string; turn: number }) {
  return <article className="gauge-card"><div className="gauge-face"><div className="needle" style={{ transform: `translateX(-50%) rotate(${turn}deg)` }} /><div className="hub" /><strong>{value}</strong><span>{label}</span></div><p>{note}</p></article>;
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [estimateId, setEstimateId] = useState("");
  const [notice, setNotice] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [assistantReply, setAssistantReply] = useState("What can I take care of?");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const refresh = () => Promise.all([
    api<{ metrics: Metrics }>("/api/dashboard").then((r) => setMetrics(r.metrics)),
    api<{ customers: Customer[] }>("/api/customers").then((r) => setCustomers(r.customers))
  ]).catch(() => setNotice("Dashboard is offline until the API is deployed."));

  useEffect(() => { void refresh(); }, []);

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("audio", audio, "estimate.webm");
        setNotice("Writing the estimate…");
        try {
          const result = await api<{ transcript: string; estimate: { id: string; summary: string } }>("/api/estimates/transcribe", { method: "POST", body: form });
          setDraft(result.estimate.summary);
          setEstimateId(result.estimate.id);
          setNotice("");
        } catch (error) { setNotice(error instanceof Error ? error.message : "Could not transcribe."); }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch { setNotice("Microphone access is blocked. Type the estimate instead."); }
  }

  async function createTypedDraft() {
    if (!draft.trim()) return;
    const result = await api<{ estimate: { id: string; summary: string } }>("/api/estimates/draft", { method: "POST", body: JSON.stringify({ transcript: draft }) });
    setEstimateId(result.estimate.id);
    setDraft(result.estimate.summary);
  }

  async function approveEstimate() {
    if (!estimateId) await createTypedDraft();
    const id = estimateId || (await api<{ estimate: { id: string } }>("/api/estimates/draft", { method: "POST", body: JSON.stringify({ transcript: draft }) })).estimate.id;
    await api(`/api/estimates/${id}/approve`, { method: "POST", body: JSON.stringify({ send_email: true }) });
    setNotice("Estimate approved and queued for email.");
    setEstimateOpen(false);
    setDraft("");
    setEstimateId("");
    void refresh();
  }

  async function importCsv(file?: File) {
    if (!file) return;
    const result = await api<{ imported: number; rejected: number }>("/api/imports/customers", { method: "POST", body: await file.text(), headers: { "content-type": "text/csv" } });
    setNotice(`${result.imported} customers imported. ${result.rejected} rows need attention.`);
    void refresh();
  }

  async function connectStripe() {
    const result = await api<{ url: string }>("/api/billing/connect", { method: "POST", body: "{}" });
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function askAssistant() {
    if (!assistantText.trim()) return;
    const result = await api<{ reply: string }>("/api/assistant/message", { method: "POST", body: JSON.stringify({ message: assistantText }) });
    setAssistantReply(result.reply);
    setAssistantText("");
  }

  async function startVideo() {
    const result = await api<{ join_url?: string }>("/api/video/session", { method: "POST", body: JSON.stringify({ personality: "friendly, patient electrical office assistant" }) });
    if (result.join_url) window.open(result.join_url, "_blank", "noopener,noreferrer");
    else setNotice("Video session created.");
  }

  const title = { home: "Today", customers: "Customers", billing: "Recurring Billing", assistant: "Cappy's Assistant" }[view];
  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView("home")}><span>WE REPAIR EVERYTHING</span><strong>CAPPY'S</strong><em>ELECTRICAL</em></button><div className="service-status"><i /> Receptionist is answering</div></header>
    <nav className="big-nav">{(["home", "customers", "billing", "assistant"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}><b>{{ home: "⌂", customers: "♟", billing: "↻", assistant: "✦" }[item]}</b>{item === "home" ? "Home" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    <section className="workspace"><div className="page-heading"><div><small>CAPPY'S ELECTRICAL</small><h1>{title}</h1></div><p>Good afternoon, Cappy.</p></div>{notice && <button className="notice" onClick={() => setNotice("")}>{notice} <b>×</b></button>}
      {view === "home" && <><div className="gauges"><Gauge label="PAID THIS MONTH" value={money(metrics.paid_month_cents)} note="Payments received" turn={42} /><Gauge label="COMING DUE" value={money(metrics.coming_due_cents)} note="Next seven days" turn={-5} /><Gauge label="OPEN ESTIMATES" value={String(metrics.open_estimates)} note="Awaiting reply" turn={22} /><Gauge label="CALLS ANSWERED" value={String(metrics.calls_answered)} note="This month" turn={58} /></div><div className="action-grid"><button className="primary-action" onClick={() => setEstimateOpen(true)}><span>🎙</span><div><strong>Create an Estimate</strong><small>Talk it out. We'll write it up.</small></div></button><button onClick={() => setView("customers")}>👤<strong>Find a Customer</strong><small>Names, addresses and history</small></button><button onClick={() => setView("billing")}>↻<strong>Set Up Billing</strong><small>Recurring bills and payments</small></button><button onClick={() => setView("assistant")}>✦<strong>Ask My Assistant</strong><small>Type, talk or start video</small></button></div><section className="attention"><h2>Needs your attention</h2><p>Approved estimates, payment exceptions and receptionist handoffs appear here.</p></section></>}
      {view === "customers" && <section className="panel"><div className="panel-head"><div><h2>Customers</h2><p>Everyone you work with, all in one place.</p></div><button className="orange">+ Add customer</button></div><div className="customer-list">{customers.length ? customers.map((customer) => <button key={customer.id}><span className="avatar">{customer.name[0]}</span><span><b>{customer.name}</b><small>{customer.address}</small></span><span><b>{money(customer.amount_cents)}</b><small>{customer.billing_status}</small></span><em>›</em></button>) : <p className="empty">Import the recurring billing CSV to add customers.</p>}</div></section>}
      {view === "billing" && <section className="panel"><div className="panel-head"><div><h2>Recurring billing</h2><p>Import the old list once, then let payments run automatically.</p></div><span className="stripe-pill">Stripe setup</span></div><div className="billing-steps"><article><span>1</span><h3>Bring in customers</h3><p>Upload the CSV. Nothing is discarded silently; bad rows are counted for review.</p><label className="upload">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0])} /></label></article><article><span>2</span><h3>Connect payments</h3><p>Sign into Stripe once. PayMe handles checkout, cards, receipts and recurring schedules.</p><button className="orange" onClick={() => void connectStripe()}>Connect Stripe</button></article></div></section>}
      {view === "assistant" && <section className="assistant-panel"><div className="assistant-avatar"><strong>CE</strong><span>ONLINE</span></div><div><small>CAPPY'S OVERWATCH</small><h2>Your business assistant</h2><p>{assistantReply}</p><div className="chat-row"><input value={assistantText} onChange={(event) => setAssistantText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askAssistant(); }} placeholder="Ask about a customer, bill or estimate…" /><button className="orange" onClick={() => void askAssistant()}>Send</button></div><div className="assistant-actions"><button className="secondary" onClick={() => setEstimateOpen(true)}>🎙 Talk</button><button className="secondary" onClick={() => void startVideo()}>◉ Start video</button><button className="secondary">⚙ Personality & avatar</button></div></div></section>}
    </section>
    {estimateOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setEstimateOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="estimate-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setEstimateOpen(false)}>×</button><h2 id="estimate-title">Create estimate by voice</h2><p>Say the customer, work, materials, labor and price. Nothing sends until you approve it.</p><button className={recording ? "record recording" : "record"} onClick={() => void toggleRecording()}>{recording ? "■ Stop & write estimate" : "● Start talking"}</button><label>Estimate draft<textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Or type the job details here…" /></label><div className="modal-actions"><button className="secondary" onClick={() => { setDraft(""); setEstimateId(""); }}>Start over</button><button className="orange" disabled={!draft.trim()} onClick={() => void approveEstimate()}>Approve estimate</button></div></section></div>}
    <footer><span>☎ Receptionist: On</span><span>Payments: Stripe setup</span><span>Built for Cappy's Electrical</span></footer>
  </main>;
}
