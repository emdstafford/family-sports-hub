"use client";

import { useEffect, useMemo, useState } from "react";

type Game = { id: string; sport: string; competition: string; home: string; away: string; startsAt: string | null; homeScore: number | null; awayScore: number | null; status: string; sourceNotes?: string | null };
const favorites = ["arsenal", "aston villa", "liverpool", "wimbledon", "kentucky", "canucks", "braves", "cubs", "georgia", "rock lobsters"];
const cup = /fa cup|carabao|efl cup|league cup|champions league|europa league|conference league|playoff|tournament|world series|stanley cup|march madness/i;
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(value)) : "Date TBD";

export default function SportsBuzz() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/games", { cache: "no-store" });
        if (!response.ok) throw new Error("Games unavailable");
        const body = await response.json();
        if (active) setGames(Array.isArray(body.games) ? body.games : []);
      } catch { /* Retain previously loaded stories. */ }
      finally { if (active) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const stories = useMemo(() => {
    const now = Date.now();
    return games.filter((game) => {
      if (!game.startsAt || !Number.isFinite(Date.parse(game.startsAt))) return false;
      const delta = Date.parse(game.startsAt) - now;
      const relevant = favorites.some((name) => (game.home + " " + game.away).toLowerCase().includes(name));
      const knockout = cup.test(game.competition);
      const final = /final|finished|complete|closed/i.test(game.status) && game.homeScore != null && game.awayScore != null;
      return (relevant || knockout) && (final ? delta > -7 * 86400000 && delta <= 0 : delta > 0 && delta < 4 * 86400000);
    }).sort((a,b) => {
      const score = (g: Game) => (favorites.some(n => (g.home+" "+g.away).toLowerCase().includes(n)) ? 100 : 0) + (cup.test(g.competition) ? 30 : 0) + (/final|finished|complete|closed/i.test(g.status) ? 20 : 0);
      return score(b)-score(a) || Math.abs(Date.parse(a.startsAt!)-now)-Math.abs(Date.parse(b.startsAt!)-now);
    }).slice(0, 12);
  }, [games]);
  return <section className="mt-4 rounded-3xl border border-[#e6dfcf] bg-white p-4 shadow-sm" aria-label="Sports Buzz">
    <div className="flex items-center justify-between gap-2"><div><div className="text-xs font-black uppercase tracking-widest text-[#8a6b1e]">🏆 Souther Ladies</div><h2 className="text-xl font-black text-[#06284a]">The Sports Buzz</h2></div><span className="rounded-full bg-[#f8f0d9] px-3 py-1 text-xs font-bold text-[#725719]">Auto-updating</span></div>
    <p className="mt-1 text-xs text-slate-500">Important games and what they mean, based on the latest synced results. Refreshes while the app is open.</p>
    {stories.length === 0 ? <p className="mt-4 text-sm text-slate-500">{loading ? "Checking the latest games…" : "No major games to highlight right now. Check back soon!"}</p> : <div className="mt-3 space-y-3">
      {(expanded ? stories : stories.slice(0,3)).map((g) => {
        const final = /final|finished|complete|closed/i.test(g.status) && g.homeScore != null && g.awayScore != null;
        const knockout = cup.test(g.competition);
        const draw = final && g.homeScore === g.awayScore;
        const winner = final && !draw ? (g.homeScore! > g.awayScore! ? g.home : g.away) : null;
        return <article key={g.id} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#84651a]"><span>{knockout ? "🏆 Cup / tournament" : "⭐ Family team"}</span><span className="text-slate-400">· {dateLabel(g.startsAt)}</span></div>
          <h3 className="mt-1 font-black text-[#06284a]">{g.home} {final ? g.homeScore : "vs"} {final ? "– " + g.awayScore : ""} {g.away}</h3>
          <p className="text-xs font-semibold text-slate-500">{g.competition}</p>
          <p className="mt-2 text-sm text-slate-700"><strong>What it means: </strong>{final && knockout && winner ? winner + " won this match. In a knockout tie, the winner advances if the tie is decided in one game; check the competition format for exceptions." : draw && knockout ? "Level at full time. Extra time, penalties, or another leg may decide who advances." : final ? "Final result recorded. League standings or tournament implications depend on the competition." : knockout ? "An upcoming cup or tournament game — advancement rules depend on the round and competition." : "Upcoming game involving a family favorite."}</p>
        </article>;
      })}
      {stories.length > 3 && <button type="button" onClick={() => setExpanded(v => !v)} className="w-full rounded-xl bg-[#06284a] px-4 py-2 text-sm font-bold text-white">{expanded ? "Show fewer stories" : "See all " + stories.length + " stories"}</button>}
    </div>}
  </section>;
}
