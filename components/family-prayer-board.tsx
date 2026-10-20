"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Prayer = { id: string; whoFor: string; request: string; details: string; createdBy: string; createdById: string; createdAt: string; prayingBy: { playerId: string; name: string }[]; answered: boolean; answeredAt: string | null };
function session() { return { playerId: window.localStorage.getItem("fambam_player_id") ?? "", token: window.localStorage.getItem("fambam_session_token") ?? "" }; }
async function read(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { throw new Error(`Prayer list returned an unreadable response (${response.status}).`); } }

export default function FamilyPrayerBoard() {
  const [requests, setRequests] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [whoFor, setWhoFor] = useState("");
  const [request, setRequest] = useState("");
  const [details, setDetails] = useState("");
  const [showAnswered, setShowAnswered] = useState(false);
  const [playerId, setPlayerId] = useState("");

  const load = useCallback(async () => {
    const s = session();
    if (!s.playerId || !s.token) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/family-prayers?playerId=${encodeURIComponent(s.playerId)}`, { cache: "no-store", headers: { "x-fambam-session": s.token } });
      const data = await read(response); if (!response.ok) throw new Error(data.error ?? "Could not load prayer requests.");
      setRequests(Array.isArray(data.requests) ? data.requests : []); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load prayer requests."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setPlayerId(window.localStorage.getItem("fambam_player_id") ?? ""); void load(); }, [load]);

  async function post(payload: Record<string, unknown>) {
    const s = session(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/family-prayers", { method: "POST", headers: { "content-type": "application/json", "x-fambam-session": s.token }, body: JSON.stringify({ ...payload, playerId: s.playerId }) });
      const data = await read(response); if (!response.ok) throw new Error(data.error ?? "Could not update the prayer list.");
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the prayer list."); return false; }
    finally { setBusy(false); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (await post({ action: editingId ? "edit" : "add", requestId: editingId, whoFor, request, details })) { setWhoFor(""); setRequest(""); setDetails(""); setEditingId(null); setShowForm(false); }
  }

  const visible = requests.filter((item) => showAnswered ? item.answered : !item.answered);
  return <section className="fambam-light-forms mx-auto max-w-3xl px-3 py-4">
    <header className="mb-4 rounded-3xl bg-[#06284a] p-5 text-white shadow-sm"><div className="text-xs font-black uppercase tracking-[0.2em] text-[#f3c64f]">FamBam Hub</div><h1 className="mt-1 text-3xl font-black">🙏 Family Prayer</h1><p className="mt-2 text-sm font-semibold text-blue-100">A shared place to lift up the people and things on our hearts.</p></header>
    <button type="button" disabled={busy} onClick={() => { setEditingId(null); setWhoFor(""); setRequest(""); setDetails(""); setShowForm(true); }} className="min-h-11 rounded-xl bg-[#10254a] px-3 py-2 text-xs font-black text-white">＋ Add prayer request</button>
    {showForm && <form id="prayer-request-form" onSubmit={add} className="rounded-2xl border border-[#e6dfd0] bg-white p-4 shadow-sm"><h2 className="text-lg font-black text-[#10254a]">{editingId ? "Edit prayer request" : "Add a prayer request"}</h2><p className="mb-3 text-xs font-medium text-slate-500">This list is shared with the FamBam family. Share only what you’re comfortable having everyone see.</p><label className="block text-xs font-bold text-slate-600">Who or what is this for? (optional)<input value={whoFor} onChange={(e) => setWhoFor(e.target.value)} placeholder="A friend, school, health, gratitude…" className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-[#10254a]" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Prayer request<textarea required maxLength={500} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="What would you like the family to pray for?" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label><label className="mt-3 block text-xs font-bold text-slate-600">More detail (optional)<textarea maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything else you want the family to know…" rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label><button disabled={busy || !request.trim()} className="mt-3 min-h-12 w-full rounded-xl bg-[#10254a] px-4 text-sm font-black text-white disabled:opacity-50">{editingId ? "Save changes" : "Share with FamBam"}</button><button type="button" disabled={busy} onClick={() => { setShowForm(false); setEditingId(null); }} className="mt-2 min-h-11 px-3 text-xs font-bold text-slate-600">Cancel</button></form>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    <div className="mt-4 flex gap-2"><button onClick={() => setShowAnswered(false)} className={`rounded-full px-4 py-2 text-xs font-black ${!showAnswered ? "bg-[#10254a] text-white" : "bg-white text-slate-600"}`}>Current requests</button><button onClick={() => setShowAnswered(true)} className={`rounded-full px-4 py-2 text-xs font-black ${showAnswered ? "bg-[#10254a] text-white" : "bg-white text-slate-600"}`}>Answered prayers</button></div>
    <div className="mt-3 space-y-3">{loading ? <p className="rounded-2xl bg-white p-5 text-center text-sm font-semibold text-slate-500">Loading prayer requests…</p> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><div className="text-3xl">🕊️</div><p className="mt-2 text-sm font-semibold text-slate-500">{showAnswered ? "Answered prayers will be remembered here." : "No requests yet. Add one when something is on your heart."}</p></div> : visible.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="text-lg font-black text-[#10254a]">{item.whoFor || "Prayer request"}</h2><p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{item.request}</p>{item.details && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.details}</p>}<p className="mt-2 text-[10px] font-semibold text-slate-400">Shared by {item.createdBy} · {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(item.createdAt))}</p></div>{item.answered && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">Answered ✓</span>}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button disabled={busy} onClick={() => void post({ action: "praying", requestId: item.id })} className="min-h-10 rounded-xl bg-[#fffaf0] px-3 text-xs font-black text-[#10254a]">{item.prayingBy.some((person) => person.playerId === playerId) ? "✓ Prayed" : "🙏 Mark prayed"}{item.prayingBy.length > 0 && <span className="ml-1 text-slate-500">· {item.prayingBy.length}</span>}</button>{item.createdById === playerId && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { setEditingId(item.id); setWhoFor(item.whoFor); setRequest(item.request); setDetails(item.details); setShowForm(true); window.setTimeout(() => document.getElementById("prayer-request-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} className="min-h-10 rounded-xl bg-slate-100 px-3 text-xs font-black text-[#10254a]">Edit</button>{!item.answered ? <button disabled={busy} onClick={() => void post({ action: "answered", requestId: item.id, answered: true })} className="min-h-10 rounded-xl bg-emerald-100 px-3 text-xs font-black text-emerald-800">Mark answered</button> : <button disabled={busy} onClick={() => void post({ action: "answered", requestId: item.id, answered: false })} className="min-h-10 rounded-xl border px-3 text-xs font-bold text-slate-600">Reopen</button>}<button disabled={busy} onClick={() => { if (window.confirm("Remove this prayer request?")) void post({ action: "delete", requestId: item.id }); }} className="px-2 text-lg font-black text-slate-400" aria-label="Delete prayer request">×</button></div>}</div>{item.prayingBy.length > 0 && <p className="mt-2 text-[10px] font-semibold text-slate-500">Prayed: {item.prayingBy.map((person) => person.name).join(", ")}</p>}</article>)}</div>
  </section>;
}
