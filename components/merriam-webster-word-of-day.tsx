"use client";

import { useEffect, useState } from "react";

type Word = { word: string; definition: string; partOfSpeech?: string; example?: string; date: string; url: string };

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
  return <details className="group rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">Merriam-Webster · Word of the day</span><span className="mt-1 block truncate text-base font-black text-[#10254a]">{entry?.word ?? (loading ? "Loading today’s word…" : "Word unavailable today")}</span></span>
      <span aria-hidden="true" className="text-lg text-[#10254a] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    {entry && <div className="mt-3 border-t border-[#e6dfd0] pt-3">
      {entry.partOfSpeech && <p className="text-xs font-bold italic capitalize text-slate-500">{entry.partOfSpeech}</p>}
      <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">{entry.definition}</p>
      {entry.example && <p className="mt-2 text-sm leading-relaxed text-slate-600"><span className="font-bold text-[#10254a]">Example: </span><span className="italic">{entry.example}</span></p>}
    </div>}
  </details>;
}
