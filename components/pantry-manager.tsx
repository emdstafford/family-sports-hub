"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Rating = "not_tried" | "love" | "okay" | "no_thanks";
type PriceRow = { id: string; store: string; price: number; packageSize: number; packageUnit: string; purchasedAt: string; purchasedBy: string };
type PantryItem = {
  id: string; name: string; category: string; location?: string; quantity: number; unit: string; packageSize: number;
  lowAt: number;
  expirationDate: string | null; frozenAt: string | null;
  packageUnit: string; store: string; lastPrice: number | null; stockUpPrice: number | null; stockUpUnitPrice?: number | null;
  rating: Rating; notes: string; updatedAt: string; priceHistory: PriceRow[];
};
type GroceryLine = { id: string; name: string; pantryItemId: string | null; addedAt: string; addedBy: string };
type CanningBatch = { id: string; name: string; cannedAt: string; jarSize: string; jarsMade: number; jarsUsed: number; ingredients: { name: string; cost: number }[]; totalCost: number; costPerJar: number; notes?: string; needsCount?: boolean; costYield?: number; costUnknown?: boolean; lastUpdatedAt?: string; reminderBaselineAt?: string };
const LOCATIONS = ["Garage Deep Freezer", "Garage Fridge/Freezer", "Kitchen Fridge/Freezer", "Pantry", "Basement"];
const STORES = ["Costco", "Aldi", "Walmart", "Ingles", "Save A Lot", "Other"];
const CATEGORIES = ["Meat", "Freezer", "Canned Goods", "Pantry", "Fridge", "Paper Products", "Cleaning", "Laundry", "Personal Care", "Other"];
const RATINGS: { value: Rating; label: string }[] = [
  { value: "not_tried", label: "Haven’t tried" }, { value: "love", label: "Loved it" },
  { value: "okay", label: "It was okay" }, { value: "no_thanks", label: "Didn’t like" },
];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const unitPrice = (price: number, size: number) => size > 0 ? price / size : price;
function normalizedPrice(price: number, size: number, unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "lb") return { value: unitPrice(price, size), unit: "lb" };
  if (normalizedUnit === "oz") return { value: unitPrice(price, size) * 16, unit: "lb" };
  return { value: unitPrice(price, size), unit: normalizedUnit || "unit" };
}
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

function canningCountDue(batch: CanningBatch, now: Date) {
  if (batch.needsCount) return true;
  const recorded = batch.lastUpdatedAt ?? batch.reminderBaselineAt;
  if (!recorded) return false;
  const updated = new Date(recorded);
  if (!Number.isFinite(updated.getTime())) return false;
  // Compare calendar dates in the family’s timezone, clamping month ends.
  const localDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  };
  const date = localDate(updated);
  const endOfNextMonth = new Date(Date.UTC(date.year, date.month + 1, 0)).getUTCDate();
  const due = Date.UTC(date.year, date.month, Math.min(date.day, endOfNextMonth));
  const today = localDate(now);
  return Date.UTC(today.year, today.month - 1, today.day) >= due;
}

