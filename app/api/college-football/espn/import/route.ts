import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

type EspnTeam = { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string };
type EspnCompetitor = { homeAway?: "home" | "away"; score?: string; team?: EspnTeam; curatedRank?: { current?: number } };
type EspnEvent = {
  id: string;
  date: string;
  name?: string;
  status?: { type?: { completed?: boolean; state?: string; name?: string } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
};

type EspnScoreboard = { events?: EspnEvent[] };

function easternDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function isFamilyTeam(name: string) {
  const n = name.trim().toLowerCase();
  return n === "georgia" || n === "georgia bulldogs" || n === "kentucky" || n === "kentucky wildcats";
}

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !secret) return NextResponse.json({ error: "Missing Supabase server configuration." }, { status: 500 });

    const supabase = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: competition, error: competitionError } = await supabase
      .from("competitions").select("id, sport_id").eq("name", "NCAA Football").single();
    if (competitionError || !competition) return NextResponse.json({ error: "Could not find NCAA Football competition.", details: competitionError?.message }, { status: 500 });

    const now = new Date();
    const start = new Date(now.getTime() - 2 * 86_400_000);
    const end = new Date(now.getTime() + 12 * 86_400_000);
    const url = new URL("https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard");
    url.searchParams.set("dates", `${easternDate(start)}-${easternDate(end)}`);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("groups", "80");

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "ESPN college-football request failed.", status: response.status, details: await response.text() }, { status: response.status });
    const payload = (await response.json()) as EspnScoreboard;
    const events = payload.events ?? [];

    const teamCache = new Map<string, string>();
    async function teamId(team: EspnTeam) {
      const externalId = String(team.id ?? "");
      const name = team.displayName || team.shortDisplayName || team.abbreviation || "Unknown";
      const key = externalId || name.toLowerCase();
      if (teamCache.has(key)) return teamCache.get(key)!;

      // Reuse by name first so ESPN does not create a second Georgia/Kentucky beside CFBD.
      const existing = await supabase.from("teams").select("id").eq("sport_id", competition.sport_id).ilike("name", name).limit(1).maybeSingle();
      if (existing.data?.id) { teamCache.set(key, existing.data.id); return existing.data.id; }

      const inserted = await supabase.from("teams").upsert({
        sport_id: competition.sport_id,
        name,
        external_provider: "espn-cfb",
        external_id: externalId || key,
      }, { onConflict: "external_provider,external_id" }).select("id").single();
      if (inserted.error || !inserted.data) throw new Error(`Could not import team ${name}: ${inserted.error?.message ?? "unknown error"}`);
      teamCache.set(key, inserted.data.id);
      return inserted.data.id;
    }

    let imported = 0;
    const familyGames: string[] = [];
    const rankings: Array<{ team_id: string; rank: number }> = [];

    for (const event of events) {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home?.team || !away?.team) continue;
      const homeName = home.team.displayName || home.team.shortDisplayName || "Unknown";
      const awayName = away.team.displayName || away.team.shortDisplayName || "Unknown";
      const homeId = await teamId(home.team);
      const awayId = await teamId(away.team);
      const completed = Boolean(event.status?.type?.completed);

      const game = await supabase.from("games").upsert({
        sport_id: competition.sport_id,
        competition_id: competition.id,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: event.date,
        start_time_tbd: false,
        home_score: home.score ? Number(home.score) : null,
        away_score: away.score ? Number(away.score) : null,
        status: completed ? "final" : "scheduled",
        external_provider: "espn-cfb",
        external_id: event.id,
        source_notes: event.name ?? null,
      }, { onConflict: "external_provider,external_id" });
      if (game.error) throw new Error(`Could not import ${awayName} at ${homeName}: ${game.error.message}`);
      imported += 1;
      if (isFamilyTeam(homeName) || isFamilyTeam(awayName)) familyGames.push(`${awayName} at ${homeName}`);

      const homeRank = home.curatedRank?.current;
      const awayRank = away.curatedRank?.current;
      if (homeRank && homeRank <= 25) rankings.push({ team_id: homeId, rank: homeRank });
      if (awayRank && awayRank <= 25) rankings.push({ team_id: awayId, rank: awayRank });
    }

    // ESPN exposes the current AP rank with scoreboard competitors. Store a fresh snapshot
    // using a high synthetic week so Challenge selection prefers it over stale CFBD Week 2.
    if (rankings.length) {
      const season = now.getUTCFullYear();
      const week = 99;
      await supabase.from("college_football_rankings").delete().eq("season", season).eq("week", week);
      const unique = [...new Map(rankings.map((r) => [r.team_id, r])).values()];
      const rankWrite = await supabase.from("college_football_rankings").insert(unique.map((r) => ({ season, week, poll: "AP Top 25", team_id: r.team_id, rank: r.rank })));
      if (rankWrite.error) throw new Error(`Could not save ESPN rankings: ${rankWrite.error.message}`);
    }

    return NextResponse.json({ success: true, source: "espn", eventsReceived: events.length, gamesImported: imported, familyGames, rankedTeamsFound: rankings.length });
  } catch (error) {
    return NextResponse.json({ error: "ESPN college-football import failed.", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
