"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Rating = "not_tried" | "love" | "okay" | "no_thanks";
type PriceRow = { id: string; store: string; price: number; packageSize: number; packageUnit: string; purchasedAt: string; purchasedBy: string };
type PantryItem = {
  id: string; name: string; category: string; quantity: number; unit: string; packageSize: number;
  lowAt: number;
  expirationDate: string | null; frozenAt: string | null;
  packageUnit: string; store: string; lastPrice: number | null; stockUpPrice: number | null;
  rating: Rating; notes: string; updatedAt: string; priceHistory: PriceRow[];
};
type GroceryLine = { id: string; name: string; pantryItemId: string | null; addedAt: string; addedBy: string };
const STORES = ["Costco", "Aldi", "Walmart", "Ingles", "Save A Lot", "Other"];
const CATEGORIES = ["Meat", "Freezer", "Pantry", "Fridge", "Other"];
const RATINGS: { value: Rating; label: string }[] = [
  { value: "not_tried", label: "Haven’t tried" }, { value: "love", label: "Loved it" },
  { value: "okay", label: "It was okay" }, { value: "no_thanks", label: "Didn’t like" },
];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const unitPrice = (price: number, size: number) => size > 0 ? price / size : price;
const pantryHeaders = () => ({ "Content-Type": "application/json", "x-fambam-session": window.localStorage.getItem("fambam_session_token") ?? "" });

async function responseJson(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch {
    throw new Error(response.status === 404
      ? "Pantry isn’t available on this app version yet. Refresh the page after the update is published."
      : `The pantry service returned an unreadable response (${response.status}). Try refreshing the app.`);
  }
}

