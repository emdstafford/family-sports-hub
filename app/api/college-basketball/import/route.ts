import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 180;

function easternDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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

    if (competitionResult.error || !competitionResult.data) {
      return NextResponse.json(
        { error: "Could not find a college-basketball competition.", details: competitionResult.error?.message ?? null },
        { status: 500 },
      );
    }

    const competition = competitionResult.data;
    const teamCache = new Map<string, string>();

    async function ensureTeam(name: string, provider: string, externalId?: string) {
      const cacheKey = `${provider}:${externalId ?? normalize(name)}`;
      const cached = teamCache.get(cacheKey);
      if (cached) return cached;

      const existing = await supabase
        .from("teams")
        .select("id")
        .eq("sport_id", sport.id)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();

      if (existing.error) throw new Error(`Could not look up basketball team ${name}: ${existing.error.message}`);
      if (existing.data?.id) {
        teamCache.set(cacheKey, existing.data.id);
        return existing.data.id as string;
      }

      const inserted = await supabase
        .from("teams")
        .upsert(
          {
            sport_id: sport.id,
            name,
            external_provider: provider,
            external_id: externalId ?? `${provider}-${normalize(name)}`,
          },
          { onConflict: "external_provider,external_id" },
        )
        .select("id")
        .single();

      if (inserted.error || !inserted.data?.id) {
        throw new Error(`Could not import basketball team ${name}: ${inserted.error?.message ?? "unknown error"}`);
      }

      teamCache.set(cacheKey, inserted.data.id);
      return inserted.data.id as string;
    }

    let divisionIGamesImported = 0;
    const now = new Date();

    for (let offset = -1; offset <= 9; offset += 1) {
      const date = new Date(now.getTime() + offset * 86_400_000);
      const url = new URL("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard");
      url.searchParams.set("dates", easternDate(date));
      url.searchParams.set("groups", "50");
      url.searchParams.set("limit", "500");

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`ESPN men's basketball ${easternDate(date)} failed (${response.status})`);
      }

      const body = await response.json();
      const events = Array.isArray(body?.events) ? body.events : [];

      for (const event of events) {
        const competitors = event?.competitions?.[0]?.competitors ?? [];
        const home = competitors.find((row: any) => row?.homeAway === "home");
        const away = competitors.find((row: any) => row?.homeAway === "away");
        if (!home?.team || !away?.team || !event?.id || !event?.date) continue;

        const homeName = home.team.displayName || home.team.shortDisplayName || home.team.abbreviation || "Unknown";
        const awayName = away.team.displayName || away.team.shortDisplayName || away.team.abbreviation || "Unknown";
        const homeId = await ensureTeam(homeName, "espn-mbb", String(home.team.id ?? normalize(homeName)));
        const awayId = await ensureTeam(awayName, "espn-mbb", String(away.team.id ?? normalize(awayName)));

        const existing = await supabase
          .from("games")
          .select("id")
          .eq("external_id", String(event.id))
          .limit(1)
          .maybeSingle();

        if (existing.error) throw new Error(`Could not check basketball game ${event.id}: ${existing.error.message}`);

        const values = {
          sport_id: sport.id,
          competition_id: competition.id,
          home_team_id: homeId,
          away_team_id: awayId,
          starts_at: event.date,
          start_time_tbd: false,
          home_score: home.score ? Number(home.score) : null,
          away_score: away.score ? Number(away.score) : null,
          status: event?.status?.type?.completed ? "final" : "scheduled",
          source_notes: event?.name ?? "NCAA Division I men's basketball",
          external_provider: "espn-mbb",
        };

        const write = existing.data?.id
          ? await supabase.from("games").update(values).eq("id", existing.data.id)
          : await supabase.from("games").insert({ ...values, external_id: String(event.id) });

        if (write.error) {
          throw new Error(`Could not import ${awayName} at ${homeName}: ${write.error.message}`);
        }
        divisionIGamesImported += 1;
      }
    }

    let kentuckyExhibitionsImported = 0;

    for (const exhibition of KENTUCKY_EXHIBITIONS) {
      const homeId = await ensureTeam(exhibition.home, "ukathletics-mbb");
      const awayId = await ensureTeam(exhibition.away, "ukathletics-mbb");
      const externalId = `kentucky-mbb-exh-${exhibition.id}`;

      const existing = await supabase
        .from("games")
        .select("id,status,home_score,away_score")
        .eq("external_id", externalId)
        .limit(1)
        .maybeSingle();

      if (existing.error) throw new Error(`Could not check Kentucky exhibition ${exhibition.id}: ${existing.error.message}`);

      const values = {
        sport_id: sport.id,
        competition_id: competition.id,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: exhibition.startsAt,
        start_time_tbd: exhibition.startTimeTbd,
        home_score: existing.data?.home_score ?? null,
        away_score: existing.data?.away_score ?? null,
        status: existing.data?.status ?? "scheduled",
        source_notes: exhibition.note,
        external_provider: "ukathletics-mbb",
      };

      const write = existing.data?.id
        ? await supabase.from("games").update(values).eq("id", existing.data.id)
        : await supabase.from("games").insert({ ...values, external_id: externalId });

      if (write.error) throw new Error(`Could not import Kentucky exhibition ${exhibition.id}: ${write.error.message}`);
      kentuckyExhibitionsImported += 1;
    }

    return NextResponse.json({
      success: true,
      source: "ESPN Division I + Kentucky Athletics",
      divisionIGamesImported,
      kentuckyExhibitionsImported,
      exhibitionLabelsReady: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "College-basketball import failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
