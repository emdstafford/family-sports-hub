"use client";

import { useEffect, useState } from "react";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export default function TodaysFunHoliday() {
  const [url, setUrl] = useState("https://nationaldaycalendar.com/");
  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => {
    const now = new Date();
    const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(now));
    setUrl(`https://www.timeanddate.com/holidays/fun/${MONTHS[month - 1]}/`);
    setDateLabel(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(now));
  }, []);
  return <article className="flex flex-col justify-between rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">A little family fun</div>
      <h2 className="mt-1 text-xl font-black text-[#10254a]">🎉 A fun day to celebrate</h2>
      <p className="mt-2 text-sm font-medium text-slate-600">{dateLabel ? `Find a family-friendly celebration for ${dateLabel}.` : "Find a family-friendly celebration for today."} We’ll keep it light and kid-friendly.</p>
    </div>
    <a className="mt-3 inline-flex min-h-10 items-center self-start rounded-xl bg-[#10254a] px-3 text-xs font-black text-white" href={url} target="_blank" rel="noreferrer">Browse fun holidays ↗</a>
  </article>;
}
