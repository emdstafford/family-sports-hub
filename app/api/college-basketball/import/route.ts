import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

type EspnTeam = { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string };
type EspnCompetitor = { homeAway?: "home" | "away"; score?: string; team?: EspnTeam };
type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  status?: { type?: { completed?: boolean } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
};

function easternDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const KENTUCKY_EXHIBITIONS = [
  {
    id: "big-blue-madness-2026",
    startsAt: "2026-10-02T23:00:00.000Z",
    startTimeTbd: false,
    home: "Blue",
    away: "White",
    note: "BIG BLUE MADNESS · Blue vs White intrasquad exhibition. A preseason Kentucky event that does not count toward the regular-season record. · Rupp Arena at Central Bank Center",
  },
  {
    id: "little-rock-2026",
    startsAt: "2026-10-16T16:00:00.000Z",
    startTimeTbd: true,
    home: "Kentucky",
    away: "Little Rock",
    note: "EXHIBITION · This preseason game does not count toward Kentucky's regular-season record. · Rupp Arena at Central Bank Center",
  },
  {
    id: "texas-tech-2026",
    startsAt: "2026-10-23T16:00:00.000Z",
    startTimeTbd: true,
    home: "Kentucky",
    away: "Texas Tech",
    note: "EXHIBITION · This preseason game does not count toward Kentucky's regular-season record. · Rupp Arena at Central Bank Center",
  },
  {
    id: "ucf-2026",
    startsAt: "2026-10-28T16:00:00.000Z",
    startTimeTbd: true,
    home: "Kentucky",
    away: "UCF",
    note: "EXHIBITION · This preseason game does not count toward Kentucky's regular-season record. · Rupp Arena at Central Bank Center",
  },
] as const;