function FoodLocation({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const [adding, setAdding] = useState(false);
  return <label className="block text-xs font-bold text-slate-600">Storage location
    <select value={adding ? "__custom" : value} onChange={(event) => { if (event.target.value === "__custom") { setAdding(true); onChange(""); } else { setAdding(false); onChange(event.target.value); } }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">
      <option value="">Not recorded</option>{options.map((location) => <option key={location} value={location}>{location}</option>)}<option value="__custom">＋ Add another location</option>
    </select>
    {adding && <input autoFocus required maxLength={80} value={value} onChange={(event) => onChange(event.target.value)} aria-label="New storage location" placeholder="Name the location" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#10254a]" />}
  </label>;
}

export default function PantryManager({ playerId }: { playerId: string }) {
  const [reminderNow, setReminderNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setReminderNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  const [items, setItems] = useState<PantryItem[]>([]);
  const [groceries, setGroceries] = useState<GroceryLine[]>([]);
  const [usage, setUsage] = useState<{ batchId: string; name: string; jarSize: string; amount: number; usedAt: string }[]>([]);
  const [usageYear, setUsageYear] = useState(String(new Date().getFullYear()));
  const [canning, setCanning] = useState<CanningBatch[]>([]);
  const [canningName, setCanningName] = useState("");
  const [canningDate, setCanningDate] = useState(new Date().toISOString().slice(0, 10));
  const [jarSize, setJarSize] = useState("pint");
  const [jarsMade, setJarsMade] = useState("1");
  const [ingredientLines, setIngredientLines] = useState("");
  const [canningYear, setCanningYear] = useState("2025");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState<string[]>(LOCATIONS);
  const [locationFilter, setLocationFilter] = useState("All locations");
  const [category, setCategory] = useState("Meat");
  const [store, setStore] = useState("");
  const [packages, setPackages] = useState("1");
  const [packageSize, setPackageSize] = useState("1");
  const [packageUnit, setPackageUnit] = useState("lb");
  const [expirationDate, setExpirationDate] = useState("");
  const [frozenAt, setFrozenAt] = useState("");
  const [price, setPrice] = useState("");
  const [stockUpPrice, setStockUpPrice] = useState("");
  const [priceItemId, setPriceItemId] = useState<string | null>(null);
  const [compareStore, setCompareStore] = useState("Costco");
  const [compareOtherStore, setCompareOtherStore] = useState("");
  const [comparePrice, setComparePrice] = useState("");
  const [comparePackageSize, setComparePackageSize] = useState("1");
  const [comparePackageUnit, setComparePackageUnit] = useState("lb");
  const [rating, setRating] = useState<Rating>("not_tried");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("All");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [inventoryOpen]);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [groceryName, setGroceryName] = useState("");
  const [tagCopied, setTagCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const imported = await fetch("/api/pantry", { method: "POST", headers: pantryHeaders(), body: JSON.stringify({ playerId, action: "canning-import-2025" }) });
      if (!imported.ok) { const result = await responseJson(imported); throw new Error(result.error ?? "Could not import canning notes."); }
      const response = await fetch(`/api/pantry?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: pantryHeaders() });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error ?? "Could not load pantry items.");
      setItems(Array.isArray(data.items) ? data.items : []);
      setLocations([...new Set([...LOCATIONS, ...(Array.isArray(data.locations) ? data.locations : []), ...(Array.isArray(data.items) ? data.items.map((item: PantryItem) => item.location).filter(Boolean) : [])])] as string[]);
      setGroceries(Array.isArray(data.groceries) ? data.groceries : []);
      setCanning(Array.isArray(data.canning) ? data.canning : []);
      setUsage(Array.isArray(data.canningUsage) ? data.canningUsage : []);
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
    const ok = await submit({ action: "purchase", name, category, location, store, packages: Number(packages), packageSize: Number(packageSize), packageUnit, expirationDate: expirationDate || null, frozenAt: frozenAt || null, price: price ? Number(price) : null, stockUpUnitPrice: stockUpPrice ? Number(stockUpPrice) : null, rating, notes });
    if (ok) { setName(""); setPackages("1"); setPrice(""); setStockUpPrice(""); setRating("not_tried"); setNotes(""); setStore(""); setExpirationDate(""); setFrozenAt(""); setFormOpen(false); setLocation(""); }
  }
  async function addCanningBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredients = ingredientLines.split("\n").map((line) => {
      const splitAt = line.lastIndexOf(",");
      return splitAt < 0 ? null : { name: line.slice(0, splitAt).trim(), cost: Number(line.slice(splitAt + 1).replace(/[$\s]/g, "")) };
    }).filter((entry): entry is { name: string; cost: number } => Boolean(entry?.name) && Number.isFinite(entry?.cost) && entry!.cost >= 0);
    if (!ingredients.length) { setError("Add at least one ingredient as: Ingredient name, cost"); return; }
    const ok = await submit({ action: "canning-add", name: canningName, cannedAt: canningDate, jarSize, jarsMade: Number(jarsMade), ingredients });
    if (ok) { setCanningName(""); setJarsMade("1"); setIngredientLines(""); }
  }
  function chooseCommonFood(food: string) {
    setName(food); setCategory("Meat"); setPackageUnit("lb"); setPackageSize("1"); setPackages("1"); setFormOpen(true);
    window.setTimeout(() => document.getElementById("pantry-food-name")?.focus(), 0);
  }
  async function copyNfcLink(item: PantryItem) {
    const url = new URL("/pantry/use", window.location.origin);
    url.searchParams.set("item", item.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setTagCopied(item.id);
      window.setTimeout(() => setTagCopied(null), 2500);
    } catch {
      window.prompt("Copy this link into your NFC tag setup:", url.toString());
    }
  }
  const visibleItems = useMemo(() => items.filter((item) => (filter === "All" || item.category === filter) && (locationFilter === "All locations" || (locationFilter === "Not recorded" ? !item.location : item.location === locationFilter))), [items, filter, locationFilter]);
  const lowStockCount = items.filter((item) => item.quantity <= (item.lowAt ?? 1)).length;
  const canningYears = [...new Set([String(new Date().getFullYear()), ...canning.map((batch) => batch.cannedAt.slice(0, 4))])].sort().reverse();
  const yearBatches = canning.filter((batch) => batch.cannedAt.startsWith(canningYear));
  const yearlyStats = yearBatches.reduce((summary, batch) => {
    const key = `${batch.name} · ${batch.jarSize}`;
    const row = summary[key] ?? { made: 0, used: 0, batches: 0 };
    row.made += batch.jarsMade; row.used += batch.jarsUsed; row.batches += 1; summary[key] = row;
    return summary;
  }, {} as Record<string, { made: number; used: number; batches: number }>);

  const eatingYears = [...new Set([String(new Date().getFullYear()), ...usage.map((entry) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" }).format(new Date(entry.usedAt)))])].sort().reverse();
  const eatenByFood = usage.filter((entry) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" }).format(new Date(entry.usedAt)) === usageYear).reduce((summary, entry) => {
    const key = `${entry.name} · ${entry.jarSize}`;
    summary[key] = (summary[key] ?? 0) + entry.amount;
    return summary;
  }, {} as Record<string, number>);

  return <section className="fambam-light-forms mx-auto max-w-5xl px-3 py-4">
    {inventoryOpen ? <div className="mb-4"><button type="button" onClick={() => setInventoryOpen(false)} className="mb-2 min-h-11 text-sm font-black text-blue-800">← Back to Food</button><div className="flex items-center justify-between gap-2"><h1 className="text-2xl font-black text-[#10254a]">Inventory</h1><button type="button" onClick={() => { setInventoryOpen(false); setName(""); setFormOpen(true); }} className="min-h-11 rounded-xl bg-[#10254a] px-3 text-xs font-black text-white">＋ Add food</button></div></div> : (
    <header className="mb-4 rounded-3xl bg-[#06284a] p-5 text-white shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.22em] text-[#f3c64f]">FamBam Hub</div>
      <h1 className="mt-1 text-3xl font-black">🧺 Food & Household</h1>
      <p className="mt-2 text-sm font-semibold text-blue-100">Food, household supplies, groceries & canning.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-white/10 px-3 py-1.5">{items.length} items tracked</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5">{lowStockCount} low / out</span>
      </div>
    </header>
    )}

    {!inventoryOpen && <>
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
      <p className="mb-3 text-xs font-medium text-slate-500">Choose food or household supplies.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {["Chicken breast", "Chicken thighs", "Hamburger meat", "Bacon", "Hot dogs", "Other food"].map((food) => <button key={food} type="button" onClick={() => { if (food === "Other food") { setName(""); setCategory("Pantry"); setPackageUnit("count"); setPackageSize("1"); setFormOpen(true); } else chooseCommonFood(food); }} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-[#10254a] active:bg-blue-50">＋ {food}</button>)}
        {[["Toilet paper", "Paper Products"], ["Paper towels", "Paper Products"], ["Hand soap", "Personal Care"], ["Dishwasher detergent", "Cleaning"], ["Laundry detergent", "Laundry"], ["Other household item", "Cleaning"]].map(([itemName, itemCategory]) => <button key={itemName} type="button" onClick={() => { setName(itemName === "Other household item" ? "" : itemName); setCategory(itemCategory); setPackageUnit("count"); setPackageSize("1"); setPackages("1"); setFormOpen(true); window.setTimeout(() => document.getElementById("pantry-food-name")?.focus(), 0); }} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-[#10254a] active:bg-blue-50">＋ {itemName}</button>)
        }

      </div>
    </div>

    </>}
    {formOpen && <form onSubmit={addPurchase} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2"><div><h2 className="text-lg font-black">Add an item / record a purchase</h2><p className="text-xs font-medium text-slate-500">Price and store are optional. Package size lets the app compare unit prices.</p></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Close form" className="rounded-lg bg-slate-100 px-3 py-1 text-xl font-bold">×</button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-2">Item name<input id="pantry-food-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ground beef" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Section<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <FoodLocation value={location} options={locations} onChange={setLocation} />
        <label className="text-xs font-bold text-slate-600">Packages bought<input required min="1" step="1" type="number" value={packages} onChange={(e) => setPackages(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Amount per package<input required min="0.01" step="0.01" type="number" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Measured in<select value={packageUnit} onChange={(e) => setPackageUnit(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">{["lb", "oz", "count", "each", "bags", "boxes"].map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Expires on (optional)<input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Put in freezer (optional)<input type="date" value={frozenAt} onChange={(e) => setFrozenAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]" /></label>
      </div>
      <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><summary className="cursor-pointer text-xs font-black text-slate-600">Optional: store, price, and family rating</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">Store<select value={store} onChange={(e) => setStore(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]"><option value="">Don’t record</option>{STORES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Price per package<input min="0" step="0.01" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
        <label className="text-xs font-bold text-slate-600">Stock up at/below<input min="0" step="0.01" type="number" value={stockUpPrice} onChange={(e) => setStockUpPrice(e.target.value)} placeholder={`$ / ${category === "Meat" ? "lb" : packageUnit}`} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /><span className="mt-1 block text-[10px] font-medium text-slate-500">{category === "Meat" ? "Set your target price per pound." : `Set your target price per ${packageUnit}.`}</span></label>
        <label className="text-xs font-bold text-slate-600">Family verdict<select value={rating} onChange={(e) => setRating(e.target.value as Rating)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm text-[#10254a]">{RATINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-3">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Good for tacos; family favorite" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#10254a]" /></label>
      </div>
      </details>
      <button disabled={busy} className="mt-3 w-full rounded-xl bg-[#10254a] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save item and quantity"}</button>
    </form>}

    {error && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    {!inventoryOpen && <button type="button" onClick={() => { setInventoryOpen(true); setFormOpen(false); }} className="mb-4 flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"><span><span className="block text-base font-black text-[#10254a]">🧊 Inventory</span><span className="mt-1 block text-xs font-semibold text-slate-500">{items.length} foods · {lowStockCount} low / out</span></span><span className="text-sm font-black text-blue-800">Open →</span></button>}
    {inventoryOpen && <>
    <h2 className="mb-2 text-lg font-black text-[#10254a]">Your inventory</h2>
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{["All", ...CATEGORIES].map((option) => <button key={option} onClick={() => setFilter(option)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${filter === option ? "bg-[#10254a] text-white" : "bg-white text-slate-600 shadow-sm"}`}>{option}</button>)}</div>

    <label className="mb-3 block text-xs font-bold text-slate-600">Show storage location<select aria-label="Filter food by storage location" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#10254a]">{["All locations", ...locations, "Not recorded"].map((value) => <option key={value}>{value}</option>)}</select></label>

    {loading ? <p className="rounded-2xl bg-white p-5 text-center text-sm font-semibold text-slate-500">Loading your food list…</p>
      : visibleItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><div className="text-3xl">🧊</div><h2 className="mt-2 font-black">Nothing here yet</h2><p className="mt-1 text-sm text-slate-500">Add a Costco, Aldi, Walmart, Ingles, or Save A Lot purchase above.</p></div>
        : <div className="grid gap-3 md:grid-cols-2">{visibleItems.map((item) => {
          const prices = item.priceHistory ?? [];
          const comparablePrices = prices.map((entry) => ({ ...entry, normalized: normalizedPrice(entry.price, entry.packageSize, entry.packageUnit) }));
          const primaryUnit = item.category === "Meat" || item.packageUnit === "lb" || item.packageUnit === "oz" ? "lb" : item.packageUnit.toLowerCase();
          const comparable = comparablePrices.filter((entry) => entry.normalized.unit === primaryUnit);
          const best = [...comparable].sort((a, b) => a.normalized.value - b.normalized.value)[0];
          const stockUpUnitPrice = item.stockUpUnitPrice ?? (item.stockUpPrice != null ? normalizedPrice(item.stockUpPrice, item.packageSize, item.packageUnit).value : null);
          const lastNormalized = item.lastPrice !== null ? normalizedPrice(item.lastPrice, item.packageSize, item.packageUnit) : null;
          const isStockUp = lastNormalized !== null && stockUpUnitPrice !== null && lastNormalized.value <= stockUpUnitPrice;
          const ratingText = RATINGS.find((option) => option.value === item.rating)?.label ?? "Haven’t tried";
          const step = 1;
          const isLow = item.quantity <= (item.lowAt ?? 1);
          const isListed = groceries.some((line) => line.pantryItemId === item.id);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const daysUntilExpiry = item.expirationDate ? Math.ceil((new Date(`${item.expirationDate}T00:00:00`).getTime() - today.getTime()) / 86400000) : null;
          const weightUnit = item.packageUnit === "lb" || item.packageUnit === "oz";
          const totalWeight = item.quantity * item.packageSize;
          const quantityLabel = weightUnit
            ? `${totalWeight.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${item.packageUnit} left`
            : `${item.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${item.quantity === 1 ? "package" : "packages"}`;
          return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-800">{item.category}</span><h2 className="mt-2 text-lg font-black">{item.name}</h2></div><button disabled={busy} onClick={() => setEditing({ ...item, stockUpUnitPrice: item.stockUpUnitPrice ?? (item.stockUpPrice != null ? normalizedPrice(item.stockUpPrice, item.packageSize, item.packageUnit).value : null) })} aria-label={`Edit ${item.name}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button></div>
            <div className="mt-3 rounded-xl bg-[#f7f8fa] p-3"><div className="mb-2 flex items-center justify-between"><div className="text-[10px] font-black uppercase text-slate-500">On hand</div>{isLow && <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-700">Low / out</span>}</div><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xl font-black">{quantityLabel}</div>{["count", "each"].includes(item.packageUnit) && <p className="mt-1 text-sm font-bold text-[#10254a]">{(Math.round(item.quantity * item.packageSize * 10000) / 10000).toLocaleString("en-US")} individual items</p>}</div><div className="flex gap-2"><button disabled={busy || item.quantity < step} onClick={() => void submit({ action: "adjust", itemId: item.id, delta: -step })} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-[#10254a] disabled:opacity-40">− Used 1 package</button><button disabled={busy} onClick={() => void submit({ action: "adjust", itemId: item.id, delta: step })} className="min-h-11 rounded-xl bg-[#10254a] px-3 text-xs font-black text-white">+ Add 1 package</button></div></div>{["count", "each"].includes(item.packageUnit) && item.packageSize > 1 && <button disabled={busy || item.quantity * item.packageSize < 0.9999} onClick={() => void submit({ action: "use", itemId: item.id, amount: 1, quantityUnit: "count" })} className="mt-2 min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-[#10254a] disabled:opacity-40">− Used 1 item</button>} <p className="mt-2 text-[10px] font-medium text-slate-500">Typical package: {item.packageSize} {item.packageUnit}.</p><button disabled={busy || isListed} onClick={() => void submit({ action: "grocery-add", name: item.name })} className="mt-2 min-h-10 rounded-lg border border-amber-200 bg-white px-3 text-xs font-black text-amber-900 disabled:opacity-60">{isListed ? "✓ On grocery list" : "+ Add to grocery list"}</button></div>
            {(item.expirationDate || item.frozenAt) && <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">{item.expirationDate && <span className={`rounded-lg px-2.5 py-1.5 ${daysUntilExpiry !== null && daysUntilExpiry < 0 ? "bg-red-100 text-red-800" : daysUntilExpiry !== null && daysUntilExpiry <= 14 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{daysUntilExpiry !== null && daysUntilExpiry < 0 ? "Expired" : daysUntilExpiry !== null && daysUntilExpiry <= 14 ? "Use soon · " : "Expires · "}{item.expirationDate}</span>}{item.frozenAt && <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-800">❄ Frozen · {item.frozenAt}</span>}</div>}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-amber-50 p-2.5"><div className="font-bold text-slate-500">Last bought</div><div className="mt-0.5 font-black text-[#10254a]">{item.store}{item.lastPrice !== null ? ` • ${money(item.lastPrice)}/${item.packageSize}${item.packageUnit}` : ""}</div></div><div className="rounded-xl bg-amber-50 p-2.5"><div className="font-bold text-slate-500">Family verdict</div><div className="mt-0.5 font-black text-[#10254a]">{ratingText}</div></div></div>
            {stockUpUnitPrice !== null && <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-black ${isStockUp ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{isStockUp ? "🎉 Stock-up price! " : "Stock up at "}{money(stockUpUnitPrice)} or less per {primaryUnit}{lastNormalized && ` • last paid ${money(lastNormalized.value)}/${lastNormalized.unit}`}</p>}
            {best && <p className="mt-2 text-xs font-semibold text-slate-600">Best tracked deal: <span className="font-black">{money(best.normalized.value)}/{best.normalized.unit}</span> at <span className="font-black">{best.store}</span></p>}
            <p className="mt-2 text-sm font-semibold text-slate-600">📍 {item.location || "Location not recorded"}</p>
            {item.notes && <p className="mt-2 text-xs text-slate-600">{item.notes}</p>}
            <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary onClick={() => { if (priceItemId !== item.id) { setPriceItemId(item.id); setCompareStore("Costco"); setCompareOtherStore(""); setComparePrice(""); setComparePackageSize(String(item.packageSize || 1)); setComparePackageUnit(item.packageUnit || "lb"); } }} className="cursor-pointer text-sm font-black text-[#10254a]">Compare prices in FamBam ({prices.length})</summary>
              <p className="mt-2 text-xs text-slate-600">Family-entered prices from receipts or shelf labels. FamBam shows the package math and best recorded deal; these aren’t live store quotes.</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">For meat, price per pound = package price ÷ pounds in the package. Ounces convert at 16 oz = 1 lb.</p>
              {prices.length > 0 ? <div className="mt-3 overflow-x-auto rounded-lg bg-white"><table className="w-full min-w-[460px] text-left text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="px-2 py-2">Store / date</th><th className="px-2 py-2">Package</th><th className="px-2 py-2">Total</th><th className="px-2 py-2">Unit price</th></tr></thead><tbody>{[...comparablePrices].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)).map((entry) => <tr key={entry.id} className="border-t border-slate-100"><td className="px-2 py-2 font-bold text-[#10254a]">{entry.store}<span className="block font-medium text-slate-500">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(entry.purchasedAt))} · {entry.purchasedBy}</span></td><td className="px-2 py-2">{entry.packageSize} {entry.packageUnit}</td><td className="px-2 py-2 font-bold">{money(entry.price)}</td><td className="px-2 py-2 font-black">{money(entry.normalized.value)}/{entry.normalized.unit}</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-lg bg-white p-3 text-xs font-medium text-slate-500">No prices recorded yet. Add the price you see at a store and FamBam will calculate the unit price.</p>}
              <form onSubmit={async (event) => { event.preventDefault(); if (!comparePrice || Number(comparePrice) < 0) return; const storeName = compareStore === "Other" ? compareOtherStore.trim() || "Other" : compareStore; if (await submit({ action: "price-record", itemId: item.id, store: storeName, price: Number(comparePrice), packageSize: Number(comparePackageSize), packageUnit: comparePackageUnit })) { setComparePrice(""); setPriceItemId(null); } }} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-7">
                <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-1">Store<select value={priceItemId === item.id ? compareStore : "Costco"} onChange={(event) => { setPriceItemId(item.id); setCompareStore(event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm text-[#10254a]">{STORES.map((option) => <option key={option}>{option}</option>)}</select></label>
                {compareStore === "Other" && priceItemId === item.id && <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-2">Store name<input value={compareOtherStore} onChange={(event) => setCompareOtherStore(event.target.value)} placeholder="Enter store name" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2.5 text-sm text-[#10254a]" /></label>}
                <label className="text-xs font-bold text-slate-600">Price<input required min="0.01" step="0.01" type="number" value={priceItemId === item.id ? comparePrice : ""} onChange={(event) => { setPriceItemId(item.id); setComparePrice(event.target.value); }} placeholder="$" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2.5 text-sm text-[#10254a]" /></label>
                <label className="text-xs font-bold text-slate-600">Package size<input required min="0.01" step="0.01" type="number" value={priceItemId === item.id ? comparePackageSize : String(item.packageSize || 1)} onChange={(event) => { setPriceItemId(item.id); setComparePackageSize(event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2.5 text-sm text-[#10254a]" /></label>
                <label className="text-xs font-bold text-slate-600">Unit<select value={priceItemId === item.id ? comparePackageUnit : item.packageUnit || "lb"} onChange={(event) => { setPriceItemId(item.id); setComparePackageUnit(event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm text-[#10254a]">{["lb", "oz", "count", "each", "bags", "boxes"].map((option) => <option key={option}>{option}</option>)}</select></label>
                <button disabled={busy || !comparePrice || Number(comparePackageSize) <= 0} className="col-span-2 min-h-10 self-end rounded-lg bg-[#10254a] px-3 py-2 text-xs font-black text-white disabled:opacity-50 sm:col-span-1">{busy ? "Saving…" : "Save price"}</button>
              </form>
              {best && <p className="mt-2 text-[11px] font-semibold text-slate-500">Best deal is calculated from {comparable.length} recorded {comparable.length === 1 ? "price" : "prices"} with comparable units.</p>}
            </details>
            <button type="button" onClick={() => void copyNfcLink(item)} className="ml-2 mt-3 inline-flex rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-900">{tagCopied === item.id ? "NFC link copied ✓" : "Set up NFC tag"}</button>
          </article>;
        })}</div>}

    </>}

    {!inventoryOpen && <>
    <details className="mb-4 mt-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer list-none text-lg font-black text-[#10254a]">🫙 Canning <span className="text-sm font-semibold text-slate-500">· {canning.length} batches</span></summary>
      <details className="mt-3 rounded-xl border border-emerald-200 p-3"><summary className="cursor-pointer text-sm font-bold text-[#10254a]">＋ Add a canning batch</summary>
      <form onSubmit={addCanningBatch} className="mt-3 rounded-xl bg-emerald-50 p-3">
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="col-span-2 text-xs font-bold text-slate-600 sm:col-span-1">What did you can?<input required value={canningName} onChange={(event) => setCanningName(event.target.value)} placeholder="Green beans" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-bold text-slate-600">Date canned<input required type="date" value={canningDate} onChange={(event) => setCanningDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm" /></label>
          <label className="text-xs font-bold text-slate-600">Jar size<select value={jarSize} onChange={(event) => setJarSize(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm">{["half-pint", "pint", "quart", "half-gallon", "gallon", "other"].map((size) => <option key={size}>{size}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Jars made<input required min="1" step="1" type="number" value={jarsMade} onChange={(event) => setJarsMade(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" /></label>
        </div>
        <label className="mt-2 block text-xs font-bold text-slate-600">Ingredients and cost for this batch <span className="font-medium">(one per line: ingredient, cost)</span><textarea required rows={3} value={ingredientLines} onChange={(event) => setIngredientLines(event.target.value)} placeholder={"Green beans, 12.00\nVinegar, 2.49\nSalt, 0.25"} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" /></label>
        <button disabled={busy} className="mt-2 min-h-11 rounded-lg bg-[#10254a] px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save batch & calculate cost per jar"}</button>
      </form></details>

      <div className="mt-3 flex items-center justify-between gap-2"><h3 className="text-sm font-black text-[#10254a]">Yearly totals</h3><select aria-label="Canning year" value={canningYear} onChange={(event) => setCanningYear(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold">{canningYears.map((year) => <option key={year}>{year}</option>)}</select></div>
      {Object.keys(yearlyStats).length > 0 ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(yearlyStats).map(([product, stats]) => {
        const batches = yearBatches.filter((batch) => `${batch.name} · ${batch.jarSize}` === product);
        const nextBatch = [...batches].sort((a, b) => a.cannedAt.localeCompare(b.cannedAt)).find((batch) => batch.jarsUsed < batch.jarsMade);
        const countDue = batches.some((batch) => canningCountDue(batch, reminderNow));
        return <article key={product} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-[#10254a]">{product}</p>{countDue && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{batches.some((batch) => batch.needsCount) ? "Needs updating" : "Check count · 1 month"}</span>}</div>
          <p className="mt-1 text-sm text-slate-600">{stats.made} jars canned · {stats.used} used · {stats.made - stats.used} remaining · {stats.batches} {stats.batches === 1 ? "batch" : "batches"}</p>
          <div className="mt-2 flex flex-wrap items-start gap-2"><button type="button" disabled={busy || !nextBatch} onClick={() => { if (nextBatch) void submit({ action: "canning-use", batchId: nextBatch.id, amount: 1 }); }} className="min-h-11 rounded-lg bg-emerald-100 px-3 text-sm font-black text-emerald-900 disabled:opacity-50">Ate 1 jar</button>
          <details className="min-w-0 flex-1"><summary className={`flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-bold ${countDue ? "bg-amber-100 text-amber-900" : "text-slate-500"}`}>{countDue ? "Update count" : "Edit count"}</summary>{batches.map((batch) => <form key={batch.id} className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (event) => { event.preventDefault(); const remaining = Number(new FormData(event.currentTarget).get("remaining")); const editor = event.currentTarget.closest("details"); if (await submit({ action: "canning-count", batchId: batch.id, remaining }) && editor) editor.open = false; }}>
            <label className="text-xs font-bold text-slate-600">{batches.length > 1 ? `Jars left · ${batch.cannedAt}` : "Jars left"}<input key={`${batch.id}-${batch.jarsUsed}`} name="remaining" aria-label={`Jars of ${batch.name} left${batches.length > 1 ? ` from ${batch.cannedAt}` : ""}`} type="number" min="0" max={batch.jarsMade} step="1" required defaultValue={batch.jarsMade - batch.jarsUsed} className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-[#10254a]" /></label>
            <button disabled={busy} className="min-h-10 rounded-lg bg-[#10254a] px-3 text-xs font-black text-white disabled:opacity-50">Save count</button>
          </form>)}</details></div>
        </article>;
      })}</div> : <p className="mt-2 text-sm text-slate-500">No batches recorded for {canningYear} yet.</p>}
      <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><summary className="cursor-pointer text-sm font-bold text-[#10254a]">Yearly eating & canning plan</summary>
        <div className="flex items-center justify-between gap-2"><h3 className="font-black text-[#10254a]">Eaten this year</h3><select aria-label="Year eaten" value={usageYear} onChange={(event) => setUsageYear(event.target.value)} className="rounded-lg border border-slate-300 bg-white p-2 text-sm">{eatingYears.map((year) => <option key={year}>{year}</option>)}</select></div>
        <p className="mt-1 text-xs text-slate-600">Tap “Ate 1 jar” when you eat one. Counts follow the year eaten, including jars canned in earlier years. Shelf-count corrections and old notes aren’t assigned to a consumption year.</p>
        {Object.entries(eatenByFood).length ? <ul className="mt-2 space-y-2">{Object.entries(eatenByFood).map(([key, amount]) => {
          const remaining = canning.filter((batch) => `${batch.name} · ${batch.jarSize}` === key).reduce((total, batch) => total + batch.jarsMade - batch.jarsUsed, 0);
          return <li key={key} className="rounded-lg bg-white p-2 text-sm text-[#10254a]"><b>{key}</b><p>{amount} eaten in {usageYear} · {remaining} left</p><p className="text-xs text-slate-600">To cover that same recorded amount again: can {Math.max(0, amount - remaining)} more. {usageYear === String(new Date().getFullYear()) ? "This year is still in progress." : "Based on recorded use only."} {canning.some((batch) => `${batch.name} · ${batch.jarSize}` === key && batch.needsCount) ? "Check remaining counts first." : ""}</p></li>;
        })}</ul> : <p className="mt-2 text-sm text-slate-600">No dated meals recorded for {usageYear} yet. Your earlier used totals stay in the yearly totals.</p>}
      </details>
      {yearBatches.length > 0 && <details className="mt-3 rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-bold text-[#10254a]">Ingredient costs & batch notes</summary>
        <div className="mt-3 space-y-2">{yearBatches.map((batch) => <article key={batch.id} className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 p-3"><div>
          <p className="font-bold text-[#10254a]">{batch.name} · {batch.jarSize} · {batch.cannedAt}</p>
          <p className="text-xs text-slate-600">{batch.costUnknown ? "Cost not recorded" : <>${batch.totalCost.toFixed(2)} ingredient cost ÷ {batch.costYield ?? batch.jarsMade} jars = <b>${batch.costPerJar.toFixed(2)} per jar</b></>}</p>
          <p className="text-xs text-slate-500">{batch.ingredients.map((ingredient) => `${ingredient.name} $${ingredient.cost.toFixed(2)}`).join(" · ")}</p>
          {batch.notes && <p className="mt-1 max-w-xl text-xs text-slate-500">{batch.notes}</p>}
        </div><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete the ${batch.name} batch?`)) void submit({ action: "canning-delete", batchId: batch.id }); }} aria-label={`Delete ${batch.name} batch`} className="min-h-10 rounded-lg px-2 text-lg font-black text-slate-400">×</button></article>)}</div>
      </details>}

    </details>


    </>}

    {editing && <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 p-3 sm:items-center"><form onSubmit={async (e) => { e.preventDefault(); if (await submit({ action: "edit", itemId: editing.id, quantity: editing.quantity, packageSize: editing.packageSize, packageUnit: editing.packageUnit, name: editing.name, category: editing.category, location: editing.location ?? "", stockUpUnitPrice: editing.stockUpUnitPrice, lowAt: editing.lowAt, expirationDate: editing.expirationDate, frozenAt: editing.frozenAt, rating: editing.rating, notes: editing.notes })) setEditing(null); }} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between"><h2 className="text-xl font-black">Edit {editing.name}</h2><button type="button" onClick={() => setEditing(null)} className="px-2 text-2xl">×</button></div><label className="mt-4 block text-xs font-bold text-slate-600">Food name<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Section<select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label><div className="mt-3"><FoodLocation value={editing.location ?? ""} options={locations} onChange={(location) => setEditing({ ...editing, location })} /></div><div className="mt-3 rounded-xl bg-slate-50 p-3"><label className="block text-xs font-bold text-slate-600">Packages on hand<input required type="number" min="0" step="any" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Amount in each full package<input required type="number" min="0.0001" step="any" value={editing.packageSize} onChange={(e) => setEditing({ ...editing, packageSize: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Package unit<select value={editing.packageUnit} onChange={(e) => setEditing({ ...editing, packageUnit: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">{[...new Set(["count", "each", "lb", "oz", "bags", "boxes", editing.packageUnit])].map((unit) => <option key={unit}>{unit}</option>)}</select></label>{["count", "each"].includes(editing.packageUnit) && editing.packageSize > 0 && <label className="mt-3 block text-xs font-bold text-slate-600">Individual items on hand<input required type="number" min="0" step="1" value={Math.round(editing.quantity * editing.packageSize * 10000) / 10000} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) / editing.packageSize })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>}<p className="mt-2 text-xs text-slate-500">Example: 1 package × 4 count = 4 pizzas. Saving replaces the count; it does not add a purchase.</p></div><label className="mt-3 block text-xs font-bold text-slate-600">Mark low at this many packages<input type="number" min="0" step="1" value={editing.lowAt ?? 1} onChange={(e) => setEditing({ ...editing, lowAt: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Expires on<input type="date" value={editing.expirationDate ?? ""} onChange={(e) => setEditing({ ...editing, expirationDate: e.target.value || null })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Put in freezer<input type="date" value={editing.frozenAt ?? ""} onChange={(e) => setEditing({ ...editing, frozenAt: e.target.value || null })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Stock-up target ($ per {editing.category === "Meat" || editing.packageUnit === "lb" || editing.packageUnit === "oz" ? "lb" : editing.packageUnit})<input type="number" min="0" step="0.01" value={editing.stockUpUnitPrice ?? ""} onChange={(e) => setEditing({ ...editing, stockUpUnitPrice: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-bold text-slate-600">Family verdict<select value={editing.rating} onChange={(e) => setEditing({ ...editing, rating: e.target.value as Rating })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{RATINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="mt-3 block text-xs font-bold text-slate-600">Notes<input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><button disabled={busy} className="mt-4 w-full rounded-xl bg-[#10254a] px-4 py-3 text-sm font-black text-white">Save changes</button><button type="button" disabled={busy} onClick={async () => { if (window.confirm(`Remove ${editing.name} from the pantry?`) && await submit({ action: "delete", itemId: editing.id })) setEditing(null); }} className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-bold text-red-700">Remove item</button></form></div>}
  </section>;
}
