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
  const fallbackUrl = holiday?.url || "https://www.timeanddate.com/holidays/fun/";
  return <article className="flex flex-col justify-between rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">A little family fun</div>
      <h2 className="mt-1 text-xl font-black text-[#10254a]">🎉 Today’s fun holiday</h2>
      <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-400">{dateLabel || "Today"}</p>
      <p className="mt-1 text-lg font-black text-[#10254a]">{loading ? "Finding today’s celebration…" : holiday?.name || "No kid-friendly holiday listed today"}</p>
      <p className="mt-2 text-sm font-medium text-slate-600">{holiday?.name ? "Pick a simple, family-friendly way to celebrate together!" : "Browse today’s listings for a fun family idea."}</p>
    </div>
    <a className="mt-3 inline-flex min-h-10 items-center self-start rounded-xl bg-[#10254a] px-3 text-xs font-black text-white" href={fallbackUrl} target="_blank" rel="noreferrer">See it on Timeanddate ↗</a>
  </article>;
}
