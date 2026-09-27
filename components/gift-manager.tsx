"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Player = { id: string; display_name: string };
type Gift = {
  id: string; title: string; status: string; price: number | null; occasion: string;
  occasion_name?: string | null; occasion_year: number; hiding_spot: string | null;
  is_stocking: boolean; recipient_player_id?: string | null; recipient_name?: string | null;
  recipient?: { display_name?: string } | null;
};
type OccasionBudget = {
  id: string; occasion: string; occasion_name?: string | null; occasion_year: number;
  budget: number; stocking_budget: number;
};
type RecipientBudget = {
  id: string; recipient_player_id?: string | null; recipient_name?: string | null;
  occasion: string; occasion_name?: string | null; occasion_year: number;
  budget: number; stocking_budget: number; recipient?: { display_name?: string } | null;
};

const occasions = [
  ["christmas", "🎄 Christmas"], ["birthday", "🎂 Birthday"], ["mothers_day", "💐 Mother’s Day"],
  ["fathers_day", "👔 Father’s Day"], ["valentines_day", "💝 Valentine’s Day"], ["graduation", "🎓 Graduation"],
  ["teacher_gift", "🍎 Teacher Gift"], ["wedding", "💍 Wedding"], ["baby_shower", "🍼 Baby Shower"],
  ["just_because", "❤️ Just Because"], ["other", "✨ Other"],
] as const;

const paidStatuses = new Set(["purchased", "wrapped", "given"]);

