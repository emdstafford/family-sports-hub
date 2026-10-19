"use client";

import { useEffect, useState } from "react";

const WEEKLY_PRACTICE = [
  { word: "Courage", reference: "Joshua 1:9", code: "JOS.1.9", thought: "Take the next brave step, even when the whole path isn’t clear." },
  { word: "Peace", reference: "John 14:27", code: "JHN.14.27", thought: "Pause, breathe, and remember you don’t have to solve everything at once." },
  { word: "Kindness", reference: "Ephesians 4:32", code: "EPH.4.32", thought: "Look for one small way to make someone feel cared for." },
  { word: "Trust", reference: "Proverbs 3:5", code: "PRO.3.5", thought: "You can take a faithful next step without having every answer." },
  { word: "Joy", reference: "Nehemiah 8:10", code: "NEH.8.10", thought: "Notice one little thing worth smiling about today." },
  { word: "Perseverance", reference: "Galatians 6:9", code: "GAL.6.9", thought: "Keep doing good; small faithful actions add up." },
  { word: "Gratitude", reference: "1 Thessalonians 5:18", code: "1TH.5.18", thought: "Name one good thing you can carry with you this week." },
  { word: "Comfort", reference: "Psalm 34:18", code: "PSA.34.18", thought: "Make room for tender days and let someone help carry them." },
  { word: "Generosity", reference: "Acts 20:35", code: "ACT.20.35", thought: "Share what you can: time, attention, a smile, or a helping hand." },
  { word: "Hope", reference: "Romans 15:13", code: "ROM.15.13", thought: "There is room for hope, even while you wait for what comes next." },
  { word: "Patience", reference: "James 1:4", code: "JAS.1.4", thought: "Give yourself grace while things take the time they need." },
  { word: "Love", reference: "1 Corinthians 13:4", code: "1CO.13.4", thought: "Let love shape the way you speak and listen this week." },
];

export default function WeeklyFaithPractice() {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const week = Math.floor((now.getTime() - yearStart.getTime()) / (7 * 86_400_000));
    setIndex(week % WEEKLY_PRACTICE.length);
  }, []);
  const entry = index === null ? null : WEEKLY_PRACTICE[index];
  return <section className="mb-4 rounded-3xl border border-amber-200 bg-[#fffaf0] p-4 shadow-sm">
    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a741f]">A weekly family practice</div>
    <h2 className="mt-1 text-xl font-black text-[#10254a]">📖 Word & verse to remember</h2>
    {entry ? <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Word of the week</div><p className="mt-1 text-xl font-black text-[#10254a]">{entry.word}</p><p className="mt-1 text-xs font-medium text-slate-600">{entry.thought}</p></div>
        <div className="rounded-2xl bg-white p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Memory verse · ESV</div><p className="mt-1 text-lg font-black text-[#10254a]">{entry.reference}</p><a className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-[#10254a] px-3 text-xs font-black text-white" href={`https://www.bible.com/bible/59/${entry.code}.ESV`} target="_blank" rel="noreferrer">Read this week’s verse ↗</a></div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-600">Family challenge: read it aloud, cover the screen, and try saying it from memory together.</p>
    </> : <p className="mt-2 text-sm font-semibold text-slate-500">This week’s word and verse are on the way…</p>}
    <a className="mt-3 inline-flex min-h-10 items-center text-xs font-black text-[#315f99] underline underline-offset-2" href="https://www.bible.com/app" target="_blank" rel="noreferrer">Get the YouVersion Bible App ↗</a>
  </section>;
}