export default function PantryManager({ playerId }: { playerId: string }) {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [groceries, setGroceries] = useState<GroceryLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Meat");
  const [store, setStore] = useState("");
  const [packages, setPackages] = useState("1");
  const [packageSize, setPackageSize] = useState("1");
  const [packageUnit, setPackageUnit] = useState("lb");
  const [expirationDate, setExpirationDate] = useState("");
  const [frozenAt, setFrozenAt] = useState("");
  const [price, setPrice] = useState("");
  const [stockUpPrice, setStockUpPrice] = useState("");
  const [rating, setRating] = useState<Rating>("not_tried");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [groceryName, setGroceryName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/pantry?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: pantryHeaders() });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error ?? "Could not load pantry items.");
      setItems(Array.isArray(data.items) ? data.items : []);
      setGroceries(Array.isArray(data.groceries) ? data.groceries : []);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load pantry items."); }
    finally { setLoading(false); }
  }, [playerId]);
  useEffect(() => { void load(); }, [load]);

  async function submit(payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/pantry", { method: "POST", headers: pantryHeaders(), body: JSON.stringify({ ...payload, playerId }) });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error ?? "Could not save the pantry change.");
      await load();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the pantry change."); return false; }
    finally { setBusy(false); }
  }
  async function addPurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await submit({ action: "purchase", name, category, store, packages: Number(packages), packageSize: Number(packageSize), packageUnit, expirationDate: expirationDate || null, frozenAt: frozenAt || null, price: price ? Number(price) : null, stockUpPrice: stockUpPrice ? Number(stockUpPrice) : null, rating, notes });
    if (ok) { setName(""); setPackages("1"); setPrice(""); setStockUpPrice(""); setRating("not_tried"); setNotes(""); setStore(""); setExpirationDate(""); setFrozenAt(""); setFormOpen(false); }
  }
  function chooseCommonFood(food: string) {
    setName(food); setCategory("Meat"); setPackageUnit("lb"); setPackageSize("1"); setPackages("1"); setFormOpen(true);
    window.setTimeout(() => document.getElementById("pantry-food-name")?.focus(), 0);
  }
  const visibleItems = useMemo(() => filter === "All" ? items : items.filter((item) => item.category === filter), [items, filter]);
  const lowStockCount = items.filter((item) => item.quantity <= (item.lowAt ?? 1)).length;

  return <section className="mx-auto max-w-5xl px-3 py-4">
    <header className="mb-4 rounded-3xl bg-[#06284a] p-5 text-white shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.22em] text-[#f3c64f]">FamBam Hub</div>
      <h1 className="mt-1 text-3xl font-black">🧺 Pantry & Freezer</h1>
      <p className="mt-2 text-sm font-semibold text-blue-100">Track what’s on hand, what it cost, where you bought it, and what’s worth buying again.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-white/10 px-3 py-1.5">{items.length} items tracked</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5">{lowStockCount} low / out</span>
      </div>
    </header>

    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <h2 className="text-lg font-black">🛒 Grocery list</h2>
      <p className="mb-3 text-xs font-medium text-slate-600">Add something when you notice it’s running low. Everyone sees the same list.</p>
      <form onSubmit={async (e) => { e.preventDefault(); if (!groceryName.trim()) return; if (await submit({ action: "grocery-add", name: groceryName })) setGroceryName(""); }} className="flex gap-2">
        <input value={groceryName} onChange={(e) => setGroceryName(e.target.value)} placeholder="Ketchup, marshmallows…" aria-label="Grocery item" className="min-h-12 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold text-[#10254a]" />
        <button disabled={busy || !groceryName.trim()} className="min-h-12 rounded-xl bg-[#10254a] px-4 text-sm font-black text-white disabled:opacity-50">Add</button>
      </form>
      {groceries.length > 0 ? <ul className="mt-3 divide-y divide-amber-200 rounded-xl bg-white px-3">{groceries.map((line) => <li key={line.id} className="flex items-center justify-between gap-2 py-2.5"><span className="min-w-0 flex-1 text-sm font-bold text-[#10254a]">{line.name}<span className="ml-1 text-[10px] font-medium text-slate-400">· {line.addedBy}</span></span><button disabled={busy} onClick={() => void submit({ action: "grocery-bought", groceryId: line.id })} className="min-h-10 rounded-lg bg-green-100 px-3 text-xs font-black text-green-800">Bought +1</button><button disabled={busy} aria-label={`Remove ${line.name} from grocery list`} onClick={() => void submit({ action: "grocery-remove", groceryId: line.id })} className="min-h-10 rounded-lg px-2 text-lg font-black text-slate-400">×</button></li>)}</ul> : <p className="mt-3 text-xs font-semibold text-slate-500">Nothing on the list yet.</p>}
    </div>

    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-black">Quick add</h2>
      <p className="mb-3 text-xs font-medium text-slate-500">Choose a common meat, or add another food.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {["Chicken breast", "Chicken thighs", "Hamburger meat", "Bacon", "Hot dogs", "Other food"].map((food) => <button key={food} type="button" onClick={() => { if (food === "Other food") { setName(""); setCategory("Pantry"); setPackageUnit("count"); setPackageSize("1"); setFormOpen(true); } else chooseCommonFood(food); }} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-[#10254a] active:bg-blue-50">＋ {food}</button>)}
      </div>
    </div>

    {formOpen && <form onSubmit={addPurchase} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2"><div><h2 className="text-lg font-black">Add food / record a purchase</h2><p className="text-xs font-medium text-slate-500">Price and store are optional. Package size lets the app compare unit prices.</p></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Close form" className="rounded-lg bg-slate-100 px-3 py-1 text-xl font-bold">×</button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-2">Food name<input id="pantry-food-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ground beef" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Section<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Packages bought<input required min="1" step="1" type="number" value={packages} onChange={(e) => setPackages(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Amount per package<input required min="0.01" step="0.01" type="number" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Measured in<select value={packageUnit} onChange={(e) => setPackageUnit(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">{["lb", "oz", "count", "each", "bags", "boxes"].map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Expires on (optional)<input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Put in freezer (optional)<input type="date" value={frozenAt} onChange={(e) => setFrozenAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]" /></label>
      </div>
      <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><summary className="cursor-pointer text-xs font-black text-slate-600">Optional: store, price, and family rating</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">Store<select value={store} onChange={(e) => setStore(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]"><option value="">Don’t record</option>{STORES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Price per package<input min="0" step="0.01" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Stock up at/below<input min="0" step="0.01" type="number" value={stockUpPrice} onChange={(e) => setStockUpPrice(e.target.value)} placeholder="$ / package" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Family verdict<select value={rating} onChange={(e) => setRating(e.target.value as Rating)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">{RATINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-3">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Good for tacos; family favorite" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
      </div>
      </details>
      <button disabled={busy} className="mt-3 w-full rounded-xl bg-[#10254a] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save food and quantity"}</button>
    </form>}

    {error && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{["All", ...CATEGORIES].map((option) => <button key={option} onClick={() => setFilter(option)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${filter === option ? "bg-[#10254a] text-white" : "bg-white text-slate-600 shadow-sm"}`}>{option}</button>)}</div>

    {loading ? <p className="rounded-2xl bg-white p-5 text-center text-sm font-semibold text-slate-500">Loading your food list…</p>
      : visibleItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><div className="text-3xl">🧊</div><h2 className="mt-2 font-black">Nothing here yet</h2><p className="mt-1 text-sm text-slate-500">Add a Costco, Aldi, Walmart, Ingles, or Save A Lot purchase above.</p></div>
        : <div className="grid gap-3 md:grid-cols-2">{visibleItems.map((item) => {
          const prices = item.priceHistory ?? [];
          const best = [...prices].sort((a, b) => unitPrice(a.price, a.packageSize) - unitPrice(b.price, b.packageSize))[0];
          const isStockUp = item.lastPrice !== null && item.stockUpPrice !== null && item.lastPrice <= item.stockUpPrice;
          const ratingText = RATINGS.find((option) => option.value === item.rating)?.label ?? "Haven’t tried";
          const search = new URL("https://www.google.com/search");
          search.searchParams.set("tbm", "shop");
          search.searchParams.set("q", `${item.name} price Costco Aldi Walmart Ingles Save A Lot Blairsville GA`);
          const step = 1;
          const isLow = item.quantity <= (item.lowAt ?? 1);
          const isListed = groceries.some((line) => line.pantryItemId === item.id);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const daysUntilExpiry = item.expirationDate ? Math.ceil((new Date(`${item.expirationDate}T00:00:00`).getTime() - today.getTime()) / 86400000) : null;
          return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-800">{item.category}</span><h2 className="mt-2 text-lg font-black">{item.name}</h2></div><button disabled={busy} onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button></div>
            <div className="mt-3 rounded-xl bg-[#f7f8fa] p-3"><div className="mb-2 flex items-center justify-between"><div className="text-[10px] font-black uppercase text-slate-500">On hand</div>{isLow && <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-700">Low / out</span>}</div><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xl font-black">{Math.round(item.quantity)} {item.quantity === 1 ? "package" : "packages"}</div><div className="flex gap-2"><button disabled={busy || item.quantity < step} onClick={() => void submit({ action: "adjust", itemId: item.id, delta: -step })} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-[#10254a] disabled:opacity-40">− Used 1</button><button disabled={busy} onClick={() => void submit({ action: "adjust", itemId: item.id, delta: step })} className="min-h-11 rounded-xl bg-[#10254a] px-3 text-xs font-black text-white">+ Add 1</button></div></div><p className="mt-2 text-[10px] font-medium text-slate-500">Typical package: {item.packageSize} {item.packageUnit}.</p><button disabled={busy || isListed} onClick={() => void submit({ action: "grocery-add", name: item.name })} className="mt-2 min-h-10 rounded-lg border border-amber-200 bg-white px-3 text-xs font-black text-amber-900 disabled:opacity-60">{isListed ? "✓ On grocery list" : "+ Add to grocery list"}</button></div>
            {(item.expirationDate || item.frozenAt) && <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">{item.expirationDate && <span className={`rounded-lg px-2.5 py-1.5 ${daysUntilExpiry !== null && daysUntilExpiry < 0 ? "bg-red-100 text-red-800" : daysUntilExpiry !== null && daysUntilExpiry <= 14 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{daysUntilExpiry !== null && daysUntilExpiry < 0 ? "Expired" : daysUntilExpiry !== null && daysUntilExpiry <= 14 ? "Use soon · " : "Expires · "}{item.expirationDate}</span>}{item.frozenAt && <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-800">❄ Frozen · {item.frozenAt}</span>}</div>}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-amber-50 p-2.5"><div className="font-bold text-slate-500">Last bought</div><div className="mt-0.5 font-black text-[#10254a]">{item.store}{item.lastPrice !== null ? ` • ${money(item.lastPrice)}/${item.packageSize}${item.packageUnit}` : ""}</div></div><div className="rounded-xl bg-amber-50 p-2.5"><div className="font-bold text-slate-500">Family verdict</div><div className="mt-0.5 font-black text-[#10254a]">{ratingText}</div></div></div>
            {item.stockUpPrice !== null && <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-black ${isStockUp ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{isStockUp ? "🎉 Stock-up price! " : "Stock up at "}{money(item.stockUpPrice)} or less per package{item.lastPrice !== null && ` • last paid ${money(item.lastPrice)}`}</p>}
            {best && <p className="mt-2 text-xs font-semibold text-slate-600">Best saved unit price: <span className="font-black">{money(unitPrice(best.price, best.packageSize))}/{best.packageUnit}</span> at {best.store}</p>}
            {item.notes && <p className="mt-2 text-xs text-slate-600">{item.notes}</p>}
            <a href={search.toString()} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-[#10254a]">Search current online prices ↗</a>
          </article>;
        })}</div>}

    {editing && <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 p-3 sm:items-center"><form onSubmit={async (e) => { e.preventDefault(); if (await submit({ action: "edit", itemId: editing.id, name: editing.name, category: editing.category, stockUpPrice: editing.stockUpPrice, lowAt: editing.lowAt, expirationDate: editing.expirationDate, frozenAt: editing.frozenAt, rating: editing.rating, notes: editing.notes })) setEditing(null); }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between"><h2 className="text-xl font-black">Edit {editing.name}</h2><button type="button" onClick={() => setEditing(null)} className="px-2 text-2xl">×</button></div><label className="mt-4 block text-xs font-bold text-slate-600">Food name<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Section<select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label><label className="mt-3 block text-xs font-bold text-slate-600">Mark low at this many packages<input type="number" min="0" step="1" value={editing.lowAt ?? 1} onChange={(e) => setEditing({ ...editing, lowAt: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Expires on<input type="date" value={editing.expirationDate ?? ""} onChange={(e) => setEditing({ ...editing, expirationDate: e.target.value || null })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Put in freezer<input type="date" value={editing.frozenAt ?? ""} onChange={(e) => setEditing({ ...editing, frozenAt: e.target.value || null })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Stock up at/below per package<input type="number" min="0" step="0.01" value={editing.stockUpPrice ?? ""} onChange={(e) => setEditing({ ...editing, stockUpPrice: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Family verdict<select value={editing.rating} onChange={(e) => setEditing({ ...editing, rating: e.target.value as Rating })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{RATINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="mt-3 block text-xs font-bold text-slate-600">Notes<input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><button disabled={busy} className="mt-4 w-full rounded-xl bg-[#10254a] px-4 py-3 text-sm font-black text-white">Save changes</button><button type="button" disabled={busy} onClick={async () => { if (window.confirm(`Remove ${editing.name} from the pantry?`) && await submit({ action: "delete", itemId: editing.id })) setEditing(null); }} className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-bold text-red-700">Remove item</button></form></div>}
  </section>;
}
