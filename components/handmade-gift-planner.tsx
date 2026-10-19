"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Plan = { id: string; recipient: string; occasion: string; year: number; product: string; quantity: number; made: number; addedBy: string; addedById: string; createdAt: string };
function session() { return { playerId: window.localStorage.getItem("fambam_player_id") ?? "", token: window.localStorage.getItem("fambam_session_token") ?? "" }; }
async function read(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { throw new Error(`Gift plan returned an unreadable response (${response.status}).`); } }

export default function HandmadeGiftPlanner() {
  const [items, setItems] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("Christmas");
  const [year, setYear] = useState("2026");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");

  const load = useCallback(async () => {
    const s = session();
    if (!s.playerId || !s.token) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/handmade-gifts?playerId=${encodeURIComponent(s.playerId)}`, { cache: "no-store", headers: { "x-fambam-session": s.token } });
      const data = await read(response); if (!response.ok) throw new Error(data.error ?? "Could not load handmade-gift plans.");
      setItems(Array.isArray(data.items) ? data.items : []); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load handmade-gift plans."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function post(payload: Record<string, unknown>) {
    const s = session(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/handmade-gifts", { method: "POST", headers: { "content-type": "application/json", "x-fambam-session": s.token }, body: JSON.stringify({ ...payload, playerId: s.playerId }) });
      const data = await read(response); if (!response.ok) throw new Error(data.error ?? "Could not update the gift plan.");
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the gift plan."); return false; }
    finally { setBusy(false); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (await post({ action: "add", recipient, occasion, year: Number(year), product, quantity: Number(quantity) })) { setRecipient(""); setProduct(""); setQuantity("1"); }
  }

  const totals = useMemo(() => {
    const map = new Map<string, { quantity: number; made: number }>();
    for (const item of items) { const key = `${item.product} · ${item.occasion} ${item.year}`; const row = map.get(key) ?? { quantity: 0, made: 0 }; row.quantity += item.quantity; row.made += item.made; map.set(key, row); }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return <section className="mt-5 rounded-3xl border border-rose-200 bg-white p-4 shadow-sm">
    <div className="mb-3"><div className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Shared family plan</div><h2 className="mt-1 text-xl font-black text-[#10254a]">🫙 Homemade gifts</h2><p className="mt-1 text-sm font-medium text-slate-500">Keep gift ideas through the year and see how many bottles, jars, or other treats to make.</p></div>
    <form onSubmit={add} className="grid gap-2 rounded-2xl bg-rose-50 p-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-600">Who is it for?<input required value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Mail carrier, cleaner, Dr. Lee, work team…" className="mt-1 min-h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm text-[#10254a]" /><span className="mt-1 block text-[10px] font-medium text-slate-500">Use one person or group per row. Add several rows if they need different gifts.</span></label>
      <label className="text-xs font-bold text-slate-600">What are we making?<input required value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Vanilla, strawberry jam…" className="mt-1 min-h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm text-[#10254a]" /></label>
      <label className="text-xs font-bold text-slate-600">Occasion<input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Christmas, birthday…" className="mt-1 min-h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm text-[#10254a]" /></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-600">Year<input type="number" min="2020" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm text-[#10254a]" /></label><label className="text-xs font-bold text-slate-600">How many?<input type="number" min="1" max="500" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm text-[#10254a]" /></label></div>
      <button disabled={busy} className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-black text-white disabled:opacity-50 sm:col-span-2">＋ Add to gift plan</button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    <div className="mt-4 rounded-2xl bg-[#fffaf0] p-3"><h3 className="text-sm font-black text-[#10254a]">How much to make</h3><p className="mt-1 text-[10px] font-medium text-slate-500">Totals group matching gift, occasion, and year—for example, all Christmas vanilla gifts.</p>{totals.length ? <div className="mt-2 flex flex-wrap gap-2">{totals.map(([name, count]) => <div key={name} className="rounded-xl border border-amber-100 bg-white px-3 py-2"><div className="text-xs font-black text-[#10254a]">{name}</div><div className="mt-0.5 text-[11px] font-semibold text-slate-500">{count.quantity} planned · {count.made} made · {Math.max(0, count.quantity - count.made)} left</div></div>)}</div> : <p className="mt-1 text-xs font-medium text-slate-500">Your planned totals will show here.</p>}</div>
    <div className="mt-3 space-y-2">{loading ? <p className="p-4 text-center text-sm text-slate-500">Loading shared gift plans…</p> : items.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-sm font-semibold text-slate-500">Add a person and a homemade gift idea to start your list.</p> : items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="font-black text-[#10254a]">{item.product} for {item.recipient}</div><div className="text-xs font-semibold text-slate-500">{item.occasion} {item.year} · added by {item.addedBy}</div></div><button disabled={busy} aria-label={`Remove ${item.product} for ${item.recipient}`} onClick={() => void post({ action: "delete", itemId: item.id })} className="px-2 text-lg font-black text-slate-400">×</button></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><button disabled={busy || item.quantity <= item.made} onClick={() => void post({ action: "quantity", itemId: item.id, delta: -1 })} className="h-9 w-9 rounded-lg border font-black disabled:opacity-40">−</button><span className="min-w-16 text-center text-xs font-black">{item.quantity} planned</span><button disabled={busy} onClick={() => void post({ action: "quantity", itemId: item.id, delta: 1 })} className="h-9 w-9 rounded-lg border font-black">＋</button></div><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-500">{item.made} made</span><button disabled={busy || item.made >= item.quantity} onClick={() => void post({ action: "made", itemId: item.id, delta: 1 })} className="min-h-9 rounded-lg bg-emerald-100 px-3 text-xs font-black text-emerald-800">Made one ✓</button></div></div></article>)}</div>
  </section>;
}
