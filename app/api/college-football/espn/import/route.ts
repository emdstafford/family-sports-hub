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
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date).replaceAll("-", "");
}

function isFamilyTeam(name: string) {
  const n = name.trim().toLowerCase();
  return n === "georgia" || n === "georgia bulldogs" || n === "kentucky" || n === "kentucky wildcats";
}

async function fetchScoreboard(date: Date) {
  const url = new URL("https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard");
  url.searchParams.set("dates", easternDate(date));
  url.searchParams.set("limit", "500");
  url.searchParams.set("groups", "80");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${easternDate(date)} failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as EspnScoreboard;
}

async function fetchDivisionITeamIds() {
  const ids = new Set<string>();
  // ESPN group 80 = FBS and 81 = FCS. Both are NCAA Division I.
  for (const group of ["80", "81"]) {
    const url = new URL("https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/teams");
    url.searchParams.set("groups", group);
    url.searchParams.set("groupType", "conference");
    url.searchParams.set("enable", "groups");
    url.searchParams.set("limit", "500");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`ESPN Division-I team list failed for group ${group} (${response.status})`);
    const body = await response.json();
    const sports = Array.isArray(body?.sports) ? body.sports : [];
    for (const sport of sports) {
      for (const league of sport?.leagues ?? []) {
        for (const item of league?.teams ?? []) {
          const id = item?.team?.id ?? item?.id;
          if (id != null) ids.add(String(id));
        }
      }
    }
  }
  return ids;
}

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !secret) return NextResponse.json({ error: "Missing Supabase server configuration." }, { status: 500 });

    const supabase = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: competition, error: competitionError } = await supabase.from("competitions").select("id, sport_id").eq("name", "NCAA Football").single();
    if (competitionError || !competition) return NextResponse.json({ error: "Could not find NCAA Football competition.", details: competitionError?.message }, { status: 500 });
    const competitionId = competition.id as string;
    const sportId = competition.sport_id as string;

    const now = new Date();
    const dates: Date[] = [];
    for (let offset = -1; offset <= 8; offset += 1) dates.push(new Date(now.getTime() + offset * 86_400_000));
    const [scoreboards, divisionITeamIds] = await Promise.all([
      Promise.all(dates.map(fetchScoreboard)),
      fetchDivisionITeamIds(),
    ]);
    if (!divisionITeamIds.size) throw new Error("ESPN returned no Division-I team IDs; refusing to import an unfiltered slate.");

    const eventMap = new Map<string, EspnEvent>();
    for (const board of scoreboards) for (const event of board.events ?? []) eventMap.set(event.id, event);
    const receivedEvents = [...eventMap.values()];

    // This is the hard safety gate: BOTH teams must be FBS or FCS.
    // It prevents D-II/D-III games from ever being tagged espn-cfb again.
    const events = receivedEvents.filter((event) => {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      const homeId = home?.team?.id ? String(home.team.id) : null;
      const awayId = away?.team?.id ? String(away.team.id) : null;
      return Boolean(homeId && awayId && divisionITeamIds.has(homeId) && divisionITeamIds.has(awayId));
    });

    // Remove stale future ESPN football rows first. The Challenge can then only see
    // the freshly verified Division-I rows inserted below.
    const cleanup = await supabase
      .from("games")
      .delete()
      .eq("external_provider", "espn-cfb")
      .gte("starts_at", new Date(now.getTime() - 86_400_000).toISOString());
    if (cleanup.error) throw new Error(`Could not remove stale ESPN football games: ${cleanup.error.message}`);

    const teamCache = new Map<string, string>();
    async function teamId(team: EspnTeam) {
      const externalId = String(team.id ?? "");
      const name = team.displayName || team.shortDisplayName || team.abbreviation || "Unknown";
      const key = externalId || name.toLowerCase();
      if (teamCache.has(key)) return teamCache.get(key)!;
      const existing = await supabase.from("teams").select("id").eq("sport_id", sportId).ilike("name", name).limit(1).maybeSingle();
      if (existing.data?.id) { teamCache.set(key, existing.data.id); return existing.data.id; }
      const inserted = await supabase.from("teams").upsert({ sport_id: sportId, name, external_provider: "espn-cfb", external_id: externalId || key }, { onConflict: "external_provider,external_id" }).select("id").single();
      if (inserted.error || !inserted.data) throw new Error(`Could not import team ${name}: ${inserted.error?.message ?? "unknown error"}`);
      teamCache.set(key, inserted.data.id);
      return inserted.data.id;
    }

    let imported = 0;
    const familyGames: string[] = [];
    const rankings: Array<{ team_id: string; team_name: string; rank: number }> = [];
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

      const existingGame = await supabase.from("games").select("id,external_provider").eq("external_id", event.id).limit(1).maybeSingle();
      if (existingGame.error) throw new Error(`Could not check existing game ${event.id}: ${existingGame.error.message}`);

      const gameValues = {
        sport_id: sportId,
        competition_id: competitionId,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: event.date,
        start_time_tbd: false,
        home_score: home.score ? Number(home.score) : null,
        away_score: away.score ? Number(away.score) : null,
        status: completed ? "final" : "scheduled",
        source_notes: event.name ?? null,
        external_provider: "espn-cfb",
      };

      const game = existingGame.data?.id
        ? await supabase.from("games").update(gameValues).eq("id", existingGame.data.id)
        : await supabase.from("games").insert({ ...gameValues, external_id: event.id });
      if (game.error) throw new Error(`Could not import ${awayName} at ${homeName}: ${game.error.message}`);
      imported += 1;
      if (isFamilyTeam(homeName) || isFamilyTeam(awayName)) familyGames.push(`${awayName} at ${homeName}`);
      const homeRank = home.curatedRank?.current;
      const awayRank = away.curatedRank?.current;
      if (homeRank && homeRank <= 25) rankings.push({ team_id: homeId, team_name: homeName, rank: homeRank });
      if (awayRank && awayRank <= 25) rankings.push({ team_id: awayId, team_name: awayName, rank: awayRank });
    }

    if (rankings.length) {
      const season = now.getUTCFullYear();
      const week = 99;
      const deleteResult = await supabase.from("college_football_rankings").delete().eq("season", season).eq("week", week);
      if (deleteResult.error) throw new Error(`Could not replace ESPN rankings: ${deleteResult.error.message}`);
      const unique = [...new Map(rankings.map((r) => [r.team_id, r])).values()];
      const rankWrite = await supabase.from("college_football_rankings").insert(unique.map((r) => ({ season, week, poll: "AP Top 25", team_id: r.team_id, team_name: r.team_name, rank: r.rank })));
      if (rankWrite.error) throw new Error(`Could not save ESPN rankings: ${rankWrite.error.message}`);
    }

    if (!imported) return NextResponse.json({ error: "ESPN returned no verified Division-I college-football games; Challenge rebuild should not proceed." }, { status: 502 });
    return NextResponse.json({
      success: true,
      source: "espn",
      scope: "NCAA Division I only (FBS + FCS); D-II/D-III blocked by team ID",
      datesQueried: dates.map(easternDate),
      eventsReceived: receivedEvents.length,
      divisionIEventsKept: events.length,
      excludedNonDivisionI: receivedEvents.length - events.length,
      gamesImported: imported,
      familyGames,
      rankedTeamsFound: rankings.length,
    });
  } catch (error) {
    return NextResponse.json({ error: "ESPN college-football import failed.", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
