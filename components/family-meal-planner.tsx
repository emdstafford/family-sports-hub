"use client";

import { useEffect, useState } from "react";

type PlayerOption = { id: string; display_name: string };
type DayPlan = {
  date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  dinnerSides: string;
};
type PantryItem = { id: string; name: string; category: string; quantity: number; unit: string; packageSize: number; packageUnit: string };
type OptionKind = "breakfast" | "lunch" | "dinner" | "sides";
type CustomMealOptions = Record<OptionKind, string[]>;

const MEAL_OPTIONS = {
  breakfast: ["Cereal", "Waffles", "Pancakes", "Biscuits", "Sausage rolls", "Yogurt", "Eggs", "Toast", "Oatmeal", "Breakfast sandwiches", "Breakfast burritos", "French toast", "Bagels", "Muffins", "Smoothies", "Fruit and yogurt"],
  lunch: ["Leftovers", "Sandwiches", "Wraps", "Quesadillas", "Grilled cheese", "Soup", "Salad", "Chicken nuggets", "Mac and cheese", "Snack plate", "Hot dogs", "Chicken salad", "Tuna salad"],
  dinner: ["Chicken breast", "Chicken thighs", "Baked chicken", "Grilled chicken", "Chicken tacos", "Chicken pasta", "Chicken stir-fry", "Steak", "Steak and potatoes", "Steak fajitas", "Ground beef tacos", "Ground turkey tacos", "Burgers", "Spaghetti with meat sauce", "Meatloaf", "Sloppy joes", "Chili", "Meatballs", "Beef or turkey stir-fry", "Crockpot meal", "Pizza", "Italian dinner", "Breakfast for dinner", "Loaded baked potatoes", "Black bean quesadillas", "Veggie fried rice", "Grilled cheese and tomato soup"],
  sides: ["Rice", "Mashed potatoes", "Baked potatoes", "Green beans", "Corn", "Peas", "Carrots", "Broccoli", "Side salad", "Dinner rolls", "Mac and cheese", "Fruit", "Fries", "Roasted vegetables", "Canned vegetables", "Beans", "Applesauce", "Coleslaw"],
} as const;

type MealKind = keyof typeof MEAL_OPTIONS;

