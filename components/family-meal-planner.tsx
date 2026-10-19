"use client";

import { useEffect, useState } from "react";

type PlayerOption = { id: string; display_name: string };
type DayPlan = {
  date: string;
  theme: string;
  chosenByPlayerId: string | null;
  breakfast: string;
  lunch: string;
  dinner: string;
};

function dateOnly(value: string) {
  return new Date(`${value}T12:00:00`);
}

export default function FamilyMealPlanner({ playerId, players }: { playerId: string; players: PlayerOption[] }) {
  const [days, setDays] = useState<DayPlan[]>([]);
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
          theme: day.theme,
          chosenByPlayerId: day.chosenByPlayerId,
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

  return <article className="rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">Family meals</div>
    <h2 className="mt-1 text-lg font-black text-[#10254a]">Meal Plan 🍽️</h2>
    <p className="mt-1 text-xs font-semibold text-slate-500">{loading ? "Loading this week…" : weekLabel ? `Week starting Sunday · ${weekLabel}` : "Sunday–Saturday"}</p>
    <details className="mt-3">
      <summary className="cursor-pointer rounded-xl bg-white px-3 py-2.5 text-sm font-black text-[#10254a]">Plan breakfast, lunch, and dinner</summary>
      <div className="mt-3 space-y-2">
        {days.map((day) => <details key={day.date} className="rounded-xl border border-[#eee5d5] bg-white p-3">
          <summary className="cursor-pointer text-sm font-black text-[#10254a]">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(dateOnly(day.date))}
            {day.theme && <span className="ml-2 text-xs font-semibold text-[#b28a2e]">{day.theme}</span>}
          </summary>
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-bold text-slate-600">Theme
              <input value={day.theme} onChange={(event) => updateDay(day.date, { theme: event.target.value })} maxLength={60} placeholder="Taco Tuesday, soup night…" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-[#10254a]" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Meal choice
              <select value={day.chosenByPlayerId ?? ""} onChange={(event) => updateDay(day.date, { chosenByPlayerId: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#10254a]">
                <option value="">Anyone can choose</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}
              </select>
            </label>
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => <label key={meal} className="block text-xs font-bold capitalize text-slate-600">{meal}
              <input value={day[meal]} onChange={(event) => updateDay(day.date, { [meal]: event.target.value })} maxLength={120} placeholder={meal === "dinner" ? "What’s for dinner?" : "Optional"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-[#10254a]" />
            </label>)}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" disabled={busyDate === day.date} onClick={() => void saveDay(day)} className="rounded-lg bg-[#10254a] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busyDate === day.date ? "Saving…" : "Save day"}</button>
              {savedDate === day.date && <span role="status" className="text-xs font-bold text-emerald-700">Saved</span>}
            </div>
          </div>
        </details>)}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-bold text-red-600">{error}</p>}
    </details>
  </article>;
}
