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

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isFamilyTeam(name: string) {
  const n = normalizeName(name);
  return ["georgia", "georgia bulldogs", "kentucky", "kentucky wildcats"].includes(n);
}

async function fetchDivisionIScoreboard(date: Date, group: "80" | "81") {
  const url = new URL("https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard");
  url.searchParams.set("dates", easternDate(date));
  url.searchParams.set("limit", "500");
  url.searchParams.set("groups", group);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    throw new Error(`ESPN ${easternDate(date)} group ${group} failed (${response.status})`);
  }
  return (await response.json()) as EspnScoreboard;
}

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !secret) {
      return NextResponse.json({ error: "Missing Supabase server configuration." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id,sport_id")
      .eq("name", "NCAA Football")
      .single();

    if (competitionError || !competition) {
      return NextResponse.json(
        { error: "Could not find NCAA Football competition.", details: competitionError?.message },
        { status: 500 },
      );
    }

    const competitionId = competition.id as string;
    const sportId = competition.sport_id as string;
    const now = new Date();

    // Challenge only needs the current weekly window. Pulling ten full days of
    // FBS + FCS and then writing every row one at a time was timing out Vercel.
    const dates: Date[] = [];
    for (let offset = -1; offset <= 7; offset += 1) {
      dates.push(new Date(now.getTime() + offset * 86_400_000));
    }

    const boards = await Promise.all(
      dates.flatMap((date) => [
        fetchDivisionIScoreboard(date, "80"),
        fetchDivisionIScoreboard(date, "81"),
      ]),
    );

    const eventMap = new Map<string, EspnEvent>();
    for (const board of boards) {
      for (const event of board.events ?? []) eventMap.set(String(event.id), event);
    }
    const events = [...eventMap.values()];

    if (!events.length) {
      return NextResponse.json(
        { error: "ESPN returned no FBS/FCS games; existing Challenge data was left untouched." },
        { status: 502 },
      );
    }

    const providerTeams = new Map<string, { externalId: string; name: string }>();
    for (const event of events) {
      for (const competitor of event.competitions?.[0]?.competitors ?? []) {
        const team = competitor.team;
        const externalId = String(team?.id ?? "");
        const name = team?.displayName || team?.shortDisplayName || team?.abbreviation || "";
        if (externalId && name) providerTeams.set(externalId, { externalId, name });
      }
    }

    // Load the football team table once, then create only missing teams in one batch.
    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from("teams")
      .select("id,name,external_provider,external_id")
      .eq("sport_id", sportId);
    if (existingTeamsError) throw new Error(`Could not load football teams: ${existingTeamsError.message}`);

    const teamIdByExternal = new Map<string, string>();
    const teamIdByName = new Map<string, string>();
    for (const row of existingTeams ?? []) {
      if (row.external_provider === "espn-cfb" && row.external_id) {
        teamIdByExternal.set(String(row.external_id), row.id);
      }
      if (row.name) teamIdByName.set(normalizeName(row.name), row.id);
    }

    const missingTeams = [...providerTeams.values()].filter(
      (team) => !teamIdByExternal.has(team.externalId) && !teamIdByName.has(normalizeName(team.name)),
    );

    if (missingTeams.length) {
      const { data: insertedTeams, error: teamInsertError } = await supabase
        .from("teams")
        .upsert(
          missingTeams.map((team) => ({
            sport_id: sportId,
            name: team.name,
            external_provider: "espn-cfb",
            external_id: team.externalId,
          })),
          { onConflict: "external_provider,external_id" },
        )
        .select("id,name,external_id");
      if (teamInsertError) throw new Error(`Could not import football teams: ${teamInsertError.message}`);
      for (const row of insertedTeams ?? []) {
        if (row.external_id) teamIdByExternal.set(String(row.external_id), row.id);
        if (row.name) teamIdByName.set(normalizeName(row.name), row.id);
      }
    }

    // If we reused a CFBD team by name, map the ESPN ID to that existing team.
    for (const team of providerTeams.values()) {
      if (!teamIdByExternal.has(team.externalId)) {
        const id = teamIdByName.get(normalizeName(team.name));
        if (id) teamIdByExternal.set(team.externalId, id);
      }
    }

    const gameRows: any[] = [];
    const rankings: Array<{ team_id: string; team_name: string; rank: number }> = [];
    const familyGames: string[] = [];

    for (const event of events) {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home?.team?.id || !away?.team?.id || !event.date) continue;

      const homeName = home.team.displayName || home.team.shortDisplayName || home.team.abbreviation || "Unknown";
      const awayName = away.team.displayName || away.team.shortDisplayName || away.team.abbreviation || "Unknown";
      const homeId = teamIdByExternal.get(String(home.team.id));
      const awayId = teamIdByExternal.get(String(away.team.id));
      if (!homeId || !awayId) continue;

      gameRows.push({
        sport_id: sportId,
        competition_id: competitionId,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: event.date,
        start_time_tbd: false,
        home_score: home.score ? Number(home.score) : null,
        away_score: away.score ? Number(away.score) : null,
        status: event.status?.type?.completed ? "final" : "scheduled",
        source_notes: event.name ?? null,
        external_provider: "espn-cfb",
        external_id: String(event.id),
      });

      if (isFamilyTeam(homeName) || isFamilyTeam(awayName)) {
        familyGames.push(`${awayName} at ${homeName}`);
      }

      const homeRank = Number(home.curatedRank?.current);
      const awayRank = Number(away.curatedRank?.current);
      if (homeRank > 0 && homeRank <= 25) rankings.push({ team_id: homeId, team_name: homeName, rank: homeRank });
      if (awayRank > 0 && awayRank <= 25) rankings.push({ team_id: awayId, team_name: awayName, rank: awayRank });
    }

    if (!gameRows.length) {
      return NextResponse.json(
        { error: "ESPN returned no usable FBS/FCS games; existing Challenge data was left untouched." },
        { status: 502 },
      );
    }

    // Batch upsert the slate. This replaces hundreds of sequential database round trips.
    const { error: gameWriteError } = await supabase
      .from("games")
      .upsert(gameRows, { onConflict: "external_id" });
    if (gameWriteError) throw new Error(`Could not save Division-I football slate: ${gameWriteError.message}`);

    // Only remove stale ESPN rows after the fresh slate has been saved successfully.
    const cutoff = new Date(now.getTime() - 86_400_000).toISOString();
    const { data: futureEspnRows, error: staleLookupError } = await supabase
      .from("games")
      .select("id,external_id")
      .eq("external_provider", "espn-cfb")
      .gte("starts_at", cutoff);
    if (staleLookupError) throw new Error(`Could not inspect stale ESPN football rows: ${staleLookupError.message}`);

    const liveExternalIds = new Set(gameRows.map((row) => String(row.external_id)));
    const staleIds = (futureEspnRows ?? [])
      .filter((row) => row.external_id && !liveExternalIds.has(String(row.external_id)))
      .map((row) => row.id);

    if (staleIds.length) {
      const { error: staleDeleteError } = await supabase.from("games").delete().in("id", staleIds);
      if (staleDeleteError) throw new Error(`Could not remove stale ESPN football games: ${staleDeleteError.message}`);
    }

    if (rankings.length) {
      const season = now.getUTCFullYear();
      const week = 99;
      const unique = [...new Map(rankings.map((row) => [row.team_id, row])).values()];

      const { error: deleteRankError } = await supabase
        .from("college_football_rankings")
        .delete()
        .eq("season", season)
        .eq("week", week);
      if (deleteRankError) throw new Error(`Could not replace ESPN rankings: ${deleteRankError.message}`);

      const { error: rankWriteError } = await supabase
        .from("college_football_rankings")
        .insert(unique.map((row) => ({
          season,
          week,
          poll: "AP Top 25",
          team_id: row.team_id,
          team_name: row.team_name,
          rank: row.rank,
        })));
      if (rankWriteError) throw new Error(`Could not save ESPN rankings: ${rankWriteError.message}`);
    }

    return NextResponse.json({
      success: true,
      source: "espn",
      scope: "NCAA Division I only: ESPN groups 80 (FBS) + 81 (FCS)",
      datesQueried: dates.map(easternDate),
      divisionIGamesImported: gameRows.length,
      staleGamesRemoved: staleIds.length,
      familyGames,
      rankedTeamsFound: rankings.length,
    });
  } catch (error) {
    console.error("ESPN college-football import failed:", error);
    return NextResponse.json(
      { error: "ESPN college-football import failed.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
