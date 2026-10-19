"use client";

import { useEffect, useState } from "react";

const DAILY_WORDS = [
  { word: "Courage", verse: "Be strong and of a good courage; be not afraid.", reference: "Joshua 1:9", thought: "You can take the next brave step, even when the whole path isn’t clear." },
  { word: "Peace", verse: "Peace I leave with you, my peace I give unto you.", reference: "John 14:27", thought: "Take a slow breath and remember you don’t have to solve everything at once." },
  { word: "Hope", verse: "For I know the thoughts that I think toward you, saith the Lord.", reference: "Jeremiah 29:11", thought: "There is room for good things ahead, even on a hard day." },
  { word: "Strength", verse: "I can do all things through Christ which strengtheneth me.", reference: "Philippians 4:13", thought: "You are allowed to ask for help and keep going one step at a time." },
  { word: "Kindness", verse: "Be ye kind one to another, tenderhearted.", reference: "Ephesians 4:32", thought: "A small kindness can change the feeling of someone’s whole day." },
  { word: "Wisdom", verse: "If any of you lack wisdom, let him ask of God.", reference: "James 1:5", thought: "You can pause, pray, and choose your next step with care." },
  { word: "Trust", verse: "Trust in the Lord with all thine heart.", reference: "Proverbs 3:5", thought: "You don’t have to have every answer to take a faithful next step." },
  { word: "Love", verse: "That ye love one another; as I have loved you.", reference: "John 13:34", thought: "Let the people around you know they matter today." },
  { word: "Joy", verse: "The joy of the Lord is your strength.", reference: "Nehemiah 8:10", thought: "Look for one little thing worth smiling about today." },
  { word: "Stillness", verse: "Be still, and know that I am God.", reference: "Psalm 46:10", thought: "A quiet moment can help you hear what matters most." },
  { word: "Perseverance", verse: "Let us not be weary in well doing.", reference: "Galatians 6:9", thought: "The good you are doing counts, even when progress feels slow." },
  { word: "Faith", verse: "Now faith is the substance of things hoped for.", reference: "Hebrews 11:1", thought: "Keep making room for hope while you wait for what comes next." },
  { word: "Gratitude", verse: "In every thing give thanks.", reference: "1 Thessalonians 5:18", thought: "Name one good thing you can carry with you through the day." },
  { word: "Help", verse: "God is our refuge and strength, a very present help in trouble.", reference: "Psalm 46:1", thought: "You are not meant to carry every hard thing alone." },
  { word: "Belonging", verse: "I will never leave thee, nor forsake thee.", reference: "Hebrews 13:5", thought: "You are loved and you are never forgotten." },
  { word: "Patience", verse: "Let patience have her perfect work.", reference: "James 1:4", thought: "Give yourself grace while things take the time they need." },
  { word: "Faithfulness", verse: "Be thou faithful unto death, and I will give thee a crown of life.", reference: "Revelation 2:10", thought: "Showing up with love matters more than doing everything perfectly." },
  { word: "Comfort", verse: "The Lord is nigh unto them that are of a broken heart.", reference: "Psalm 34:18", thought: "It’s okay to have tender days; you are cared for in them." },
  { word: "Confidence", verse: "The Lord is my helper, and I will not fear.", reference: "Hebrews 13:6", thought: "You can face today with a little more courage than you feel." },
  { word: "Generosity", verse: "It is more blessed to give than to receive.", reference: "Acts 20:35", thought: "Share what you can—time, attention, a smile, or a helping hand." },
  { word: "Renewal", verse: "They that wait upon the Lord shall renew their strength.", reference: "Isaiah 40:31", thought: "Rest is part of growing strong again." },
  { word: "Forgiveness", verse: "Forgiving one another, even as God for Christ's sake hath forgiven you.", reference: "Ephesians 4:32", thought: "You can choose a fresh start, one conversation at a time." },
  { word: "Purpose", verse: "We are his workmanship, created in Christ Jesus unto good works.", reference: "Ephesians 2:10", thought: "Your gifts and your way of caring make a difference." },
  { word: "Resilience", verse: "When I am weak, then am I strong.", reference: "2 Corinthians 12:10", thought: "Needing support doesn’t make you weak; it helps you keep going." },
  { word: "Light", verse: "The Lord is my light and my salvation; whom shall I fear?", reference: "Psalm 27:1", thought: "Carry a little light into the next thing you do." },
  { word: "Rest", verse: "Come unto me, all ye that labour and are heavy laden, and I will give you rest.", reference: "Matthew 11:28", thought: "You can set down what you don’t need to carry right now." },
  { word: "Friendship", verse: "A friend loveth at all times.", reference: "Proverbs 17:17", thought: "Be the kind of friend who makes someone feel safe and seen." },
  { word: "Humility", verse: "In honour preferring one another.", reference: "Romans 12:10", thought: "Make space for someone else’s voice today." },
  { word: "Mercy", verse: "His compassions fail not. They are new every morning.", reference: "Lamentations 3:22–23", thought: "Today is a new morning, with new chances to begin again." },
  { word: "Caring", verse: "Bear ye one another's burdens.", reference: "Galatians 6:2", thought: "Checking in and listening are powerful ways to show love." },
];

export default function DailyEncouragement() {
  const [entryIndex, setEntryIndex] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    setEntryIndex((dayOfYear - 1) % DAILY_WORDS.length);
  }, []);
  const entry = entryIndex === null ? null : DAILY_WORDS[entryIndex];

  return <article className="flex flex-col justify-between rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] p-4 shadow-sm">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b28a2e]">A little encouragement for today</div>
      {entry ? <><h2 className="mt-1 text-xl font-black text-[#10254a]">{entry.word} ✨</h2>
        <blockquote className="mt-2 text-sm font-bold leading-relaxed text-[#10254a]">“{entry.verse}”</blockquote>
        <p className="mt-1 text-xs font-black text-[#85681e]">{entry.reference} · KJV</p>
        <p className="mt-3 text-sm font-medium text-slate-600">{entry.thought}</p></> : <p className="mt-3 text-sm font-semibold text-slate-500">A new word and verse each day…</p>}
    </div>
  </article>;
}
