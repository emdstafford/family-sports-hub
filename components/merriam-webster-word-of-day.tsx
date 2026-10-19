"use client";

import { useEffect, useState } from "react";

type Word = { word: string; date: string; url: string };

export default function MerriamWebsterWordOfWeek() {
  const [entry, setEntry] = useState<Word | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    fetch(`/api/word-of-day?date=${today}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Word feed unavailable");
        return response.json() as Promise<Word>;
      })
      .then((data) => { if (!cancelled && data.word && data.url) setEntry(data); })
      .catch(() => { if (!cancelled) setEntry(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const sourceUrl = entry?.url || "https://www.merriam-webster.com/word-of-the-day";
  return <article className="flex flex-col justify-between rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">Merriam-Webster</div>
      <h2 className="mt-1 text-xl font-black text-[#10254a]">🔤 Word of the day</h2>
      {entry ? <><p className="mt-2 text-2xl font-black text-[#10254a]">{entry.word}</p><p className="mt-1 text-xs font-medium text-slate-500">From Merriam-Webster’s Word of the Day</p></> : <p className="mt-2 text-sm font-semibold text-slate-500">{loading ? "Loading today’s word…" : "Tap below to see today’s word."}</p>}
      <a className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#10254a] px-3 text-xs font-black text-white" href={sourceUrl} target="_blank" rel="noreferrer">See the word and definition ↗</a>
    </div>
  </article>;
}