async function fetchScoreboard(date: Date) {
  const url = new URL("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard");
  url.searchParams.set("dates", easternDate(date));
  url.searchParams.set("groups", "50");
  url.searchParams.set("limit", "500");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`ESPN men's basketball ${easternDate(date)} failed (${response.status})`);
  return await response.json();
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

    const sportResult = await supabase
      .from("sports")
      .select("id,name")
      .eq("name", "College Basketball")
      .single();

    if (sportResult.error || !sportResult.data) {
      return NextResponse.json(
        { error: 'Could not find the "College Basketball" sport.', details: sportResult.error?.message ?? null },
        { status: 500 },
      );
    }

    const sport = sportResult.data;
    const competitionResult = await supabase
      .from("competitions")
      .select("id,sport_id,name")
      .eq("sport_id", sport.id)
      .limit(1)
      .maybeSingle();

    if (competitionResult.error) {
      return NextResponse.json(
        { error: "Could not load college-basketball competition.", details: competitionResult.error.message },
        { status: 500 },
      );
    }

    let competition = competitionResult.data;
    if (!competition) {
      const created = await supabase
        .from("competitions")
        .insert({ sport_id: sport.id, name: "NCAA Division I Men's Basketball" })
        .select("id,sport_id,name")
        .single();
      if (created.error || !created.data) {
        return NextResponse.json(
          { error: "Could not create college-basketball competition.", details: created.error?.message ?? null },
          { status: 500 },
        );
      }
      competition = created.data;
    }

    const now = new Date();
    const dates: Date[] = [];
    for (let offset = -1; offset <= 7; offset += 1) {
      dates.push(new Date(now.getTime() + offset * 86_400_000));
    }

    // Fetch all D-I dates in parallel. During the regular season this avoids the
    // old one-date-at-a-time importer taking several minutes.
    const scoreboards = await Promise.all(dates.map(fetchScoreboard));
    const events = new Map<string, EspnEvent>();
    for (const body of scoreboards) {
      for (const event of Array.isArray(body?.events) ? body.events : []) {
        if (event?.id) events.set(String(event.id), event);
      }
    }

    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from("teams")
      .select("id,name,external_provider,external_id")
      .eq("sport_id", sport.id);
    if (existingTeamsError) throw new Error(`Could not load basketball teams: ${existingTeamsError.message}`);

    const teamIdByProviderExternal = new Map<string, string>();
    const teamIdByName = new Map<string, string>();
    for (const row of existingTeams ?? []) {
      if (row.external_provider && row.external_id) {
        teamIdByProviderExternal.set(`${row.external_provider}:${String(row.external_id)}`, row.id);
      }
      if (row.name) teamIdByName.set(normalize(row.name), row.id);
    }

    const providerTeams = new Map<string, { externalId: string; name: string; provider: string }>();

    for (const event of events.values()) {
      for (const competitor of event.competitions?.[0]?.competitors ?? []) {
        const team = competitor.team;
        const externalId = String(team?.id ?? "");
        const name = team?.displayName || team?.shortDisplayName || team?.abbreviation || "";
        if (externalId && name) providerTeams.set(`espn-mbb:${externalId}`, { externalId, name, provider: "espn-mbb" });
      }
    }

    for (const exhibition of KENTUCKY_EXHIBITIONS) {
      for (const name of [exhibition.home, exhibition.away]) {
        const externalId = `ukathletics-mbb-${normalize(name).replace(/ /g, "-")}`;
        providerTeams.set(`ukathletics-mbb:${externalId}`, { externalId, name, provider: "ukathletics-mbb" });
      }
    }

    const missingTeams = [...providerTeams.values()].filter(
      (team) => !teamIdByProviderExternal.has(`${team.provider}:${team.externalId}`) && !teamIdByName.has(normalize(team.name)),
    );

    if (missingTeams.length) {
      const { data: inserted, error: insertError } = await supabase
        .from("teams")
        .upsert(
          missingTeams.map((team) => ({
            sport_id: sport.id,
            name: team.name,
            external_provider: team.provider,
            external_id: team.externalId,
          })),
          { onConflict: "external_provider,external_id" },
        )
        .select("id,name,external_id");
      if (insertError) throw new Error(`Could not import basketball teams: ${insertError.message}`);
      for (const row of inserted ?? []) {
        if (row.external_id) {
          const provider = missingTeams.find((team) => team.externalId === String(row.external_id))?.provider;
          if (provider) teamIdByProviderExternal.set(`${provider}:${String(row.external_id)}`, row.id);
        }
        if (row.name) teamIdByName.set(normalize(row.name), row.id);
      }
    }

    for (const team of providerTeams.values()) {
      const key = `${team.provider}:${team.externalId}`;
      if (!teamIdByProviderExternal.has(key)) {
        const id = teamIdByName.get(normalize(team.name));
        if (id) teamIdByProviderExternal.set(key, id);
      }
    }

    const gameRows: any[] = [];

    for (const event of events.values()) {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((row) => row.homeAway === "home");
      const away = competitors.find((row) => row.homeAway === "away");
      if (!home?.team?.id || !away?.team?.id || !event.id || !event.date) continue;

      const homeId = teamIdByProviderExternal.get(`espn-mbb:${String(home.team.id)}`);
      const awayId = teamIdByProviderExternal.get(`espn-mbb:${String(away.team.id)}`);
      if (!homeId || !awayId) continue;

      gameRows.push({
        sport_id: sport.id,
        competition_id: competition.id,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: event.date,
        start_time_tbd: false,
        home_score: home.score ? Number(home.score) : null,
        away_score: away.score ? Number(away.score) : null,
        status: event.status?.type?.completed ? "final" : "scheduled",
        source_notes: event.name ?? "NCAA Division I men's basketball",
        external_provider: "espn-mbb",
        external_id: String(event.id),
      });
    }

    for (const exhibition of KENTUCKY_EXHIBITIONS) {
      const homeExternal = `ukathletics-mbb-${normalize(exhibition.home).replace(/ /g, "-")}`;
      const awayExternal = `ukathletics-mbb-${normalize(exhibition.away).replace(/ /g, "-")}`;
      const homeId = teamIdByProviderExternal.get(`ukathletics-mbb:${homeExternal}`) ?? teamIdByName.get(normalize(exhibition.home));
      const awayId = teamIdByProviderExternal.get(`ukathletics-mbb:${awayExternal}`) ?? teamIdByName.get(normalize(exhibition.away));
      if (!homeId || !awayId) continue;

      const externalId = `kentucky-mbb-exh-${exhibition.id}`;
      gameRows.push({
        sport_id: sport.id,
        competition_id: competition.id,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: exhibition.startsAt,
        start_time_tbd: exhibition.startTimeTbd,
        home_score: null,
        away_score: null,
        status: "scheduled",
        source_notes: exhibition.note,
        external_provider: "ukathletics-mbb",
        external_id: externalId,
      });
    }

    // Preserve manually entered scores/status for Kentucky exhibitions.
    // Daily schedule sync must never erase an exhibition result that was already recorded.
    const exhibitionIds = KENTUCKY_EXHIBITIONS.map((exhibition) => `kentucky-mbb-exh-${exhibition.id}`);
    if (exhibitionIds.length) {
      const { data: existingExhibitions, error: existingExhibitionError } = await supabase
        .from("games")
        .select("external_id,home_score,away_score,status")
        .in("external_id", exhibitionIds);
      if (existingExhibitionError) {
        throw new Error(`Could not load existing Kentucky exhibitions: ${existingExhibitionError.message}`);
      }
      const existingById = new Map((existingExhibitions ?? []).map((row) => [String(row.external_id), row]));
      for (const row of gameRows) {
        if (row.external_provider !== "ukathletics-mbb") continue;
        const existing = existingById.get(String(row.external_id));
        if (!existing) continue;
        row.home_score = existing.home_score;
        row.away_score = existing.away_score;
        row.status = existing.status;
      }
    }

    if (gameRows.length) {
      const { error: gameWriteError } = await supabase
        .from("games")
        .upsert(gameRows, { onConflict: "external_id" });
      if (gameWriteError) throw new Error(`Could not save basketball slate: ${gameWriteError.message}`);
    }

    return NextResponse.json({
      success: true,
      source: "ESPN Division I + Kentucky Athletics",
      divisionIGamesImported: [...events.values()].length,
      kentuckyExhibitionsImported: KENTUCKY_EXHIBITIONS.length,
      gameRowsSaved: gameRows.length,
      exhibitionLabelsReady: true,
    });
  } catch (error) {
    console.error("College-basketball import failed:", error);
    return NextResponse.json(
      {
        error: "College-basketball import failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
