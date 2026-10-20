"use client";

import { trackingMode, onHand, trackingLabel, type TrackingMode } from "@/lib/inventory-tracking";
import { useCallback, useEffect, useState } from "react";

type PantryItem = { id: string; name: string; quantity: number; packageSize: number; packageUnit: string; trackingMode?: TrackingMode; lowUnit?: string };
type QuantityUnit = "packages" | "lb" | "count";

export default function PantryQuickUse({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<PantryItem | null>(null);
  const [amount, setAmount] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>("packages");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const load = useCallback(async () => {
    const playerId = window.localStorage.getItem("fambam_player_id") ?? "";
    const token = window.localStorage.getItem("fambam_session_token") ?? "";
    setSignedIn(Boolean(playerId && token));
    if (!playerId || !token) { setLoading(false); return; }
    if (!itemId) { setError("This NFC link is missing its food item. Set up the tag again from Pantry."); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/pantry?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { "x-fambam-session": token } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the pantry.");
      const match = (Array.isArray(data.items) ? data.items : []).find((row: PantryItem) => row.id === itemId) as PantryItem | undefined;
      if (!match) throw new Error("This food is no longer in the pantry. Create a new tag from the current item.");
      setItem(match);
      setQuantityUnit(trackingMode(match) === "items" ? "count" : trackingMode(match) === "weight" ? "lb" : "packages");
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the pantry."); }
    finally { setLoading(false); }
  }, [itemId]);

  useEffect(() => { void load(); }, [load]);

  async function useFood(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    const playerId = window.localStorage.getItem("fambam_player_id") ?? "";
    const token = window.localStorage.getItem("fambam_session_token") ?? "";
    const count = Number(amount);
    if (!Number.isFinite(count) || count <= 0) { setError("Enter an amount greater than zero."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/pantry", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fambam-session": token },
        body: JSON.stringify({ action: "use", itemId: item.id, amount: count, quantityUnit, playerId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the pantry.");
      await load();
      const unitLabel = quantityUnit === "lb" ? "lb" : quantityUnit === "count" ? (count === 1 ? "item" : "items") : (count === 1 ? "package" : "packages");
      setNotice(`Recorded ${count} ${unitLabel} used. The shared pantry is updated.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the pantry."); }
    finally { setBusy(false); }
  }

  const hasWeight = item?.packageUnit === "lb" || item?.packageUnit === "oz";
  const amountOnHand = item ? `${onHand(item).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${trackingLabel(item)} on hand` : "";

  return <main className="fambam-light-forms mx-auto max-w-lg px-4 py-8 text-[#10254a]">
    <header className="rounded-3xl bg-[#06284a] p-5 text-white shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-[#f3c64f]">FamBam Hub · Pantry</div>
      <h1 className="mt-2 text-2xl font-black">Use food</h1>
      <p className="mt-1 text-sm font-semibold text-blue-100">Tap the tag, choose what you used, and the family stock updates.</p>
    </header>
    {!signedIn && !loading && <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-black">Sign in first</h2><p className="mt-1 text-sm text-slate-600">Open FamBam Hub on this phone, choose your profile, then tap this food tag again.</p><a href="/" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#10254a] px-4 text-sm font-black text-white">Open FamBam Hub</a></section>}
    {loading && <p className="mt-4 rounded-2xl bg-white p-5 text-center text-sm font-semibold text-slate-500">Loading food…</p>}
    {item && <form onSubmit={useFood} className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-800">{trackingMode(item) === "items" ? "Item tracked" : trackingMode(item) === "weight" ? "Weight tracked" : "Package tracked"}</span>
      <h2 className="mt-3 text-2xl font-black">{item.name}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">{amountOnHand}</p>
      <label className="mt-5 block text-xs font-bold text-slate-600">How much did you use?
        <div className="mt-1 flex gap-2">
          <input aria-label="Amount used" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-base font-bold" />
          <select aria-label="Unit" value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value as QuantityUnit)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
            <option value="packages">package(s)</option>
            {["count", "each"].includes(item.packageUnit) && <option value="count">individual item(s)</option>}
            {hasWeight && <option value="lb">pound(s)</option>}
          </select>
        </div>
      </label>
      {!hasWeight && !["count", "each"].includes(item.packageUnit) && <p className="mt-2 text-xs text-slate-500">To subtract pounds, edit this food in Pantry and record its package size in pounds or ounces.</p>}
      <button disabled={busy} className="mt-4 min-h-12 w-full rounded-xl bg-[#10254a] px-4 text-sm font-black text-white disabled:opacity-50">{busy ? "Updating…" : `Record ${amount || "0"} ${quantityUnit === "lb" ? "lb" : quantityUnit === "count" ? "item(s)" : Number(amount) === 1 ? "package" : "packages"} used`}</button>
      {notice && <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-bold text-green-800">{notice}</p>}
    </form>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    <a href="/" className="mt-4 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-[#10254a]">← Back to FamBam Hub</a>
  </main>;
}
