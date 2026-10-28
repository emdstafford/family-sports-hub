"use client";

import { useEffect, useState } from "react";

const WEEKLY_PRACTICE = [
  { reference: "Joshua 1:9", code: "JOS.1.9", text: "Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the LORD your God is with you wherever you go." },
  { reference: "John 14:27", code: "JHN.14.27", text: "Peace I leave with you; my peace I give to you. Not as the world gives do I give to you. Let not your hearts be troubled, neither let them be afraid." },
  { reference: "Ephesians 4:32", code: "EPH.4.32", text: "Be kind to one another, tenderhearted, forgiving one another, as God in Christ forgave you." },
  { reference: "Proverbs 3:5", code: "PRO.3.5", text: "Trust in the LORD with all your heart, and do not lean on your own understanding." },
  { reference: "Nehemiah 8:10", code: "NEH.8.10", text: "Then he said to them, “Go your way. Eat the fat and drink sweet wine and send portions to anyone who has nothing ready, for this day is holy to our Lord. And do not be grieved, for the joy of the LORD is your strength.”" },
  { reference: "Galatians 6:9", code: "GAL.6.9", text: "And let us not grow weary of doing good, for in due season we will reap, if we do not give up." },
  { reference: "1 Thessalonians 5:18", code: "1TH.5.18", text: "Give thanks in all circumstances; for this is the will of God in Christ Jesus for you." },
  { reference: "Psalm 34:18", code: "PSA.34.18", text: "The LORD is near to the brokenhearted and saves the crushed in spirit." },
  { reference: "Acts 20:35", code: "ACT.20.35", text: "In all things I have shown you that by working hard in this way we must help the weak and remember the words of the Lord Jesus, how he himself said, ‘It is more blessed to give than to receive.’”" },
  { reference: "Romans 15:13", code: "ROM.15.13", text: "May the God of hope fill you with all joy and peace in believing, so that by the power of the Holy Spirit you may abound in hope." },
  { reference: "James 1:4", code: "JAS.1.4", text: "And let steadfastness have its full effect, that you may be perfect and complete, lacking in nothing." },
  { reference: "1 Corinthians 13:4", code: "1CO.13.4", text: "Love is patient and kind; love does not envy or boast; it is not arrogant." },
];

export default function WeeklyFaithPractice() {
  const [index, setIndex] = useState<number | null>(null);
  const [practiceMode, setPracticeMode] = useState<"full" | "initials" | "alternate">("full");
  useEffect(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const week = Math.floor((now.getTime() - yearStart.getTime()) / (7 * 86_400_000));
    setIndex(week % WEEKLY_PRACTICE.length);
  }, []);
  const entry = index === null ? null : WEEKLY_PRACTICE[index];
  const wordPattern = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’\-]*/gu;
  const initialsText = entry?.text.replace(wordPattern, (word) => word[0]) ?? "";
  let wordIndex = 0;
  const alternateWordsText = entry?.text.replace(wordPattern, (word) => {
    wordIndex += 1;
    return wordIndex % 2 === 0 ? "____" : word;
  }) ?? "";
  const displayedText = practiceMode === "initials" ? initialsText : practiceMode === "alternate" ? alternateWordsText : entry?.text ?? "";
  return <section className="mb-4 rounded-3xl border border-amber-200 bg-[#fffaf0] p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <h2 className="mt-1 text-xl font-black text-[#10254a]">📖 Verse of the week</h2>
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
        <span>ESV</span>
        <details className="relative">
          <summary className="cursor-pointer underline underline-offset-2">Copyright</summary>
          <p className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[80vw] rounded-xl border border-slate-200 bg-white p-3 text-[10px] font-medium leading-relaxed text-slate-600 shadow-lg">Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. Used by permission. All rights reserved.</p>
        </details>
      </div>
    </div>
    {entry ? <>
      <div className="mt-3 rounded-2xl bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">{entry.reference}</p>
        <blockquote className="mt-2 text-base font-semibold leading-relaxed text-[#10254a]">“{displayedText}”</blockquote>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Verse memorization practice">
          {([
            ["full", "Full verse"],
            ["initials", "First letters"],
            ["alternate", "Every other word"],
          ] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={practiceMode === mode} onClick={() => setPracticeMode(mode)} className={`inline-flex min-h-10 items-center rounded-xl border px-3 text-xs font-black ${practiceMode === mode ? "border-[#10254a] bg-[#10254a] text-white" : "border-[#10254a]/30 bg-white text-[#10254a]"}`}>
            {label}
          </button>)}
        </div>
        {practiceMode === "alternate" && <p className="mt-2 text-xs font-semibold text-slate-500">Say the whole verse, filling in each blank from memory.</p>}
      </div>
    </> : <p className="mt-2 text-sm font-semibold text-slate-500">This week’s verse is on the way…</p>}
  </section>;
}
