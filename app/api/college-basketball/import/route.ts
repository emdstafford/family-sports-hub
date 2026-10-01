import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 180;

type EspnTeam = { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string };
type EspnCompetitor = { homeAway?: "home" | "away"; score?: string; team?: EspnTeam };
type EspnEvent = {
  id: string;
  date: string;
  name?: string;
  status?: { type?: { completed?: boolean } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
};
type EspnScoreboard = { events?: EspnEvent[] };
type UkEvent = {
  "@type"?: string;
  startDate?: string;
  name?: string;
  location?: { name?: string };
};

function easternDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function easternWallTimeToIso(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return new Date(value).toISOString();
  const [, y, m, d, hh, mm] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(guess))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const shownAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute),
  );
  return new Date(guess - (shownAsUtc - guess)).toISOString();
}

async function fetchScoreboard(date: Date) {
  const url = new URL("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard");
  url.searchParams.set("dates", easternDate(date));
  url.searchParams.set("groups", "50");
  url.searchParams.set("limit", "500");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN men's basketball ${easternDate(date)} failed (${response.status})`);
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

    const { data: sport, error: sportError } = await supabase
      .from("sports")
      .select("id,name")
      .eq("name", "College Basketball")
      .single();
    if (sportError || !sport) {
      return NextResponse.json({ error: 'Could not find the "College Basketball" sport.', details: sportError?.message }, { status: 500 });
    }

    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id,sport_id,name")
      .eq("sport_id", sport.id)
      .order("name")
      .limit(1)
      .maybeSingle();
    if (competitionError || !competition) {
      return NextResponse.json({ error: "Could not find a college-basketball competition.", details: competitionError?.message }, { status: 500 });
    }

    const teamCache = new Map<string, string>();
    async function teamId(team: EspnTeam | { id?: string; displayName?: string }, provider = "espn-mbb") {
      const externalId = String(team.id ?? "");
      const name = team.displayName?.trim() || "Unknown";
      const key = externalId || name.toLowerCase();
      if (teamCache.has(key)) return teamCache.get(key)!;

      const existing = await supabase
        .from("teams")
        .select("id")
        .eq("sport_id", sport.id)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (existing.error) throw new Error(`Could not look up basketball team ${name}: ${existing.error.message}`);
      if (existing.data?.id) {
        teamCache.set(key, existing.data.id);
        return existing.data.id;
      }

      const inserted = await supabase
        .from("teams")
        .upsert(
          {
            sport_id: sport.id,
            name,
            external_provider: provider,
            external_id: externalId || `${provider}-${slug(name)}`,
          },
          { onConflict: "external_provider,external_id" },
        )
        .select("id")
        .single();
      if (inserted.error || !inserted.data) throw new Error(`Could not import basketball team ${name}: ${inserted.error?.message ?? "unknown error"}`);
      teamCache.set(key, inserted.data.id);
      return inserted.data.id;
    }

    const now = new Date();
    const dates: Date[] = [];
    for (let offset = -1; offset <= 9; offset += 1) {
      dates.push(new Date(now.getTime() + offset * 86_400_000));
    }

    const scoreboards = await Promise.all(dates.map(fetchScoreboard));
    const eventMap = new Map<string, EspnEvent>();
    for (const board of scoreboards) {
      for (const event of board.events ?? []) eventMap.set(event.id, event);
    }

    let espnImported = 0;
    for (const event of eventMap.values()) {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((row) => row.homeAway === "home");
      const away = competitors.find((row) => row.homeAway === "away");
      if (!home?.team || !away?.team) continue;

      const homeName = home.team.displayName || home.team.shortDisplayName || home.team.abbreviation || "Unknown";
      const awayName = away.team.displayName || away.team.shortDisplayName || away.team.abbreviation || "Unknown";
      const homeId = await teamId({ ...home.team, displayName: homeName });
      const awayId = await teamId({ ...away.team, displayName: awayName });

      const existingGame = await supabase
        .from("games")
        .select("id")
        .eq("external_id", event.id)
        .limit(1)
        .maybeSingle();
      if (existingGame.error) throw new Error(`Could not check basketball game ${event.id}: ${existingGame.error.message}`);

      const gameValues = {
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
      };

      const write = existingGame.data?.id
        ? await supabase.from("games").update(gameValues).eq("id", existingGame.data.id)
        : await supabase.from("games").insert({ ...gameValues, external_id: event.id });
      if (write.error) throw new Error(`Could not import ${awayName} at ${homeName}: ${write.error.message}`);
      espnImported += 1;
    }

    // Kentucky's official schedule includes preseason exhibitions before ESPN's
    // regular D-I scoreboard becomes useful. Import those now so FamBam can pick them.
    const ukResponse = await fetch("https://ukathletics.com/sports/mbball/schedule/", {
      cache: "no-store",
      headers: { "User-Agent": "FamBam Sports Schedule Importer" },
    });
    if (!ukResponse.ok) throw new Error(`Kentucky men's basketball schedule failed (${ukResponse.status})`);
    const html = await ukResponse.text();
    const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const ukEvents: UkEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          if (item && typeof item === "object" && item["@type"] === "Event") ukEvents.push(item as UkEvent);
        }
      } catch {}
    }

    const exhibitionEvents = ukEvents.filter((event) =>
      Boolean(event.startDate && event.name && /\(EXH\)/i.test(event.name)),
    );

    let exhibitionsImported = 0;
    for (const event of exhibitionEvents) {
      const raw = event.name?.trim() ?? "";
      const clean = raw.replace(/\s*\(EXH\)\s*/i, "").trim();
      const startsAt = event.startDate ? easternWallTimeToIso(event.startDate) : null;
      if (!startsAt) continue;

      let homeName = "Kentucky";
      let awayName = clean.replace(/^vs\.?\s*/i, "").replace(/^at\s+/i, "").trim();
      let sourceNotes = `EXHIBITION · This preseason game does not count toward Kentucky's regular-season record.`;

      if (/big blue madness/i.test(clean)) {
        homeName = "Blue";
        awayName = "White";
        sourceNotes = "BIG BLUE MADNESS · Blue vs White intrasquad exhibition. A preseason Kentucky event that does not count toward the regular-season record.";
      }

      const isAway = /^at\s+/i.test(clean);
      if (isAway && !/big blue madness/i.test(clean)) {
        homeName = awayName;
        awayName = "Kentucky";
      }

      const homeId = await teamId({ displayName: homeName }, "ukathletics-mbb");
      const awayId = await teamId({ displayName: awayName }, "ukathletics-mbb");
      const datePart = event.startDate!.slice(0, 10);
      const externalId = `kentucky-mbb-exh-${datePart}-${slug(clean)}`;

      const existingGame = await supabase
        .from("games")
        .select("id,status,home_score,away_score")
        .eq("external_id", externalId)
        .limit(1)
        .maybeSingle();
      if (existingGame.error) throw new Error(`Could not check Kentucky exhibition ${clean}: ${existingGame.error.message}`);

      const values = {
        sport_id: sport.id,
        competition_id: competition.id,
        home_team_id: homeId,
        away_team_id: awayId,
        starts_at: startsAt,
        start_time_tbd: /TBA/i.test(event.startDate ?? ""),
        home_score: existingGame.data?.home_score ?? null,
        away_score: existingGame.data?.away_score ?? null,
        status: existingGame.data?.status ?? "scheduled",
        source_notes: `${sourceNotes} · ${event.location?.name ?? "Rupp Arena"}`,
        external_provider: "ukathletics-mbb",
      };

      const write = existingGame.data?.id
        ? await supabase.from("games").update(values).eq("id", existingGame.data.id)
        : await supabase.from("games").insert({ ...values, external_id: externalId });
      if (write.error) throw new Error(`Could not import Kentucky exhibition ${clean}: ${write.error.message}`);
      exhibitionsImported += 1;
    }

    return NextResponse.json({
      success: true,
      source: "ESPN Division I + Kentucky Athletics",
      datesQueried: dates.map(easternDate),
      divisionIGamesImported: espnImported,
      kentuckyExhibitionsImported: exhibitionsImported,
      kentuckyExhibitionsFound: exhibitionEvents.length,
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
