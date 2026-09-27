"use client";

import { FormEvent, useEffect, useState } from "react";

type Player = { id: string; display_name: string };
type Gift = {
  id: string; title: string; status: string; price: number | null; occasion: string;
  occasion_name?: string | null; occasion_year: number; hiding_spot: string | null;
  is_stocking: boolean; recipient_name?: string | null;
  recipient?: { display_name?: string } | null;
};

const occasions = [
  ["christmas", "🎄 Christmas"],
  ["birthday", "🎂 Birthday"],
  ["mothers_day", "💐 Mother’s Day"],
  ["fathers_day", "👔 Father’s Day"],
  ["valentines_day", "💝 Valentine’s Day"],
  ["graduation", "🎓 Graduation"],
  ["teacher_gift", "🍎 Teacher Gift"],
  ["wedding", "💍 Wedding"],
  ["baby_shower", "🍼 Baby Shower"],
  ["just_because", "❤️ Just Because"],
  ["other", "✨ Other"],
] as const;

function occasionLabel(gift: Gift) {
  if (gift.occasion === "other" && gift.occasion_name) return gift.occasion_name;
  return occasions.find(([value]) => value === gift.occasion)?.[1].replace(/^\S+\s/, "") ?? gift.occasion;
}

function readSession() {
  if (typeof window === "undefined") return { playerId: "", token: "" };

  return {
    playerId: window.localStorage.getItem("fambam_player_id") ?? "",
    token: window.localStorage.getItem("fambam_session_token") ?? "",
  };
}

export default function GiftManager() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [open, setOpen] = useState(false);
  const [outsideRecipient, setOutsideRecipient] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    recipientPlayerId: "", recipientName: "", title: "", occasion: "christmas",
    occasionName: "", occasionYear: 2026, status: "purchased", price: "", store: "",
    hidingSpot: "", notes: "", isStocking: false,
  });

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
    setForm({ ...form, recipientName: "", title: "", price: "", store: "", hidingSpot: "", notes: "", isStocking: false });
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
      {!outsideRecipient ? (
        <select required value={form.recipientPlayerId} onChange={(e)=>{
          if (e.target.value === "__other__") {
            setOutsideRecipient(true);
            setForm({...form, recipientPlayerId:""});
          } else setForm({...form,recipientPlayerId:e.target.value,recipientName:""});
        }} className="w-full rounded-xl border bg-white p-3">
          <option value="">Who is it for?</option>
          {players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}
          <option value="__other__">➕ Someone else…</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input autoFocus required placeholder="Their name" value={form.recipientName} onChange={(e)=>setForm({...form,recipientName:e.target.value})} className="min-w-0 flex-1 rounded-xl border bg-white p-3" />
          <button type="button" onClick={()=>{setOutsideRecipient(false);setForm({...form,recipientName:""});}} className="rounded-xl border bg-white px-3 text-sm font-bold">FamBam</button>
        </div>
      )}
      <input required placeholder="What did you get?" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="w-full rounded-xl border bg-white p-3" />
      <div className="grid grid-cols-2 gap-2">
        <select value={form.occasion} onChange={(e)=>setForm({...form,occasion:e.target.value,occasionName:e.target.value === "other" ? form.occasionName : ""})} className="rounded-xl border bg-white p-3">
          {occasions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
        <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="rounded-xl border bg-white p-3"><option value="idea">💡 Idea</option><option value="to_buy">🛒 To Buy</option><option value="purchased">📦 Purchased</option><option value="wrapped">🎀 Wrapped</option><option value="given">✅ Given</option></select>
      </div>
      {form.occasion === "other" && <input required placeholder="What’s the occasion?" value={form.occasionName} onChange={(e)=>setForm({...form,occasionName:e.target.value})} className="w-full rounded-xl border bg-white p-3" />}
      <div className="grid grid-cols-2 gap-2"><input type="number" min="0" step="0.01" placeholder="Price" value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})} className="rounded-xl border bg-white p-3" /><input placeholder="Store" value={form.store} onChange={(e)=>setForm({...form,store:e.target.value})} className="rounded-xl border bg-white p-3" /></div>
      <input placeholder="📍 Hiding spot (private to you)" value={form.hidingSpot} onChange={(e)=>setForm({...form,hidingSpot:e.target.value})} className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3" />
      <textarea placeholder="Notes" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} className="w-full rounded-xl border bg-white p-3" />
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isStocking} onChange={(e)=>setForm({...form,isStocking:e.target.checked})} /> 🧦 This is a stocking item</label>
      <button disabled={saving} className="w-full rounded-xl bg-violet-700 p-3 font-black text-white disabled:opacity-50">{saving ? "Saving..." : "Save Gift"}</button>
    </form>}
    {gifts.length > 0 && <div className="mt-4 space-y-2">{gifts.slice(0,8).map(g=><div key={g.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><div><div className="font-black">{g.is_stocking ? "🧦 " : ""}{g.title}</div><div className="text-xs text-slate-500">{g.recipient?.display_name || g.recipient_name || "Someone"} • {occasionLabel(g)} {g.occasion_year} • {g.status.replace("_"," ")}</div>{g.hiding_spot && <div className="mt-1 text-xs font-bold text-amber-700">📍 {g.hiding_spot}</div>}</div><div className="font-black">{g.price == null ? "" : `$${Number(g.price).toFixed(2)}`}</div></div></div>)}</div>}
  </section>;
}
