"use client";

import { FormEvent, useEffect, useState } from "react";

type Player = { id: string; display_name: string };
type Gift = {
  id: string; title: string; status: string; price: number | null; occasion: string;
  occasion_year: number; hiding_spot: string | null; is_stocking: boolean;
  recipient?: { display_name?: string } | null;
};

function readSession() {
  if (typeof window === "undefined") return { playerId: "", token: "" };
  const keys = Object.keys(localStorage);
  const tokenKey = keys.find((k) => /fambam.*session|session.*fambam/i.test(k));
  if (tokenKey) {
    try {
      const value = JSON.parse(localStorage.getItem(tokenKey) || "{}");
      return { playerId: value.playerId || value.player_id || "", token: value.sessionToken || value.token || "" };
    } catch {}
  }
  return {
    playerId: localStorage.getItem("fambamPlayerId") || localStorage.getItem("fambam_player_id") || "",
    token: localStorage.getItem("fambamSessionToken") || localStorage.getItem("fambam_session_token") || "",
  };
}

export default function GiftManager() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ recipientPlayerId: "", title: "", occasion: "christmas", occasionYear: 2026, status: "purchased", price: "", store: "", hidingSpot: "", notes: "", isStocking: false });

  async function load() {
    const session = readSession();
    if (!session.playerId || !session.token) return;
    const response = await fetch(`/api/gifts?playerId=${encodeURIComponent(session.playerId)}`, { headers: { "x-fambam-session": session.token } });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Could not load gifts.");
    setPlayers(data.players || []);
    setGifts(data.gifts || []);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const session = readSession();
    if (!session.playerId || !session.token) return setError("Open FamBam through your normal player sign-in first.");
    setSaving(true); setError("");
    const response = await fetch("/api/gifts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-fambam-session": session.token },
      body: JSON.stringify({ ...form, shopperPlayerId: session.playerId }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setError(data.error || "Could not save gift.");
    setForm({ ...form, title: "", price: "", store: "", hidingSpot: "", notes: "", isStocking: false });
    setOpen(false);
    await load();
  }

  const spent = gifts.filter((g) => ["purchased","wrapped","given"].includes(g.status)).reduce((sum,g) => sum + Number(g.price || 0), 0);

  return <section className="rounded-3xl border border-violet-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-xs font-bold uppercase tracking-wider text-violet-600">My private shopping</div><h2 className="text-xl font-black">🎁 My Gifts</h2></div>
      <button onClick={() => setOpen(!open)} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white">+ Add Gift</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">TRACKED</div><div className="text-xl font-black">{gifts.length}</div></div>
      <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">SPENT</div><div className="text-xl font-black">${spent.toFixed(2)}</div></div>
    </div>
    {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {open && <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl bg-violet-50 p-4">
      <select required value={form.recipientPlayerId} onChange={(e)=>setForm({...form,recipientPlayerId:e.target.value})} className="w-full rounded-xl border bg-white p-3"><option value="">Who is it for?</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
      <input required placeholder="What did you get?" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="w-full rounded-xl border bg-white p-3" />
      <div className="grid grid-cols-2 gap-2">
        <select value={form.occasion} onChange={(e)=>setForm({...form,occasion:e.target.value})} className="rounded-xl border bg-white p-3"><option value="christmas">Christmas</option><option value="birthday">Birthday</option><option value="other">Other</option></select>
        <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="rounded-xl border bg-white p-3"><option value="idea">💡 Idea</option><option value="to_buy">🛒 To Buy</option><option value="purchased">📦 Purchased</option><option value="wrapped">🎀 Wrapped</option><option value="given">✅ Given</option></select>
      </div>
      <div className="grid grid-cols-2 gap-2"><input type="number" min="0" step="0.01" placeholder="Price" value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})} className="rounded-xl border bg-white p-3" /><input placeholder="Store" value={form.store} onChange={(e)=>setForm({...form,store:e.target.value})} className="rounded-xl border bg-white p-3" /></div>
      <input placeholder="📍 Hiding spot (private to you)" value={form.hidingSpot} onChange={(e)=>setForm({...form,hidingSpot:e.target.value})} className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3" />
      <textarea placeholder="Notes" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} className="w-full rounded-xl border bg-white p-3" />
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isStocking} onChange={(e)=>setForm({...form,isStocking:e.target.checked})} /> 🧦 This is a stocking item</label>
      <button disabled={saving} className="w-full rounded-xl bg-violet-700 p-3 font-black text-white disabled:opacity-50">{saving ? "Saving..." : "Save Gift"}</button>
    </form>}
    {gifts.length > 0 && <div className="mt-4 space-y-2">{gifts.slice(0,8).map(g=><div key={g.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><div><div className="font-black">{g.is_stocking ? "🧦 " : ""}{g.title}</div><div className="text-xs text-slate-500">{g.recipient?.display_name || "FamBam"} • {g.occasion} {g.occasion_year} • {g.status.replace("_"," ")}</div>{g.hiding_spot && <div className="mt-1 text-xs font-bold text-amber-700">📍 {g.hiding_spot}</div>}</div><div className="font-black">{g.price == null ? "" : `$${Number(g.price).toFixed(2)}`}</div></div></div>)}</div>}
  </section>;
}
