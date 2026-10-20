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

const MEAL_OPTIONS = {
  breakfast: ["Cereal", "Waffles", "Pancakes", "Biscuits", "Sausage rolls", "Yogurt", "Eggs", "Toast", "Oatmeal", "Breakfast sandwiches", "Breakfast burritos", "French toast", "Bagels", "Muffins", "Smoothies", "Fruit and yogurt"],
  lunch: ["Leftovers", "Sandwiches", "Wraps", "Quesadillas", "Grilled cheese", "Soup", "Salad", "Chicken nuggets", "Mac and cheese", "Snack plate", "Hot dogs", "Chicken salad", "Tuna salad"],
  dinner: ["Chicken breast", "Chicken thighs", "Baked chicken", "Grilled chicken", "Chicken tacos", "Chicken pasta", "Chicken stir-fry", "Steak", "Steak and potatoes", "Steak fajitas", "Ground beef tacos", "Ground turkey tacos", "Burgers", "Spaghetti with meat sauce", "Meatloaf", "Sloppy joes", "Chili", "Meatballs", "Beef or turkey stir-fry", "Crockpot meal", "Pizza", "Italian dinner", "Breakfast for dinner", "Loaded baked potatoes", "Black bean quesadillas", "Veggie fried rice", "Grilled cheese and tomato soup"],
  sides: ["Rice", "Mashed potatoes", "Baked potatoes", "Green beans", "Corn", "Peas", "Carrots", "Broccoli", "Side salad", "Dinner rolls", "Mac and cheese", "Fruit", "Fries", "Roasted vegetables", "Canned vegetables", "Beans", "Applesauce", "Coleslaw"],
} as const;

type MealKind = keyof typeof MEAL_OPTIONS;

function MealPicker({ kind, value, onChange }: { kind: MealKind; value: string; onChange: (value: string) => void }) {
  const [customMode, setCustomMode] = useState(false);
  const isCustom = customMode || (value !== "" && !(MEAL_OPTIONS[kind] as readonly string[]).includes(value));

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
      {MEAL_OPTIONS[kind].map((option) => <option key={option} value={option}>{option}</option>)}
      <option value="__custom">Add a different meal…</option>
    </select>
    {isCustom && <input autoFocus value={value} onChange={(event) => onChange(event.target.value)} maxLength={120} placeholder="Type your meal idea" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-medium text-[#10254a]" />}
  </>;
}

function dateOnly(value: string) {
  return new Date(`${value}T12:00:00`);
}

export default function FamilyMealPlanner({ playerId, players }: { playerId: string; players: PlayerOption[] }) {
  const [days, setDays] = useState<DayPlan[]>([]);
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
        return data as { weekStart: string; days: DayPlan[] };
      })
      .then((data) => {
        if (cancelled) return;
        setWeekStart(data.weekStart);
        setDays(Array.isArray(data.days) ? data.days : []);
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
          </summary>
          <div className="mt-3 space-y-3">
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => <label key={meal} className="block text-sm font-bold capitalize text-slate-700">{meal}
              <MealPicker kind={meal} value={day[meal]} onChange={(value) => updateDay(day.date, { [meal]: value })} />
            </label>)}
            <label className="block text-sm font-bold text-slate-700">Dinner sides
              <MealPicker kind="sides" value={day.dinnerSides} onChange={(value) => updateDay(day.date, { dinnerSides: value })} />
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
