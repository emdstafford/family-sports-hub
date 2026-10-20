"use client";

import { useEffect, useState } from "react";

type FunHoliday = { name: string | null; description: string | null; date: string; url: string };

export default function TodaysFunHoliday() {
  const [holiday, setHoliday] = useState<FunHoliday | null>(null);
  const [dateLabel, setDateLabel] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    setDateLabel(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(now));
    fetch(`/api/fun-holiday?date=${date}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Holiday unavailable");
        return response.json() as Promise<FunHoliday>;
      })
      .then(setHoliday)
      .catch(() => setHoliday(null))
      .finally(() => setLoading(false));
  }, []);
  return <details id="today-card" className="group scroll-mt-24 rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">🎉 Today’s fun holiday · {dateLabel || "Today"}</span>
        <span className="mt-1 block text-base font-black text-[#10254a]">{loading ? "Finding today’s celebration…" : holiday?.name || "No kid-friendly holiday listed today"}</span>
      </span>
      <span aria-hidden="true" className="text-lg text-[#10254a] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    {holiday?.description && <p className="mt-3 border-t border-[#e6dfd0] pt-3 text-sm font-medium leading-relaxed text-slate-600">{holiday.description}</p>}
  </details>;
}
