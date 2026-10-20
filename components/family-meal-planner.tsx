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

  return <details id="meal-plan" className="group rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm sm:p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">Family meals</span><span className="mt-1 block text-base font-black text-[#10254a]">Meal Plan 🍽️</span><span className="mt-0.5 block text-xs font-semibold text-slate-600">{loading ? "Loading this week…" : weekLabel ? `Week starting Sunday · ${weekLabel}` : "Sunday–Saturday"}</span></span>
      <span aria-hidden="true" className="text-lg text-[#10254a] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="mt-3 border-t border-[#e6dfd0] pt-3">
    <p className="text-sm text-slate-600">Plan breakfast, lunch, and dinner. Add a theme for dinner if you like.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((day) => <details key={day.date} className="rounded-xl border border-[#e5dccb] bg-white p-4">
          <summary className="flex min-h-12 cursor-pointer flex-col items-start justify-center text-base font-black text-[#10254a]">
            <span>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(dateOnly(day.date))}</span>
            {day.theme && <span className="mt-0.5 text-xs font-bold text-[#b28a2e]">Dinner theme: {day.theme}</span>}
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-bold text-slate-700">Meal choice
              <select value={day.chosenByPlayerId ?? ""} onChange={(event) => updateDay(day.date, { chosenByPlayerId: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base font-medium text-[#10254a]">
                <option value="">Anyone can choose</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}
              </select>
            </label>
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => <label key={meal} className="block text-sm font-bold capitalize text-slate-700">{meal}
              <input value={day[meal]} onChange={(event) => updateDay(day.date, { [meal]: event.target.value })} maxLength={120} placeholder={meal === "dinner" ? "What’s for dinner?" : "Optional"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-medium text-[#10254a]" />
            </label>)}
            <label className="block text-sm font-bold text-slate-700">Dinner theme (optional)
              <input value={day.theme} onChange={(event) => updateDay(day.date, { theme: event.target.value })} maxLength={60} placeholder="Taco Tuesday, soup night…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base font-medium text-[#10254a]" />
            </label>
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