function MealPicker({ kind, value, options, onChange, onAddOption }: { kind: MealKind; value: string; options: string[]; onChange: (value: string) => void; onAddOption: (kind: OptionKind, value: string) => Promise<boolean> }) {
  const [customMode, setCustomMode] = useState(false);
  const [savingOption, setSavingOption] = useState(false);
  const isCustom = customMode || (value !== "" && !options.includes(value));

  async function saveCustomOption() {
    const option = value.trim();
    if (!option) return;
    setSavingOption(true);
    const saved = await onAddOption(kind, option);
    if (saved) { onChange(option); setCustomMode(false); }
    setSavingOption(false);
  }

  return <>
    <select value={isCustom ? "__custom" : value} onChange={(event) => {
      if (event.target.value === "__custom") {
        setCustomMode(true);
        onChange("");
      } else {
        setCustomMode(false);
        onChange(event.target.value);
      }
    }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-medium text-[#10254a]">
      <option value="">Choose an idea…</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
      <option value="__custom">Add a different meal…</option>
    </select>
    {isCustom && <><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} maxLength={120} placeholder="Type your meal idea" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-medium text-[#10254a]" /><button type="button" onClick={() => void saveCustomOption()} disabled={!value.trim() || savingOption} className="mt-2 min-h-10 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-900 disabled:opacity-50">{savingOption ? "Adding…" : "Add to choices"}</button></>}
  </>;
}

function SidePicker({ value, options, onChange, onAddOption }: { value: string; options: string[]; onChange: (value: string) => void; onAddOption: (kind: OptionKind, value: string) => Promise<boolean> }) {
  const selected = value ? value.split(",").map((side) => side.trim()).filter(Boolean) : [];
  const [customSide, setCustomSide] = useState("");
  function toggle(side: string) {
    const next = selected.includes(side) ? selected.filter((item) => item !== side) : [...selected, side];
    onChange(next.join(", "));
  }
  async function addCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const side = customSide.trim();
    if (!side || selected.some((item) => item.toLowerCase() === side.toLowerCase())) return;
    if (!(await onAddOption("sides", side))) return;
    onChange([...selected, side].join(", "));
    setCustomSide("");
  }
  return <details className="relative mt-2">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#10254a] [&::-webkit-details-marker]:hidden">
      <span className="truncate">{selected.length ? `${selected.length} selected: ${selected.join(", ")}` : "Choose sides…"}</span>
      <span aria-hidden="true" className="ml-2 shrink-0">⌄</span>
    </summary>
    <div className="mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-md">
      <p className="mb-1 px-2 text-xs font-medium text-slate-500">Check all that apply.</p>
      <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">{options.map((side) => <label key={side} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-[#10254a] hover:bg-slate-50">
        <input type="checkbox" checked={selected.includes(side)} onChange={() => toggle(side)} className="h-4 w-4 accent-emerald-800" />{side}
      </label>)}</div>
      <form onSubmit={addCustom} className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
        <input value={customSide} onChange={(event) => setCustomSide(event.target.value)} maxLength={60} placeholder="Add another side" aria-label="Custom dinner side" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm font-medium text-[#10254a]" />
        <button type="submit" disabled={!customSide.trim()} className="min-h-10 rounded-lg bg-slate-100 px-3 text-sm font-black text-[#10254a] disabled:opacity-50">Add</button>
      </form>
      {selected.filter((side) => !options.includes(side)).map((side) => <label key={side} className="mt-1 flex items-center gap-2 px-2 text-sm font-medium text-[#10254a]"><input type="checkbox" checked onChange={() => toggle(side)} className="h-4 w-4 accent-emerald-800" />{side}</label>)}
    </div>
  </details>;
}

function dateOnly(value: string) {
  return new Date(`${value}T12:00:00`);
}

export default function FamilyMealPlanner({ playerId, players }: { playerId: string; players: PlayerOption[] }) {
  const [days, setDays] = useState<DayPlan[]>([]);
  const [customOptions, setCustomOptions] = useState<CustomMealOptions>({ breakfast: [], lunch: [], dinner: [], sides: [] });
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [pantryError, setPantryError] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem("fambam_session_token") ?? "";
    fetch(`/api/family-meal-plan?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { "x-fambam-session": token } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the meal plan.");
        return data as { weekStart: string; days: DayPlan[]; options?: CustomMealOptions };
      })
      .then((data) => {
        if (cancelled) return;
        setWeekStart(data.weekStart);
        setDays(Array.isArray(data.days) ? data.days : []);
        if (data.options) setCustomOptions(data.options);
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load the meal plan."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem("fambam_session_token") ?? "";
    fetch(`/api/pantry?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { "x-fambam-session": token } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load pantry inventory.");
        return data as { items?: PantryItem[] };
      })
      .then((data) => { if (!cancelled) setPantryItems(Array.isArray(data.items) ? data.items.filter((item) => item.quantity > 0) : []); })
      .catch((caught) => { if (!cancelled) setPantryError(caught instanceof Error ? caught.message : "Could not load pantry inventory."); });
    return () => { cancelled = true; };
  }, [playerId]);

  function updateDay(date: string, patch: Partial<DayPlan>) {
    setDays((current) => current.map((day) => day.date === date ? { ...day, ...patch } : day));
    setSavedDate(null);
  }

  async function addOption(kind: OptionKind, option: string) {
    setError("");
    try {
      const token = window.localStorage.getItem("fambam_session_token") ?? "";
      const response = await fetch("/api/family-meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fambam-session": token },
        body: JSON.stringify({ playerId, action: "add-option", optionKind: kind, option }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add this choice.");
      if (data.options) setCustomOptions(data.options);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this choice.");
      return false;
    }
  }

  async function saveDay(day: DayPlan) {
    setBusyDate(day.date);
    setSavedDate(null);
    setError("");
    try {
      const token = window.localStorage.getItem("fambam_session_token") ?? "";
      const response = await fetch("/api/family-meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fambam-session": token },
        body: JSON.stringify({
          playerId,
          date: day.date,
          dinnerSides: day.dinnerSides,
          meals: { breakfast: day.breakfast, lunch: day.lunch, dinner: day.dinner },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the meal plan.");
      setSavedDate(day.date);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the meal plan.");
    } finally {
      setBusyDate(null);
    }
  }

  const weekEnd = weekStart ? new Date(`${weekStart}T00:00:00Z`) : null;
  if (weekEnd) weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekLabel = weekEnd && weekStart
    ? `${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${weekStart}T12:00:00Z`))}–${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(weekEnd)}`
    : "";
  const onHandItems = pantryItems.filter((item) => item.quantity > 0);
  function possibleMatches(day: DayPlan) {
    const words = new Set(`${day.dinner} ${day.dinnerSides}`.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 3) ?? []);
    return onHandItems.filter((item) => (item.name.toLowerCase().match(/[a-z0-9]+/g) ?? []).some((word) => words.has(word) || words.has(word.replace(/s$/, "")) || words.has(`${word}s`)));
  }

  return <details id="meal-plan" className="group rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm sm:p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">Family meals</span><span className="mt-1 block text-base font-black text-[#10254a]">Meal Plan 🍽️</span><span className="mt-0.5 block text-xs font-semibold text-slate-600">{loading ? "Loading this week…" : weekLabel ? `Week starting Sunday · ${weekLabel}` : "Sunday–Saturday"}</span></span>
      <span aria-hidden="true" className="text-lg text-[#10254a] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="mt-3 border-t border-[#e6dfd0] pt-3">
    <p className="text-sm text-slate-600">Choose any meals for any day, add dinner sides, and check what you already have.</p>
    <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <summary className="cursor-pointer text-sm font-black text-emerald-950">🥫 Pantry & freezer on hand · {onHandItems.length} {onHandItems.length === 1 ? "item" : "items"}</summary>
      {pantryError ? <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{pantryError}</p> : onHandItems.length ? <ul className="mt-2 grid gap-1 text-sm text-emerald-950 sm:grid-cols-2">{onHandItems.map((item) => <li key={item.id}>{item.name} <span className="text-emerald-800">— {item.quantity} {item.unit} · {item.category}</span></li>)}</ul> : <p className="mt-2 text-sm text-emerald-900">Nothing is stocked yet. Add canned goods, pantry, or freezer items in the Pantry tab.</p>}
    </details>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((day) => <details key={day.date} className="rounded-xl border border-[#e5dccb] bg-white p-4">
          <summary className="flex min-h-12 cursor-pointer flex-col items-start justify-center text-base font-black text-[#10254a]">
            <span>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(dateOnly(day.date))}</span>
            {(day.breakfast || day.lunch || day.dinner || day.dinnerSides) && <span className="mt-1 line-clamp-2 text-left text-xs font-semibold leading-5 text-slate-600">
              {[day.breakfast && `Breakfast: ${day.breakfast}`, day.lunch && `Lunch: ${day.lunch}`, day.dinner && `Dinner: ${day.dinner}${day.dinnerSides ? ` · Sides: ${day.dinnerSides}` : ""}`, !day.dinner && day.dinnerSides && `Sides: ${day.dinnerSides}`].filter(Boolean).join(" · ")}
            </span>}
          </summary>
          <div className="mt-3 space-y-3">
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => <label key={meal} className="block text-sm font-bold capitalize text-slate-700">{meal}
              <MealPicker kind={meal} value={day[meal]} options={[...MEAL_OPTIONS[meal], ...customOptions[meal]]} onChange={(value) => updateDay(day.date, { [meal]: value })} onAddOption={addOption} />
            </label>)}
            <label className="block text-sm font-bold text-slate-700">Dinner sides
              <SidePicker value={day.dinnerSides} options={[...MEAL_OPTIONS.sides, ...customOptions.sides]} onChange={(value) => updateDay(day.date, { dinnerSides: value })} onAddOption={addOption} />
            </label>
            {(day.dinner || day.dinnerSides) && <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs font-black text-emerald-900">Possible matches in your pantry/freezer</p>
              {possibleMatches(day).length > 0 ? <ul className="mt-1 space-y-1 text-xs font-semibold text-emerald-900">{possibleMatches(day).map((item) => <li key={item.id}>• {item.name} — {item.quantity} {item.unit}</li>)}</ul> : <p className="mt-1 text-xs font-medium text-emerald-800">No food-name matches yet. See all on-hand items below.</p>}
            </div>}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" disabled={busyDate === day.date} onClick={() => void saveDay(day)} className="min-h-11 rounded-lg bg-[#10254a] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busyDate === day.date ? "Saving…" : "Save day"}</button>
              {savedDate === day.date && <span role="status" className="text-sm font-bold text-emerald-700">Saved</span>}
            </div>
          </div>
        </details>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p>}
    </div>
  </details>;
}
