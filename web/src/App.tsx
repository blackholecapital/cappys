import { useEffect, useRef, useState } from "react";

type View = "home" | "customers" | "billing" | "assistant";
type Customer = { id: string; name: string; email?: string; phone?: string; address: string; amount_cents: number; billing_status: string };
type Metrics = { paid_month_cents: number; coming_due_cents: number; open_estimates: number; calls_answered: number };
type Settings = { assistant: { personality: string; voice: string; has_avatar: boolean }; receptionist: { enabled: boolean } };
type Estimate = { id: string; customer_id?: string; customer_name?: string; customer_email?: string; summary: string; total_cents: number; status: string; created_at: string; emailed_at?: string };
type Billing = { id: string; customer_id: string; customer_name: string; customer_email?: string; customer_address: string; amount_cents: number; interval: string; next_bill_at?: string; status: string };

const emptyMetrics: Metrics = { paid_month_cents: 0, coming_due_cents: 0, open_estimates: 0, calls_answered: 0 };
const defaultSettings: Settings = { assistant: { personality: "Friendly, patient and direct. Speak plainly and keep answers short.", voice: "vale", has_avatar: false }, receptionist: { enabled: true } };
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
  const [customerOpen, setCustomerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [estimateCustomerId, setEstimateCustomerId] = useState("");
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "", address: "", monthly: "" });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [billing, setBilling] = useState<Billing[]>([]);
  const [billingForm, setBillingForm] = useState({ id: "", customer_id: "", amount: "", interval: "monthly", next_bill_at: "", status: "pending" });
  const [avatarFile, setAvatarFile] = useState<File>();
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [estimateId, setEstimateId] = useState("");
  const [estimateTotal, setEstimateTotal] = useState("");
  const [notice, setNotice] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [assistantReply, setAssistantReply] = useState("What can I take care of?");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const refresh = () => Promise.all([
    api<{ metrics: Metrics }>("/api/dashboard").then((r) => setMetrics(r.metrics)),
    api<{ customers: Customer[] }>("/api/customers").then((r) => setCustomers(r.customers)),
    api<{ settings: Settings }>("/api/settings").then((r) => setSettings(r.settings)),
    api<{ estimates: Estimate[] }>("/api/estimates").then((r) => setEstimates(r.estimates)),
    api<{ billing: Billing[] }>("/api/billing").then((r) => setBilling(r.billing))
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
        if (estimateCustomerId) form.append("customer_id", estimateCustomerId);
        setNotice("Writing the estimate…");
        try {
          const result = await api<{ transcript: string; estimate: { id: string; summary: string; total_cents: number } }>("/api/estimates/transcribe", { method: "POST", body: form });
          setDraft(result.estimate.summary);
          setEstimateTotal((result.estimate.total_cents / 100).toFixed(2));
          setEstimateId(result.estimate.id);
          setNotice("");
        } catch (error) { setNotice(error instanceof Error ? error.message : "Could not transcribe."); }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch { setNotice("Microphone access is blocked. Type the estimate instead."); }
  }

  async function createTypedDraft(): Promise<string> {
    if (!draft.trim()) return "";
    const result = await api<{ estimate: { id: string; summary: string; total_cents: number } }>("/api/estimates/draft", { method: "POST", body: JSON.stringify({ transcript: draft, customer_id: estimateCustomerId || undefined }) });
    setEstimateId(result.estimate.id);
    setDraft(result.estimate.summary);
    setEstimateTotal((result.estimate.total_cents / 100).toFixed(2));
    return result.estimate.id;
  }

  async function approveEstimate() {
    if (!estimateId) { await createTypedDraft(); return; }
    const totalCents = Math.max(0, Math.round(Number(estimateTotal || 0) * 100));
    await api(`/api/estimates/${estimateId}`, { method: "PATCH", body: JSON.stringify({ summary: draft, total_cents: totalCents, customer_id: estimateCustomerId || null }) });
    const customer = customers.find((item) => item.id === estimateCustomerId);
    const sendEmail = Boolean(customer?.email);
    await api(`/api/estimates/${estimateId}/approve`, { method: "POST", body: JSON.stringify({ send_email: sendEmail }) });
    setNotice(sendEmail ? "Estimate approved and queued for email." : "Estimate approved. Add an email before sending future estimates.");
    setEstimateOpen(false);
    setDraft("");
    setEstimateId("");
    setEstimateTotal("");
    setEstimateCustomerId("");
    void refresh();
  }

  function reviewEstimate(estimate: Estimate) {
    setEstimateId(estimate.id);
    setEstimateCustomerId(estimate.customer_id || "");
    setDraft(estimate.summary);
    setEstimateTotal((estimate.total_cents / 100).toFixed(2));
    setEstimateOpen(true);
  }

  function newEstimate(customerId = "") {
    setEstimateId("");
    setEstimateCustomerId(customerId);
    setDraft("");
    setEstimateTotal("");
    setEstimateOpen(true);
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

  function editBilling(item?: Billing) {
    setBillingForm(item ? { id: item.id, customer_id: item.customer_id, amount: (item.amount_cents / 100).toFixed(2), interval: item.interval, next_bill_at: item.next_bill_at?.slice(0, 10) || "", status: item.status } : { id: "", customer_id: "", amount: "", interval: "monthly", next_bill_at: "", status: "pending" });
    setBillingOpen(true);
  }

  async function saveBilling() {
    const body = JSON.stringify({ customer_id: billingForm.customer_id, amount_cents: Math.round(Number(billingForm.amount || 0) * 100), interval: billingForm.interval, next_bill_at: billingForm.next_bill_at || null });
    await api(billingForm.id ? `/api/billing/${billingForm.id}` : "/api/billing", { method: billingForm.id ? "PATCH" : "POST", body });
    setBillingOpen(false);
    setNotice("Recurring bill saved. Nothing charges until autopay is started.");
    void refresh();
  }

  async function activateBilling(item: Billing) {
    const result = await api<{ url?: string; status: string }>(`/api/billing/${item.id}/activate`, { method: "POST", body: "{}" });
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    setNotice(result.url ? "Customer checkout opened. Autopay starts after they approve it." : `Autopay status: ${result.status}.`);
    void refresh();
  }

  async function pauseBilling(item: Billing) {
    const status = item.status === "paused" ? "active" : "paused";
    await api(`/api/billing/${item.id}`, { method: "PATCH", body: JSON.stringify({ customer_id: item.customer_id, amount_cents: item.amount_cents, interval: item.interval, next_bill_at: item.next_bill_at || null, status }) });
    setNotice(status === "paused" ? "Recurring bill paused." : "Recurring bill resumed.");
    void refresh();
  }

  async function addCustomer() {
    if (!customerForm.name.trim()) return;
    const result = await api<{ customer: Customer }>("/api/customers", { method: "POST", body: JSON.stringify({ ...customerForm, amount_cents: Math.round(Number(customerForm.monthly || 0) * 100) }) });
    setCustomerOpen(false);
    setCustomerForm({ name: "", email: "", phone: "", address: "", monthly: "" });
    setEstimateCustomerId(result.customer.id);
    setNotice(`${result.customer.name} was added.`);
    void refresh();
  }

  async function saveAssistantSettings() {
    const result = await api<{ settings: Settings }>("/api/settings", { method: "POST", body: JSON.stringify(settings) });
    let saved = result.settings;
    if (avatarFile) {
      const form = new FormData();
      form.append("avatar", avatarFile);
      await api("/api/assistant/avatar", { method: "POST", body: form });
      saved = { ...saved, assistant: { ...saved.assistant, has_avatar: true } };
      setAvatarVersion((value) => value + 1);
    }
    setSettings(saved);
    setAvatarFile(undefined);
    setSettingsOpen(false);
    setNotice("Assistant and receptionist settings saved.");
  }

  async function askAssistant() {
    if (!assistantText.trim()) return;
    const result = await api<{ reply: string }>("/api/assistant/message", { method: "POST", body: JSON.stringify({ message: assistantText }) });
    setAssistantReply(result.reply);
    setAssistantText("");
  }

  async function startVideo() {
    const result = await api<{ join_url?: string }>("/api/video/session", { method: "POST", body: "{}" });
    if (result.join_url) window.open(result.join_url, "_blank", "noopener,noreferrer");
    else setNotice("Video session created.");
  }

  const title = { home: "Today", customers: "Customers", billing: "Recurring Billing", assistant: "Cappy's Assistant" }[view];
  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView("home")}><span>WE REPAIR EVERYTHING</span><strong>CAPPY'S</strong><em>ELECTRICAL</em></button><div className={`service-status ${settings.receptionist.enabled ? "" : "off"}`}><i /> Receptionist is {settings.receptionist.enabled ? "answering" : "off"}</div></header>
    <nav className="big-nav">{(["home", "customers", "billing", "assistant"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}><b>{{ home: "⌂", customers: "♟", billing: "↻", assistant: "✦" }[item]}</b>{item === "home" ? "Home" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    <section className="workspace"><div className="page-heading"><div><small>CAPPY'S ELECTRICAL</small><h1>{title}</h1></div><p>Good afternoon, Cappy.</p></div>{notice && <button className="notice" onClick={() => setNotice("")}>{notice} <b>×</b></button>}
      {view === "home" && <><div className="gauges"><Gauge label="PAID THIS MONTH" value={money(metrics.paid_month_cents)} note="Payments received" turn={42} /><Gauge label="COMING DUE" value={money(metrics.coming_due_cents)} note="Next seven days" turn={-5} /><Gauge label="OPEN ESTIMATES" value={String(metrics.open_estimates)} note="Awaiting reply" turn={22} /><Gauge label="CALLS ANSWERED" value={String(metrics.calls_answered)} note="This month" turn={58} /></div><div className="action-grid"><button className="primary-action" onClick={() => newEstimate()}><span>🎙</span><div><strong>Create an Estimate</strong><small>Talk it out. We'll write it up.</small></div></button><button onClick={() => setView("customers")}>👤<strong>Find a Customer</strong><small>Names, addresses and history</small></button><button onClick={() => setView("billing")}>↻<strong>Set Up Billing</strong><small>Recurring bills and payments</small></button><button onClick={() => setView("assistant")}>✦<strong>Ask My Assistant</strong><small>Type, talk or start video</small></button></div><section className="attention"><h2>Needs your attention</h2>{estimates.filter((item) => item.status === "draft").length ? <div className="attention-list">{estimates.filter((item) => item.status === "draft").slice(0, 5).map((estimate) => <button key={estimate.id} onClick={() => reviewEstimate(estimate)}><span><b>{estimate.customer_name || "No customer selected"}</b><small>{estimate.summary}</small></span><strong>{money(estimate.total_cents)}</strong><em>Review ›</em></button>)}</div> : <p>Nothing waiting. You are all caught up.</p>}</section></>}
      {view === "customers" && <section className="panel"><div className="panel-head"><div><h2>Customers</h2><p>Everyone you work with, all in one place.</p></div><button className="orange" onClick={() => setCustomerOpen(true)}>+ Add customer</button></div><div className="customer-list">{customers.length ? customers.map((customer) => <button key={customer.id} onClick={() => newEstimate(customer.id)}><span className="avatar">{customer.name[0]}</span><span><b>{customer.name}</b><small>{customer.address}</small></span><span><b>{money(customer.amount_cents)}</b><small>{customer.billing_status}</small></span><em>›</em></button>) : <p className="empty">Import the recurring billing CSV or add a customer.</p>}</div></section>}
      {view === "billing" && <section className="panel"><div className="panel-head"><div><h2>Recurring billing</h2><p>See every regular bill. Nothing charges until you start autopay.</p></div><div className="head-actions"><label className="upload">Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0])} /></label><button className="secondary" onClick={() => void connectStripe()}>Connect Stripe</button><button className="orange" onClick={() => editBilling()}>+ Add bill</button></div></div><div className="billing-list">{billing.length ? billing.map((item) => <article key={item.id}><button className="billing-main" onClick={() => editBilling(item)}><span><b>{item.customer_name}</b><small>{item.customer_address}</small></span><strong>{money(item.amount_cents)}<small>{item.interval}</small></strong><span className={`status ${item.status}`}>{item.status.replace("_", " ")}</span></button><div className="row-actions">{!["active", "paused"].includes(item.status) && <button className="orange mini" onClick={() => void activateBilling(item)}>{item.status === "setup_pending" ? "Retry setup" : "Start autopay"}</button>}{["active", "paused"].includes(item.status) && <button className="secondary mini" onClick={() => void pauseBilling(item)}>{item.status === "paused" ? "Resume" : "Pause"}</button>}</div></article>) : <div className="billing-empty"><h3>No recurring bills yet</h3><p>Import the CSV or add the first one by hand.</p><button className="orange" onClick={() => editBilling()}>Add recurring bill</button></div>}</div></section>}
      {view === "assistant" && <section className="assistant-panel"><div className={`assistant-avatar ${settings.assistant.has_avatar ? "has-image" : ""}`}>{settings.assistant.has_avatar ? <img src={`/api/media/avatar?v=${avatarVersion}`} alt="Assistant avatar" /> : <strong>CE</strong>}<span>ONLINE</span></div><div><small>CAPPY'S OVERWATCH</small><h2>Your business assistant</h2><p>{assistantReply}</p><div className="chat-row"><input value={assistantText} onChange={(event) => setAssistantText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askAssistant(); }} placeholder="Ask about a customer, bill or estimate…" /><button className="orange" onClick={() => void askAssistant()}>Send</button></div><div className="assistant-actions"><button className="secondary" onClick={() => newEstimate()}>🎙 Talk</button><button className="secondary" onClick={() => void startVideo()}>◉ Start video</button><button className="secondary" onClick={() => setSettingsOpen(true)}>⚙ Personality & avatar</button></div></div></section>}
    </section>
    {estimateOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setEstimateOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="estimate-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setEstimateOpen(false)}>×</button><h2 id="estimate-title">{estimateId ? "Review estimate" : "Create estimate by voice"}</h2><p>{estimateId ? "Read it, change anything you want, then approve it." : "Choose the customer, then say the work, materials, labor and price. Nothing sends until you approve it."}</p><label>Customer<select value={estimateCustomerId} onChange={(event) => setEstimateCustomerId(event.target.value)}><option value="">No customer selected</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>{!estimateId && <button className={recording ? "record recording" : "record"} onClick={() => void toggleRecording()}>{recording ? "■ Stop & write estimate" : "● Start talking"}</button>}<label>Estimate draft<textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Or type the job details here…" /></label><label className="total-field">Total ($)<input type="number" min="0" step="0.01" value={estimateTotal} onChange={(event) => setEstimateTotal(event.target.value)} /></label><div className="send-note">{customers.find((item) => item.id === estimateCustomerId)?.email ? `Will email ${customers.find((item) => item.id === estimateCustomerId)?.email} after approval.` : "No customer email selected. This will approve without emailing."}</div><div className="modal-actions"><button className="secondary" onClick={() => { setDraft(""); setEstimateId(""); setEstimateTotal(""); }}>Start over</button><button className="orange" disabled={!draft.trim()} onClick={() => void approveEstimate()}>{estimateId ? (customers.find((item) => item.id === estimateCustomerId)?.email ? "Approve & email" : "Approve estimate") : "Write estimate"}</button></div></section></div>}
    {billingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setBillingOpen(false)}><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="billing-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setBillingOpen(false)}>×</button><h2 id="billing-title">{billingForm.id ? "Edit recurring bill" : "Add recurring bill"}</h2><p>Saving only creates the schedule. Use Start autopay when it is ready.</p><div className="form-grid"><label className="wide">Customer<select value={billingForm.customer_id} disabled={Boolean(billingForm.id)} onChange={(event) => setBillingForm({ ...billingForm, customer_id: event.target.value })}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label>Amount ($)<input type="number" min="0.01" step="0.01" value={billingForm.amount} onChange={(event) => setBillingForm({ ...billingForm, amount: event.target.value })} /></label><label>How often<select value={billingForm.interval} onChange={(event) => setBillingForm({ ...billingForm, interval: event.target.value })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option><option value="yearly">Yearly</option></select></label><label className="wide">First bill date<input type="date" value={billingForm.next_bill_at} onChange={(event) => setBillingForm({ ...billingForm, next_bill_at: event.target.value })} /></label></div><div className="modal-actions"><button className="secondary" onClick={() => setBillingOpen(false)}>Cancel</button><button className="orange" disabled={!billingForm.customer_id || Number(billingForm.amount) <= 0} onClick={() => void saveBilling()}>Save bill</button></div></section></div>}
    {customerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setCustomerOpen(false)}><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="customer-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setCustomerOpen(false)}>×</button><h2 id="customer-title">Add customer</h2><p>Only the name is required. The rest can be filled in later.</p><div className="form-grid"><label className="wide">Name<input autoFocus value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></label><label>Email<input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></label><label>Phone<input type="tel" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label><label className="wide">Address<input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></label><label>Monthly bill ($)<input type="number" min="0" step="0.01" value={customerForm.monthly} onChange={(event) => setCustomerForm({ ...customerForm, monthly: event.target.value })} /></label></div><div className="modal-actions"><button className="secondary" onClick={() => setCustomerOpen(false)}>Cancel</button><button className="orange" disabled={!customerForm.name.trim()} onClick={() => void addCustomer()}>Add customer</button></div></section></div>}
    {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setSettingsOpen(false)}>×</button><h2 id="settings-title">Assistant setup</h2><p>Set this once. The same personality and voice are used for chat, video and the receptionist.</p><label>Personality<textarea className="personality" maxLength={600} value={settings.assistant.personality} onChange={(event) => setSettings({ ...settings, assistant: { ...settings.assistant, personality: event.target.value } })} /></label><div className="form-grid settings-grid"><label>Voice<select value={settings.assistant.voice} onChange={(event) => setSettings({ ...settings, assistant: { ...settings.assistant, voice: event.target.value } })}><option value="vale">Vale — clear and warm</option><option value="marin">Marin — calm and steady</option><option value="cedar">Cedar — friendly and direct</option></select></label><label>Avatar image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0])} /></label></div><label className="toggle-row"><input type="checkbox" checked={settings.receptionist.enabled} onChange={(event) => setSettings({ ...settings, receptionist: { enabled: event.target.checked } })} /><span><b>Receptionist answers calls</b><small>Can look up customers and bills, take estimate requests and hand off a caller.</small></span></label><div className="modal-actions"><button className="secondary" onClick={() => setSettingsOpen(false)}>Cancel</button><button className="orange" onClick={() => void saveAssistantSettings()}>Save setup</button></div></section></div>}
    <footer><span>☎ Receptionist: {settings.receptionist.enabled ? "On" : "Off"}</span><span>Payments: Stripe setup</span><span>Built for Cappy's Electrical</span></footer>
  </main>;
}