function labelForOccasion(occasion: string, name?: string | null) {
  if (occasion === "other" && name) return name;
  return occasions.find(([value]) => value === occasion)?.[1] ?? occasion;
}
function giftRecipient(g: Gift) { return g.recipient?.display_name || g.recipient_name || "Someone"; }
function money(value: number) { return "$" + Number(value || 0).toFixed(2); }
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
  const [occasionBudgets, setOccasionBudgets] = useState<OccasionBudget[]>([]);
  const [recipientBudgets, setRecipientBudgets] = useState<RecipientBudget[]>([]);
  const [budgetSetupReady, setBudgetSetupReady] = useState(true);
  const [open, setOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [outsideRecipient, setOutsideRecipient] = useState(false);
  const [budgetOutsideRecipient, setBudgetOutsideRecipient] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState("christmas");
  const [selectedOccasionName, setSelectedOccasionName] = useState("");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [occasionBudgetForm, setOccasionBudgetForm] = useState({ budget: "", stockingBudget: "" });
  const [personBudgetForm, setPersonBudgetForm] = useState({
    recipientPlayerId: "", recipientName: "", budget: "", stockingBudget: "",
  });
  const [form, setForm] = useState({
    recipientPlayerId: "", recipientName: "", title: "", occasion: "christmas",
    occasionName: "", occasionYear: 2026, status: "purchased", price: "", store: "",
    hidingSpot: "", notes: "", isStocking: false,
  });

  async function load() {
    const session = readSession();
    if (!session.playerId || !session.token) return;
    const response = await fetch(`/api/gifts?playerId=${encodeURIComponent(session.playerId)}`, {
      headers: { "x-fambam-session": session.token },
    });
    const responseText = await response.text();
    let data: any = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { return setError(`Could not load Gifts (HTTP ${response.status}). Please refresh and try again.`); }
    if (!response.ok) return setError(data.error || `Could not load gifts (HTTP ${response.status}).`);
    setPlayers(data.players || []);
    setGifts(data.gifts || []);
    setOccasionBudgets(data.occasionBudgets || []);
    setRecipientBudgets(data.recipientBudgets || []);
    setBudgetSetupReady(data.budgetSetupReady !== false);
  }

  useEffect(() => {
    const year = new Date().getFullYear();
    setSelectedYear(year);
    setForm((current) => ({ ...current, occasionYear: year }));
    void load();
  }, []);

  const selectedGifts = useMemo(() => gifts.filter((g) =>
    g.occasion === selectedOccasion &&
    g.occasion_year === selectedYear &&
    (selectedOccasion !== "other" || (g.occasion_name || "Other") === (selectedOccasionName || "Other"))
  ), [gifts, selectedOccasion, selectedOccasionName, selectedYear]);

  const selectedBudget = occasionBudgets.find((b) =>
    b.occasion === selectedOccasion && b.occasion_year === selectedYear &&
    (selectedOccasion !== "other" || (b.occasion_name || "Other") === (selectedOccasionName || "Other"))
  );
  const spent = selectedGifts.filter((g) => paidStatuses.has(g.status)).reduce((sum, g) => sum + Number(g.price || 0), 0);
  const stockingSpent = selectedGifts.filter((g) => g.is_stocking && paidStatuses.has(g.status)).reduce((sum, g) => sum + Number(g.price || 0), 0);
  const totalBudget = Number(selectedBudget?.budget || 0);
  const stockingBudget = Number(selectedBudget?.stocking_budget || 0);
  const remaining = totalBudget - spent;

  const selectedRecipientBudgets = recipientBudgets.filter((b) =>
    b.occasion === selectedOccasion && b.occasion_year === selectedYear &&
    (selectedOccasion !== "other" || (b.occasion_name || "Other") === (selectedOccasionName || "Other"))
  );

  async function post(payload: Record<string, unknown>) {
    const session = readSession();
    if (!session.playerId || !session.token) throw new Error("Open FamBam through your normal player sign-in first.");
    const response = await fetch("/api/gifts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-fambam-session": session.token },
      body: JSON.stringify({ ...payload, shopperPlayerId: session.playerId }),
    });
    const responseText = await response.text();
    let data: any = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { throw new Error(`FamBam received an unexpected server response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.error || `Could not save (HTTP ${response.status}).`);
    return data;
  }

  async function submitGift(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await post({ ...form, action: "saveGift" });
      setForm({ ...form, recipientName: "", title: "", price: "", store: "", hidingSpot: "", notes: "", isStocking: false });
      setOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save gift."); }
    finally { setSaving(false); }
  }

  async function saveOccasionBudget(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await post({
        action: "saveOccasionBudget", occasion: selectedOccasion, occasionName: selectedOccasionName,
        occasionYear: selectedYear, budget: occasionBudgetForm.budget || 0,
        stockingBudget: occasionBudgetForm.stockingBudget || 0,
      });
      setOccasionBudgetForm({ budget: "", stockingBudget: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save budget."); }
    finally { setSaving(false); }
  }

  async function savePersonBudget(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await post({
        action: "saveRecipientBudget", ...personBudgetForm, occasion: selectedOccasion,
        occasionName: selectedOccasionName, occasionYear: selectedYear,
      });
      setPersonBudgetForm({ recipientPlayerId: "", recipientName: "", budget: "", stockingBudget: "" });
      setBudgetOutsideRecipient(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save person budget."); }
    finally { setSaving(false); }
  }

  function recipientSpent(b: RecipientBudget) {
    return selectedGifts.filter((g) => {
      const same = b.recipient_player_id ? g.recipient_player_id === b.recipient_player_id : g.recipient_name === b.recipient_name;
      return same && paidStatuses.has(g.status);
    }).reduce((sum, g) => sum + Number(g.price || 0), 0);
  }

  const yearOptions = Array.from({ length: 8 }, (_, i) => selectedYear + 2 - i);

  return <section className="rounded-3xl border border-violet-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-xs font-bold uppercase tracking-wider text-violet-600">My private shopping</div><h2 className="text-xl font-black">🎁 My Gifts</h2></div>
      <button onClick={() => setOpen(!open)} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white">+ Add Gift</button>
    </div>

    <div className="mt-4 rounded-2xl border bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <select value={selectedOccasion} onChange={(e) => { setSelectedOccasion(e.target.value); if (e.target.value !== "other") setSelectedOccasionName(""); }} className="rounded-xl border bg-white p-3 font-bold">
          {occasions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="rounded-xl border bg-white p-3 font-bold">
          {yearOptions.map((year) => <option key={year}>{year}</option>)}
        </select>
      </div>
      {selectedOccasion === "other" && <input placeholder="Occasion name" value={selectedOccasionName} onChange={(e)=>setSelectedOccasionName(e.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3" />}

      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">{labelForOccasion(selectedOccasion, selectedOccasionName)} {selectedYear}</div>
          <div className="text-sm font-semibold text-slate-500">Budget and spending stay saved with this year forever.</div>
        </div>
        <button onClick={()=>setBudgetOpen(!budgetOpen)} className="rounded-xl border bg-white px-3 py-2 text-xs font-black">✏️ Budget</button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">BUDGET</div><div className="text-lg font-black">{money(totalBudget)}</div></div>
        <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">SPENT</div><div className="text-lg font-black">{money(spent)}</div></div>
        <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">REMAINING</div><div className={`text-lg font-black ${remaining < 0 ? "text-red-600" : "text-emerald-700"}`}>{money(remaining)}</div></div>
      </div>
      {(stockingBudget > 0 || stockingSpent > 0) && <div className="mt-2 rounded-xl bg-white p-3 text-sm font-bold">🧦 Stockings: {money(stockingSpent)} spent of {money(stockingBudget)} · {money(stockingBudget - stockingSpent)} remaining</div>}

      {!budgetSetupReady && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Budget setup needs the latest Supabase Gifts migration before these controls can save.</div>}

      {budgetOpen && <div className="mt-3 space-y-3 rounded-xl border bg-white p-3">
        <form onSubmit={saveOccasionBudget} className="space-y-2">
          <div className="font-black">Overall occasion budget</div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" step="0.01" placeholder={selectedBudget ? `Current: ${money(totalBudget)}` : "Overall budget"} value={occasionBudgetForm.budget} onChange={(e)=>setOccasionBudgetForm({...occasionBudgetForm,budget:e.target.value})} className="rounded-xl border p-3" />
            <input type="number" min="0" step="0.01" placeholder={selectedBudget ? `Stocking: ${money(stockingBudget)}` : "Stocking budget"} value={occasionBudgetForm.stockingBudget} onChange={(e)=>setOccasionBudgetForm({...occasionBudgetForm,stockingBudget:e.target.value})} className="rounded-xl border p-3" />
          </div>
          <button disabled={saving || !budgetSetupReady} className="w-full rounded-xl bg-[#10254a] p-3 font-black text-white disabled:opacity-50">Save Occasion Budget</button>
        </form>

        <form onSubmit={savePersonBudget} className="space-y-2 border-t pt-3">
          <div className="font-black">Budget by person</div>
          {!budgetOutsideRecipient ? <select required value={personBudgetForm.recipientPlayerId} onChange={(e)=>{
            if(e.target.value==="__other__"){setBudgetOutsideRecipient(true);setPersonBudgetForm({...personBudgetForm,recipientPlayerId:""});}
            else setPersonBudgetForm({...personBudgetForm,recipientPlayerId:e.target.value,recipientName:""});
          }} className="w-full rounded-xl border p-3"><option value="">Who is this budget for?</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}<option value="__other__">➕ Someone else…</option></select>
          : <div className="flex gap-2"><input required placeholder="Their name" value={personBudgetForm.recipientName} onChange={(e)=>setPersonBudgetForm({...personBudgetForm,recipientName:e.target.value})} className="min-w-0 flex-1 rounded-xl border p-3"/><button type="button" onClick={()=>setBudgetOutsideRecipient(false)} className="rounded-xl border px-3 font-bold">FamBam</button></div>}
          <div className="grid grid-cols-2 gap-2">
            <input required type="number" min="0" step="0.01" placeholder="Gift budget" value={personBudgetForm.budget} onChange={(e)=>setPersonBudgetForm({...personBudgetForm,budget:e.target.value})} className="rounded-xl border p-3"/>
            <input type="number" min="0" step="0.01" placeholder="Stocking budget" value={personBudgetForm.stockingBudget} onChange={(e)=>setPersonBudgetForm({...personBudgetForm,stockingBudget:e.target.value})} className="rounded-xl border p-3"/>
          </div>
          <button disabled={saving || !budgetSetupReady} className="w-full rounded-xl bg-violet-700 p-3 font-black text-white disabled:opacity-50">Save Person Budget</button>
        </form>

        {selectedRecipientBudgets.length > 0 && <div className="space-y-2 border-t pt-3">{selectedRecipientBudgets.map((b)=>{
          const personSpent=recipientSpent(b); const personBudget=Number(b.budget||0);
          return <div key={b.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><div className="font-black">{b.recipient?.display_name || b.recipient_name || "Someone"}</div><div className="text-xs font-semibold text-slate-500">{money(personSpent)} spent · {money(personBudget-personSpent)} remaining</div></div><div className="font-black">{money(personBudget)}</div></div>;
        })}</div>}
      </div>}
    </div>

    {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

    {open && <form onSubmit={submitGift} className="mt-4 space-y-3 rounded-2xl bg-violet-50 p-4">
      {!outsideRecipient ? <select required value={form.recipientPlayerId} onChange={(e)=>{
        if(e.target.value==="__other__"){setOutsideRecipient(true);setForm({...form,recipientPlayerId:""});}
        else setForm({...form,recipientPlayerId:e.target.value,recipientName:""});
      }} className="w-full rounded-xl border bg-white p-3"><option value="">Who is it for?</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}<option value="__other__">➕ Someone else…</option></select>
      : <div className="flex gap-2"><input autoFocus required placeholder="Their name" value={form.recipientName} onChange={(e)=>setForm({...form,recipientName:e.target.value})} className="min-w-0 flex-1 rounded-xl border bg-white p-3"/><button type="button" onClick={()=>{setOutsideRecipient(false);setForm({...form,recipientName:""});}} className="rounded-xl border bg-white px-3 text-sm font-bold">FamBam</button></div>}
      <input required placeholder="What did you get?" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="w-full rounded-xl border bg-white p-3"/>
      <div className="grid grid-cols-2 gap-2">
        <select value={form.occasion} onChange={(e)=>setForm({...form,occasion:e.target.value,occasionName:e.target.value==="other"?form.occasionName:""})} className="rounded-xl border bg-white p-3">{occasions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <select value={form.occasionYear} onChange={(e)=>setForm({...form,occasionYear:Number(e.target.value)})} className="rounded-xl border bg-white p-3">{yearOptions.map(y=><option key={y}>{y}</option>)}</select>
      </div>
      {form.occasion==="other"&&<input required placeholder="What’s the occasion?" value={form.occasionName} onChange={(e)=>setForm({...form,occasionName:e.target.value})} className="w-full rounded-xl border bg-white p-3"/>}
      <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="w-full rounded-xl border bg-white p-3"><option value="idea">💡 Idea</option><option value="to_buy">🛒 To Buy</option><option value="purchased">📦 Purchased</option><option value="wrapped">🎀 Wrapped</option><option value="given">✅ Given</option></select>
      <div className="grid grid-cols-2 gap-2"><input type="number" min="0" step="0.01" placeholder="Price" value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})} className="rounded-xl border bg-white p-3"/><input placeholder="Store" value={form.store} onChange={(e)=>setForm({...form,store:e.target.value})} className="rounded-xl border bg-white p-3"/></div>
      <input placeholder="📍 Hiding spot (private to you)" value={form.hidingSpot} onChange={(e)=>setForm({...form,hidingSpot:e.target.value})} className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3"/>
      <textarea placeholder="Notes" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} className="w-full rounded-xl border bg-white p-3"/>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isStocking} onChange={(e)=>setForm({...form,isStocking:e.target.checked})}/> 🧦 This is a stocking item</label>
      <button disabled={saving} className="w-full rounded-xl bg-violet-700 p-3 font-black text-white disabled:opacity-50">{saving?"Saving...":"Save Gift"}</button>
    </form>}

    <div className="mt-4">
      <div className="mb-2 flex items-end justify-between"><div><div className="font-black">{labelForOccasion(selectedOccasion, selectedOccasionName)} {selectedYear}</div><div className="text-xs font-semibold text-slate-500">{selectedGifts.length} gift{selectedGifts.length===1?"":"s"} tracked</div></div></div>
      {selectedGifts.length===0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm font-semibold text-slate-500">No gifts saved for this occasion yet.</div>
      : <div className="space-y-2">{selectedGifts.map(g=><div key={g.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><div><div className="font-black">{g.is_stocking?"🧦 ":""}{g.title}</div><div className="text-xs text-slate-500">{giftRecipient(g)} · {g.status.replace("_"," ")}</div>{g.hiding_spot&&<div className="mt-1 text-xs font-bold text-amber-700">📍 {g.hiding_spot}</div>}</div><div className="font-black">{g.price==null?"":money(Number(g.price))}</div></div></div>)}</div>}
    </div>
  </section>;
}
