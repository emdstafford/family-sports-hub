import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

type GameRow = {
  id: string;
  starts_at: string;
  start_time_tbd: boolean | null;
  status: string | null;
  home_team_id: string;
  away_team_id: string;
  sport_id: string;
  competition_id: string | null;
  external_provider: string | null;
  source_notes: string | null;
};

type RankingRow = { team_name: string; rank: number; season: number; week: number };
type ExistingRow = { game_id: string; selection_source: "manual" | "auto"; selection_reason: string | null };
type Candidate = { game: GameRow; home: string; away: string; sport: string; homeRank: number | null; awayRank: number | null; score: number; mandatory: boolean; reason: string };

const TARGET_GAMES = 10;
function normalize(value: string) { return value.toLowerCase().replace(/\b(fc|afc)\b/g, "").replace(/[^a-z0-9]/g, ""); }
function exactTeam(name: string, target: string) { return normalize(name) === normalize(target); }
function isChallengeSoccerTeam(name: string) { return ["Arsenal", "Liverpool", "Aston Villa"].some((team) => exactTeam(name, team)); }
function isKentucky(name: string) { const n = normalize(name); return n === "kentucky" || n === "kentuckywildcats"; }
function isGeorgia(name: string) { const n = normalize(name); return n === "georgia" || n === "georgiabulldogs"; }
function getRank(name: string, rankingMap: Map<string, number>) {
  const n = normalize(name); const exact = rankingMap.get(n); if (exact !== undefined) return exact;
  for (const [team, rank] of rankingMap.entries()) if (n.startsWith(team) || team.startsWith(n)) return rank;
  return null;
}
function isFinal(status: string | null) { return ["final", "completed", "finished", "closed"].includes((status ?? "").toLowerCase()); }

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseSecretKey) return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
    const supabase = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekday = todayUtc.getUTCDay();
    const weekStart = new Date(todayUtc); weekStart.setUTCDate(weekStart.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); weekEnd.setUTCHours(23, 59, 59, 999);

    const { data: recentChallenge, error: recentError } = await supabase.from("challenges").select("*").order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (recentError) throw recentError;
    if (!recentChallenge?.family_id) return NextResponse.json({ error: "No FamBam family challenge was found." }, { status: 404 });
    await supabase.from("challenges").update({ status: "complete", updated_at: now.toISOString() }).eq("status", "open").lt("ends_at", weekStart.toISOString());

    const { data: current, error: currentError } = await supabase.from("challenges").select("*").eq("family_id", recentChallenge.family_id).gte("starts_at", weekStart.toISOString()).lte("starts_at", weekEnd.toISOString()).order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (currentError) throw currentError;
    let challenge = current;
    if (!challenge?.id) {
      const format = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const { data, error } = await supabase.from("challenges").insert({ family_id: recentChallenge.family_id, name: `FamBam Challenge · ${format(weekStart)}–${format(weekEnd)}`, description: "Weekly FamBam Sports Challenge", starts_at: weekStart.toISOString(), ends_at: weekEnd.toISOString(), status: "open" }).select("*").single();
      if (error) throw error; challenge = data;
    } else if (challenge.status !== "open") {
      const { data, error } = await supabase.from("challenges").update({ status: "open", updated_at: now.toISOString() }).eq("id", challenge.id).select("*").single();
      if (error) throw error; challenge = data;
    }

    // The Challenge card resets Monday, but weekend games can extend into Sunday night UTC/Monday UTC.
    // Search through the end of the current Monday-Sunday sports week plus a small overnight buffer,
    // rather than trusting an older challenge.ends_at timestamp that may cut off valid games.
    const selectionWindowEnd = new Date(weekEnd); selectionWindowEnd.setUTCHours(selectionWindowEnd.getUTCHours() + 8);
    const footballSyncResponse = await fetch(new URL("/api/college-football/espn/import", request.url), { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" });
    const importWarnings: string[] = [];
    if (!footballSyncResponse.ok) importWarnings.push(`College football refresh failed: ${await footballSyncResponse.text()}`);

    const [gamesResult, teamsResult, sportsResult, rankingsResult, existingResult, picksResult] = await Promise.all([
      supabase.from("games").select("id,starts_at,start_time_tbd,status,home_team_id,away_team_id,sport_id,competition_id,external_provider,source_notes").gte("starts_at", now.toISOString()).lte("starts_at", selectionWindowEnd.toISOString()).order("starts_at", { ascending: true }),
      supabase.from("teams").select("id,name"), supabase.from("sports").select("id,name"),
      supabase.from("college_football_rankings").select("team_name,rank,season,week").eq("poll", "AP Top 25").order("season", { ascending: false }).order("week", { ascending: false }).order("rank", { ascending: true }),
      supabase.from("challenge_games").select("game_id,selection_source,selection_reason").eq("challenge_id", challenge.id),
      supabase.from("player_picks").select("game_id").eq("challenge_id", challenge.id),
    ]);
    for (const result of [gamesResult, teamsResult, sportsResult, rankingsResult, existingResult, picksResult]) if (result.error) throw result.error;

    const existing = (existingResult.data ?? []) as ExistingRow[];
    let picks = (picksResult.data ?? []) as { game_id: string }[];
    const resetRequested = new URL(request.url).searchParams.get("reset") === "true";
    if (resetRequested && picks.length > 0) { const { error } = await supabase.from("player_picks").delete().eq("challenge_id", challenge.id); if (error) throw error; picks = []; }
    if (picks.length > 0) return NextResponse.json({ success: true, locked: true, reason: "Challenge already has family picks.", challenge: { id: challenge.id, name: challenge.name ?? challenge.title ?? "FamBam Challenge" }, existingCount: existing.length });
    const reset = resetRequested || picks.length === 0;

    const teamMap = new Map((teamsResult.data ?? []).map((row) => [row.id, row.name]));
    const sportMap = new Map((sportsResult.data ?? []).map((row) => [row.id, row.name]));
    const rankingRows = (rankingsResult.data ?? []) as RankingRow[];
    const latestSeason = rankingRows[0]?.season; const latestWeek = rankingRows[0]?.week;
    const rankingMap = new Map(rankingRows.filter((row) => row.season === latestSeason && row.week === latestWeek).map((row) => [normalize(row.team_name), row.rank]));
    const candidates: Candidate[] = []; const fallbackCandidates: Candidate[] = [];

    for (const game of (gamesResult.data ?? []) as GameRow[]) {
      const normalizedStatus = String(game.status ?? "").toLowerCase(); const notes = String(game.source_notes ?? "").toLowerCase();
      if (isFinal(game.status) || ["postponed", "cancelled", "canceled", "suspended"].some((value) => normalizedStatus.includes(value) || notes.includes(value))) continue;
      const home = teamMap.get(game.home_team_id); const away = teamMap.get(game.away_team_id); const sport = sportMap.get(game.sport_id);
      if (!home || !away || !sport) continue;

      if (sport === "Soccer") {
        if (!isChallengeSoccerTeam(home) && !isChallengeSoccerTeam(away)) continue;
        candidates.push({ game, home, away, sport, homeRank: null, awayRank: null, score: 2000, mandatory: true, reason: "Arsenal/Liverpool/Aston Villa" });
        continue;
      }
      if (sport !== "College Football" || game.external_provider !== "espn-cfb") continue;

      const homeRank = getRank(home, rankingMap); const awayRank = getRank(away, rankingMap);
      let score = 30; let mandatory = false; let worthy = false; let reason = "Best available college football game";
      if (isKentucky(home) || isKentucky(away)) { mandatory = true; worthy = true; score += 1800; reason = "Kentucky football"; }
      else if (isGeorgia(home) || isGeorgia(away)) { mandatory = true; worthy = true; score += 1750; reason = "Georgia football"; }
      const topTen = (homeRank !== null && homeRank <= 10) || (awayRank !== null && awayRank <= 10);
      if (topTen) { worthy = true; score += 900; if (reason === "Best available college football game") { const rank = homeRank !== null && homeRank <= 10 ? homeRank : awayRank; reason = `AP Top 10 team (#${rank})`; } }
      if (homeRank !== null && awayRank !== null) { worthy = true; score += 700 + Math.max(0, 80 - homeRank - awayRank); if (reason === "Best available college football game") reason = `Big ranked matchup: #${awayRank} vs #${homeRank}`; }
      const rivalryPairs = [["iowa","iowa state"],["missouri","kansas"],["ohio state","michigan"],["alabama","auburn"],["georgia","georgia tech"],["kentucky","louisville"],["texas","oklahoma"],["florida","georgia"],["usc","notre dame"]];
      const rivalry = rivalryPairs.some(([a,b]) => (normalize(home).startsWith(normalize(a)) && normalize(away).startsWith(normalize(b))) || (normalize(home).startsWith(normalize(b)) && normalize(away).startsWith(normalize(a))));
      if (rivalry) { worthy = true; score += 500; if (reason === "Best available college football game") reason = "Big rivalry game"; }
      const candidate = { game, home, away, sport, homeRank, awayRank, score, mandatory, reason };
      if (worthy) candidates.push(candidate); else fallbackCandidates.push(candidate);
    }

    const sortCandidates = (a: Candidate, b: Candidate) => { if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1; if (b.score !== a.score) return b.score - a.score; return new Date(a.game.starts_at).getTime() - new Date(b.game.starts_at).getTime(); };
    candidates.sort(sortCandidates); fallbackCandidates.sort(sortCandidates);
    const protectedIds = new Set<string>(picks.map((pick) => pick.game_id));
    if (!reset) for (const row of existing) if (row.selection_source === "manual") protectedIds.add(row.game_id);
    const selected: Candidate[] = [];
    const fillFrom = (pool: Candidate[]) => { for (const candidate of pool) { if (protectedIds.has(candidate.game.id) || selected.some((row) => row.game.id === candidate.game.id)) continue; if (protectedIds.size + selected.length >= TARGET_GAMES) break; selected.push(candidate); } };
    fillFrom(candidates); fillFrom(fallbackCandidates);

    const desiredIds = new Set([...protectedIds, ...selected.map((row) => row.game.id)]);
    const removeIds = existing.filter((row) => !desiredIds.has(row.game_id)).map((row) => row.game_id);
    if (removeIds.length) { const { error } = await supabase.from("challenge_games").delete().eq("challenge_id", challenge.id).in("game_id", removeIds); if (error) throw error; }
    const remainingExisting = new Set(existing.filter((row) => !removeIds.includes(row.game_id)).map((row) => row.game_id));
    const rowsToInsert = selected.filter((row) => !remainingExisting.has(row.game.id)).map((row) => ({ challenge_id: challenge.id, game_id: row.game.id, selection_source: "auto" as const, selection_reason: row.reason }));
    if (rowsToInsert.length) { const { error } = await supabase.from("challenge_games").insert(rowsToInsert); if (error) throw error; }
    if (reset) for (const row of selected) if (remainingExisting.has(row.game.id)) { const { error } = await supabase.from("challenge_games").update({ selection_source: "auto", selection_reason: row.reason }).eq("challenge_id", challenge.id).eq("game_id", row.game.id); if (error) throw error; }

    return NextResponse.json({ success: true, mode: reset ? "reset" : "weekly", challenge: { id: challenge.id, name: challenge.name ?? challenge.title ?? "FamBam Challenge" }, target: TARGET_GAMES, selectedCount: selected.length, protectedCount: protectedIds.size, removedCount: removeIds.length, addedCount: rowsToInsert.length, importWarnings, selectionWindowEnd: selectionWindowEnd.toISOString(), selectedGames: selected.map((row) => ({ gameId: row.game.id, startsAt: row.game.starts_at, sport: row.sport, away: row.away, home: row.home, awayRank: row.awayRank, homeRank: row.homeRank, mandatory: row.mandatory, reason: row.reason })) });
  } catch (error) {
    console.error("Auto Challenge build error:", error);
    return NextResponse.json({ error: "Could not build the FamBam Challenge.", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(request: Request) { return POST(request); }
