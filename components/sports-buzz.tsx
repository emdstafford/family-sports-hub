"use client";

import { useEffect, useMemo, useState } from "react";

type NewsStory = { title: string; link: string; source: string; publishedAt: string; topic: string };
type Game = { id: string; sport: string; competition: string; home: string; away: string; startsAt: string | null; homeScore: number | null; awayScore: number | null; status: string; sourceNotes?: string | null };
const favorites = ["arsenal", "aston villa", "liverpool", "afc wimbledon", "university of kentucky", "kentucky wildcats", "canucks", "braves", "cubs", "georgia bulldogs", "rock lobsters"];
const familyTeam = (team: string) => {
  const name = team.toLowerCase();
  if (/western kentucky|wku|hilltoppers/.test(name)) return false;
  if (/^kentucky(?:\s+(?:wildcats|football|basketball|volleyball|hockey))?$/.test(name)) return true;
  return favorites.some(favorite => name.includes(favorite));
};
const relevantGame = (game: Game) => familyTeam(game.home) || familyTeam(game.away);
const cup = /fa cup|carabao|efl cup|league cup|champions league|europa league|conference league|playoff|tournament|world series|stanley cup|march madness/i;
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(value)) : "Date TBD";

export default function SportsBuzz() {
  const [games, setGames] = useState<Game[]>([]);
  const [news, setNews] = useState<NewsStory[]>([]);
  const [newsAvailable, setNewsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showCinderella, setShowCinderella] = useState(true);
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
    async function refreshNews() {
      try { const response = await fetch("/api/sports-buzz-news"); if (!response.ok) throw new Error("News unavailable"); const data = await response.json(); if (active) { setNews(Array.isArray(data.stories) ? data.stories : []); setNewsAvailable(Boolean(data.available)); } }
      catch { if (active) setNewsAvailable(false); }
    }
    void refreshNews();
    void refresh();
    const timer = setInterval(() => { void refresh(); void refreshNews(); }, 15 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const stories = useMemo(() => {
    const now = Date.now();
    return games.filter((game) => {
      if (!game.startsAt || !Number.isFinite(Date.parse(game.startsAt))) return false;
      const delta = Date.parse(game.startsAt) - now;
      const relevant = relevantGame(game);
      const knockout = cup.test(game.competition);
      const final = /final|finished|completed?|closed/i.test(game.status) && game.homeScore != null && game.awayScore != null;
      return (relevant || knockout) && (final ? delta > -7 * 86400000 && delta <= 0 : delta > 0 && delta < 4 * 86400000);
    }).sort((a,b) => {
      const score = (g: Game) => (relevantGame(g) ? 100 : 0) + (cup.test(g.competition) ? 30 : 0) + (/final|finished|completed?|closed/i.test(g.status) ? 20 : 0);
      return score(b)-score(a) || Math.abs(Date.parse(a.startsAt!)-now)-Math.abs(Date.parse(b.startsAt!)-now);
    }).slice(0, 12);
  }, [games]);
  return <section className="mt-4 rounded-3xl border border-[#e6dfcf] bg-white p-4 shadow-sm" aria-label="Sports Buzz">
    <div className="flex items-center justify-between gap-2"><div><div className="text-xs font-black uppercase tracking-widest text-[#8a6b1e]">🏆 Souther Ladies</div><h2 className="text-xl font-black text-[#06284a]">The Sports Buzz</h2></div><span className="rounded-full bg-[#f8f0d9] px-3 py-1 text-xs font-bold text-[#725719]">Auto-updating</span></div>
    <p className="mt-1 text-xs text-slate-500">Important games and what they mean, based on the latest synced results. Refreshes while the app is open.</p>
    <article className="mt-4 rounded-2xl border border-amber-200 bg-[#fff9e9] p-4">
      <div className="text-xs font-black uppercase tracking-wider text-amber-800">🚨 Verified cup upset · Oct 27, 2026</div>
      <h3 className="mt-2 text-xl font-black text-[#06284a]">Arsenal knocked OUT by fourth-tier Fleetwood! 😭😂</h3>
      <p className="mt-2 text-base font-black text-[#06284a]">Fleetwood Town 1–1 Arsenal · Fleetwood win 5–3 on penalties</p>
      <p className="mt-3 text-sm font-semibold text-slate-700">Here's what happened:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>Aaron Loupalo-Bi gave Fleetwood a surprise lead in the 21st minute.</li>
        <li>Viktor Gyökeres equalized for Arsenal in the 50th minute.</li>
        <li>Max Dowman was sent off late in the match.</li>
        <li>Fleetwood goalkeeper Jay Lynch saved a shootout penalty, and Fleetwood advanced.</li>
      </ul>
      <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm text-slate-800"><strong>Why it matters:</strong> Fleetwood play in League Two, England's fourth tier, and were 84 places below Arsenal in the football pyramid. Arsenal are out of the Carabao Cup, but this doesn't eliminate them from the Premier League, Champions League, or FA Cup. Fleetwood reach the quarter-finals for the first time!</div>
      <p className="mt-3 text-sm font-bold text-[#84651a]">🏆 Cinderella Watch: Our Arsenal became the giant that got killed. 😭</p>
      <a className="mt-3 inline-block text-sm font-bold text-blue-800 underline" href="https://www.efl.com/news/2026/october/28/carabao-cup--fleetwood-town-shock-arsenal-in-shootout-win/" target="_blank" rel="noopener noreferrer">Read the official EFL match report ↗</a>
      <p className="mt-2 text-xs text-slate-500">Verified editorial feature · Published Oct 28. Match results below refresh automatically; this article does not auto-update.</p>
    </article>
    <div className="mt-4 rounded-2xl border border-slate-200 bg-[#f7f9fd] p-4">
      <h3 className="text-lg font-black text-[#06284a]">🗞️ Latest family sports headlines</h3>
      <p className="mt-1 text-xs text-slate-500">Fresh articles from published news sources, checked every 15 minutes while the app is open. Tap to read the full reporting. Headlines are not independently verified match summaries.</p>
      {news.length ? <div className="mt-3 space-y-3">{news.slice(0, 10).map(story => <article key={story.link + story.topic} className="rounded-xl bg-white p-3 shadow-sm">
        <div className="text-xs font-black text-[#84651a]">{story.topic} · {story.source}</div>
        <a href={story.link} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-bold text-[#06284a] underline decoration-slate-300 underline-offset-2">{story.title}</a>
        <p className="mt-1 text-xs text-slate-500">{new Date(story.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
      </article>)}</div> : <p className="mt-3 text-sm text-slate-500">{newsAvailable ? "Checking the latest sports reporting…" : "News sources are temporarily unavailable. Game scores below still work."}</p>}
    </div>
    <div className="mt-4 rounded-2xl border border-amber-200 bg-[#fff9e9] p-4">
      <div className="text-xs font-black uppercase tracking-wider text-amber-800">✨ Beyond the scoreboard</div>
      <h3 className="mt-1 text-lg font-black text-[#06284a]">Why this game matters</h3>
      <p className="mt-1 text-sm text-slate-700">Cup soccer is different from league soccer: a knockout defeat can end a team's run in that competition, without ending their Premier League or other campaigns. Some cups use two legs or extra time, so we'll avoid declaring a team eliminated until the result confirms it.</p>
    </div>
    <div className="mt-3 rounded-2xl border border-slate-200 bg-[#f7f9fd] p-4">
      <button type="button" onClick={() => setShowCinderella(v => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="text-base font-black text-[#06284a]">🏆 Cinderella Watch</span>
        <span className="text-xs font-bold text-[#84651a]">{showCinderella ? "Hide" : "Explore"}</span>
      </button>
      {showCinderella && <div className="mt-2 space-y-2 text-sm text-slate-700">
        <p>Keep an eye on smaller clubs reaching later rounds of the FA Cup — especially when they draw a Premier League opponent.</p>
        <p><strong>What's a giant-killing?</strong> When a lower-division team beats a much higher-division club in a cup tie.</p>
        <p><strong>Why it's exciting:</strong> One surprise win can send an underdog into the next round. We only label a specific result a giant-killing after confirming the teams' levels and the outcome.</p>
      </div>}
    </div>
    {stories.length === 0 ? <p className="mt-4 text-sm text-slate-500">{loading ? "Checking the latest games…" : "No major games to highlight right now. Check back soon!"}</p> : <div className="mt-3 space-y-3">
      {(expanded ? stories : stories.slice(0,3)).map((g) => {
        const final = /final|finished|completed?|closed/i.test(g.status) && g.homeScore != null && g.awayScore != null;
        const knockout = cup.test(g.competition);
        const draw = final && g.homeScore === g.awayScore;
        const winner = final && !draw ? (g.homeScore! > g.awayScore! ? g.home : g.away) : null;
        return <article key={g.id} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#84651a]"><span>{knockout ? "🏆 Cup / tournament" : "⭐ Family team"}</span><span className="text-slate-400">· {dateLabel(g.startsAt)}</span></div>
          <h3 className="mt-1 text-lg font-black text-[#06284a]">{final ? (winner ? (familyTeam(winner) ? winner + " take the win! 🎉" : (relevantGame(g) ? "A tough result for our family team 😭" : winner + " win!")) : "A dramatic draw! 🤝") : "Coming up: " + g.home + " vs " + g.away}</h3>
          <p className="mt-2 font-bold text-[#06284a]">{g.home} {final ? g.homeScore : "vs"} {final ? "– " + g.awayScore : ""} {g.away}</p>
          <p className="text-xs font-semibold text-slate-500">{g.competition}</p>
          <p className="mt-3 text-sm text-slate-700"><strong>Here's what happened: </strong>{final ? (winner ? winner + " finished ahead on the recorded score." : "The teams finished level on the recorded score.") : "This match is coming up. We'll update the story after the result."}</p>
          <p className="mt-2 text-sm text-slate-700"><strong>Why it matters: </strong>{final && knockout && winner ? winner + " won the recorded match. In a single-leg knockout, the winner advances; multi-leg ties and some formats work differently." : draw && knockout ? "Level at full time. Extra time, penalties, or another leg may decide who advances." : final ? "Final result recorded. League standings or tournament implications depend on the competition." : knockout ? "An upcoming cup or tournament game — advancement rules depend on the round and competition." : "Upcoming game involving a family favorite."}</p>
          {relevantGame(g) && <p className="mt-2 text-xs font-bold text-[#84651a]">💛 A game involving one of our family teams</p>}
        </article>;
      })}
      {stories.length > 3 && <button type="button" onClick={() => setExpanded(v => !v)} className="w-full rounded-xl bg-[#06284a] px-4 py-2 text-sm font-bold text-white">{expanded ? "Show fewer stories" : "See all " + stories.length + " stories"}</button>}
    </div>}
  </section>;
}
