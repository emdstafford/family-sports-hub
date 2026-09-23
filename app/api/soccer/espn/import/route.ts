import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type EspnTeam = {
  id: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  logo?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  winner?: boolean;
  team?: EspnTeam;
};

type EspnCompetition = {
  competitors?: EspnCompetitor[];
};

type EspnEvent = {
  id: string;
  date: string;
  name?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
  status?: {
    type?: {
      name?: string;
      state?: string;
      completed?: boolean;
      description?: string;
      detail?: string;
      shortDetail?: string;
    };
  };
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type CompetitionConfig = {
  espnSlug: string;
  fambamName: string;
};

const COMPETITIONS: CompetitionConfig[] = [
  {
    espnSlug: "eng.3",
    fambamName: "EFL League One",
  },
  {
    espnSlug: "eng.league_cup",
    fambamName: "Carabao Cup",
  },
  {
    espnSlug: "eng.fa",
    fambamName: "FA Cup",
  },
  {
    espnSlug: "eng.trophy",
    fambamName: "EFL Trophy",
  },
  {
    espnSlug: "uefa.champions",
    fambamName: "UEFA Champions League",
  },
  { espnSlug: "uefa.europa", fambamName: "UEFA Europa League" },
  { espnSlug: "uefa.europa.conf", fambamName: "UEFA Conference League" },
];

/*
 * ESPN and football-data don't always use identical club names.
 *
 * FamBam must have ONE canonical team row per club so that a favorite
 * selected on a player's profile works across every competition.
 *
 * Examples:
 *   ESPN "Arsenal"      -> existing "Arsenal FC"
 *   ESPN "Liverpool"    -> existing "Liverpool FC"
 *   ESPN "Aston Villa"  -> existing "Aston Villa FC"
 *
 * We normalize names before comparing them rather than changing the
 * football-data provider identity stored on the canonical team row.
 */
function normalizeTeamName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bfootball club\b/g, "")
    .replace(/\bfc\b/g, "")
    .replace(/\bafc\b/g, "")
    .replace(/\bthe\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseScore(value?: string) {
  if (
    value === undefined ||
    value === null ||
    value.trim() === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeStatus(event: EspnEvent) {
  const type = event.status?.type;

  if (type?.completed === true) {
    return "final";
  }

  const state = type?.state?.toLowerCase();

  if (state === "in") {
    return "live";
  }

  const name = type?.name?.toUpperCase() ?? "";

  if (
    name.includes("IN_PROGRESS") ||
    name.includes("FIRST_HALF") ||
    name.includes("SECOND_HALF") ||
    name.includes("HALFTIME") ||
    name.includes("EXTRA_TIME") ||
    name.includes("PENALTY")
  ) {
    return "live";
  }

  if (
    name.includes("FINAL") ||
    name.includes("FULL_TIME")
  ) {
    return "final";
  }

  if (
    name.includes("POSTPONED") ||
    name.includes("CANCELED") ||
    name.includes("CANCELLED") ||
    name.includes("SUSPENDED")
  ) {
    return "postponed";
  }

  return "scheduled";
}

export async function POST(request: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        {
          error:
            "Required Supabase server environment variables are missing.",
        },
        { status: 500 },
      );
    }

    const requestUrl = new URL(request.url);
    const body = await request
      .json()
      .catch(() => ({}));

    /*
     * Optional date controls:
     *
     * ?date=2026-09-15
     *
     * or
     *
     * ?start=2026-09-01&end=2026-09-30
     *
     * With no parameters, import a rolling window from 7 days ago
     * through 21 days ahead. This lets the hourly sync keep recent
     * results updated while also keeping upcoming fixtures populated.
     */
    const requestedDate =
      requestUrl.searchParams.get("date") ||
      (typeof body.date === "string"
        ? body.date
        : null);

    const requestedStart =
      requestUrl.searchParams.get("start") ||
      (typeof body.start === "string"
        ? body.start
        : null);

    const requestedEnd =
      requestUrl.searchParams.get("end") ||
      (typeof body.end === "string"
        ? body.end
        : null);

    let startDate: Date;
    let endDate: Date;

    if (requestedDate) {
      startDate = new Date(
        `${requestedDate}T00:00:00Z`,
      );
      endDate = new Date(
        `${requestedDate}T23:59:59Z`,
      );
    } else if (
      requestedStart &&
      requestedEnd
    ) {
      startDate = new Date(
        `${requestedStart}T00:00:00Z`,
      );
      endDate = new Date(
        `${requestedEnd}T23:59:59Z`,
      );
    } else {
      const now = new Date();

      startDate = new Date(now);
      startDate.setUTCDate(
        startDate.getUTCDate() - 7,
      );

      endDate = new Date(now);
      endDate.setUTCDate(
        endDate.getUTCDate() + 21,
      );
    }

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid date. Use YYYY-MM-DD.",
        },
        { status: 400 },
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          error:
            "Start date cannot be after end date.",
        },
        { status: 400 },
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    /*
     * Load every configured FamBam competition.
     */
    const competitionNames =
      COMPETITIONS.map(
        (competition) =>
          competition.fambamName,
      );

    const {
      data: competitionRows,
      error: competitionError,
    } = await supabase
      .from("competitions")
      .select("id, sport_id, name")
      .in("name", competitionNames);

    if (competitionError) {
      return NextResponse.json(
        {
          error:
            "Could not load soccer competitions.",
          details:
            competitionError.message,
        },
        { status: 500 },
      );
    }

    const competitionMap = new Map(
      (competitionRows ?? []).map(
        (competition) => [
          competition.name,
          competition,
        ],
      ),
    );

    const missingCompetitions =
      competitionNames.filter(
        (name) =>
          !competitionMap.has(name),
      );

    const soccerSportId =
      competitionRows?.[0]?.sport_id;

    if (!soccerSportId) {
      return NextResponse.json(
        {
          error:
            "Could not determine the Soccer sport ID.",
        },
        { status: 500 },
      );
    }

    // A newly supported UEFA competition may not have a row yet.
    for (const name of missingCompetitions) {
      const { data: created, error: createError } = await supabase
        .from("competitions")
        .insert({ sport_id: soccerSportId, name })
        .select("id, sport_id, name")
        .single();
      if (createError || !created) {
        return NextResponse.json(
          { error: `Could not create ${name}.`, details: createError?.message },
          { status: 500 },
        );
      }
      competitionMap.set(name, created);
    }

    /*
     * Load all existing soccer teams once.
     *
     * This is the key to preventing duplicates across providers.
     * Existing football-data teams remain canonical.
     */
    const {
      data: existingTeams,
      error: teamsError,
    } = await supabase
      .from("teams")
      .select(
        "id, sport_id, name, short_name, abbreviation, logo_url, external_provider, external_id",
      )
      .eq("sport_id", soccerSportId);

    if (teamsError) {
      return NextResponse.json(
        {
          error:
            "Could not load existing soccer teams.",
          details: teamsError.message,
        },
        { status: 500 },
      );
    }

    const teamByNormalizedName =
      new Map<string, string>();

    const teamByEspnId =
      new Map<string, string>();

    for (const team of existingTeams ?? []) {
      teamByNormalizedName.set(
        normalizeTeamName(team.name),
        team.id,
      );

      if (team.short_name) {
        teamByNormalizedName.set(
          normalizeTeamName(
            team.short_name,
          ),
          team.id,
        );
      }

      if (
        team.external_provider === "espn" &&
        team.external_id
      ) {
        teamByEspnId.set(
          String(team.external_id),
          team.id,
        );
      }
    }

    /*
     * Explicit aliases handle clubs where stripping FC/AFC alone
     * would still leave ambiguity.
     */
    const TEAM_ALIASES: Record<
      string,
      string
    > = {
      arsenal: "arsenal",
      liverpool: "liverpool",
      astonvilla: "astonvilla",
      afcwimbledon: "wimbledon",
      wimbledon: "wimbledon",
      tottenhamhotspur: "tottenham",
      tottenham: "tottenham",
      manchestercity: "mancity",
      mancity: "mancity",
      manchesterunited: "manunited",
      manunited: "manunited",
      newcastleunited: "newcastle",
      newcastle: "newcastle",
      nottinghamforest: "nottingham",
      nottingham: "nottingham",
      brightonandhovealbion:
        "brightonhove",
      brightonhove: "brightonhove",
      ipswichtown: "ipswichtown",
      sunderland: "sunderland",
      bournemouth: "bournemouth",
      afcbournemouth: "bournemouth",
    };

    function aliasKey(value: string) {
      const normalized =
        normalizeTeamName(value);

      return (
        TEAM_ALIASES[normalized] ??
        normalized
      );
    }

    /*
     * Rebuild normalized lookup using aliases so ESPN names can
     * resolve to the existing football-data team rows.
     *
     * Prefer provider-backed rows over old manual/null-provider
     * duplicates when both normalize to the same club.
     */
    const canonicalTeamMap =
      new Map<string, string>();

    const sortedExistingTeams = [
      ...(existingTeams ?? []),
    ].sort((a, b) => {
      const aProvider =
        a.external_provider
          ? 1
          : 0;
      const bProvider =
        b.external_provider
          ? 1
          : 0;

      return aProvider - bProvider;
    });

    for (const team of sortedExistingTeams) {
      canonicalTeamMap.set(
        aliasKey(team.name),
        team.id,
      );

      if (team.short_name) {
        canonicalTeamMap.set(
          aliasKey(team.short_name),
          team.id,
        );
      }
    }

    let teamsCreated = 0;
    let teamsReused = 0;
    let gamesImported = 0;
    let gamesSkipped = 0;

    const competitionResults: Array<{
      competition: string;
      espnSlug: string;
      eventsReceived: number;
      gamesImported: number;
      gamesSkipped: number;
    }> = [];

    async function getOrCreateTeam(
      espnTeam: EspnTeam,
    ) {
      const espnId =
        String(espnTeam.id);

      const cachedEspnTeam =
        teamByEspnId.get(espnId);

      if (cachedEspnTeam) {
        teamsReused += 1;
        return cachedEspnTeam;
      }

      const displayName =
        espnTeam.displayName?.trim();

      if (!displayName) {
        throw new Error(
          `ESPN team ${espnId} is missing a display name.`,
        );
      }

      const normalized =
        aliasKey(displayName);

      const existingTeamId =
        canonicalTeamMap.get(
          normalized,
        );

      if (existingTeamId) {
        /*
         * Do NOT overwrite external_provider/external_id here.
         *
         * A football-data team may already be FamBam's canonical
         * team and favorites point directly to that row.
         */
        const updatePayload: {
          abbreviation?: string;
          logo_url?: string;
        } = {};

        if (espnTeam.abbreviation) {
          updatePayload.abbreviation =
            espnTeam.abbreviation;
        }

        if (espnTeam.logo) {
          updatePayload.logo_url =
            espnTeam.logo;
        }

        if (
          Object.keys(updatePayload)
            .length > 0
        ) {
          await supabase
            .from("teams")
            .update(updatePayload)
            .eq("id", existingTeamId);
        }

        teamByEspnId.set(
          espnId,
          existingTeamId,
        );

        teamsReused += 1;
        return existingTeamId;
      }

      /*
       * Brand-new club not yet known to FamBam.
       * ESPN becomes its original provider.
       */
      const {
        data: createdTeam,
        error: createTeamError,
      } = await supabase
        .from("teams")
        .upsert(
          {
            sport_id: soccerSportId,
            name: displayName,
            short_name:
              espnTeam.shortDisplayName ??
              displayName,
            abbreviation:
              espnTeam.abbreviation ??
              null,
            logo_url:
              espnTeam.logo ?? null,
            active: true,
            external_provider:
              "espn",
            external_id: espnId,
          },
          {
            onConflict:
              "external_provider,external_id",
          },
        )
        .select("id")
        .single();

      if (
        createTeamError ||
        !createdTeam
      ) {
        throw new Error(
          `Failed importing ESPN team ${displayName}: ${
            createTeamError?.message ??
            "Unknown error"
          }`,
        );
      }

      teamByEspnId.set(
        espnId,
        createdTeam.id,
      );

      canonicalTeamMap.set(
        normalized,
        createdTeam.id,
      );

      teamsCreated += 1;
      return createdTeam.id;
    }

    for (
      const config of COMPETITIONS
    ) {
      const competition =
        competitionMap.get(
          config.fambamName,
        );

      if (!competition) {
        continue;
      }

      /*
       * A four-digit `dates` value returns ESPN's calendar-year
       * scoreboard in one request. This is both faster and more
       * reliable than making one request for every day in the
       * import window (which could time out before later
       * competitions such as Champions League were reached).
       */
      const events: EspnEvent[] = [];
      const seenEventIds = new Set<string>();

      /*
       * Cup rounds are often scheduled more than three weeks apart.
       * Keep every cup's automatic window open for 120 days so the
       * next Carabao, FA Cup, EFL Trophy, and Champions League round
       * appears as soon as ESPN publishes it. League One retains the
       * lighter 21-day default. Explicit requests still use exactly
       * the requested date range.
       */
      const competitionEndDate =
        !requestedDate &&
        !(requestedStart && requestedEnd) &&
        config.espnSlug !== "eng.3"
          ? new Date(
              Date.now() +
                120 * 24 * 60 * 60 * 1000,
            )
          : endDate;

      const windowStart = new Date(startDate);
      windowStart.setUTCHours(0, 0, 0, 0);

      const windowEnd = new Date(competitionEndDate);
      windowEnd.setUTCHours(23, 59, 59, 999);

      const years: number[] = [];

      for (
        let year = windowStart.getUTCFullYear();
        year <= windowEnd.getUTCFullYear();
        year += 1
      ) {
        years.push(year);
      }

      const scoreboards = await Promise.all(
        years.map(async (year) => {
          const espnUrl =
            new URL(
              `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.espnSlug}/scoreboard`,
            );

          espnUrl.searchParams.set(
            "dates",
            String(year),
          );

          espnUrl.searchParams.set(
            "limit",
            "500",
          );

          const response = await fetch(
            espnUrl,
            {
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
            },
          );

          if (!response.ok) {
            const details =
              await response.text();

            throw new Error(
              `ESPN request failed for ${config.fambamName} in ${year} (${response.status}): ${details}`,
            );
          }

          return (await response.json()) as EspnScoreboard;
        }),
      );

      for (const scoreboard of scoreboards) {
        for (
          const event of scoreboard.events ?? []
        ) {
          const eventDate = new Date(event.date);

          if (
            !Number.isNaN(eventDate.getTime()) &&
            eventDate >= windowStart &&
            eventDate <= windowEnd &&
            !seenEventIds.has(event.id)
          ) {
            seenEventIds.add(event.id);
            events.push(event);
          }
        }
      }

      let competitionImported = 0;
      let competitionSkipped = 0;

      for (const event of events) {
        const eventCompetition =
          event.competitions?.[0];

        const competitors =
          eventCompetition?.competitors ??
          [];

        const home =
          competitors.find(
            (competitor) =>
              competitor.homeAway ===
              "home",
          );

        const away =
          competitors.find(
            (competitor) =>
              competitor.homeAway ===
              "away",
          );

        if (
          !home?.team ||
          !away?.team ||
          !event.id ||
          !event.date
        ) {
          gamesSkipped += 1;
          competitionSkipped += 1;
          continue;
        }

        const homeTeamId =
          await getOrCreateTeam(
            home.team,
          );

        const awayTeamId =
          await getOrCreateTeam(
            away.team,
          );

        const status =
          normalizeStatus(event);

        const sourceNotes =
          event.status?.type
            ?.shortDetail ??
          event.status?.type
            ?.detail ??
          event.status?.type
            ?.description ??
          null;

        const {
          error: gameError,
        } = await supabase
          .from("games")
          .upsert(
            {
              sport_id:
                soccerSportId,
              competition_id:
                competition.id,
              home_team_id:
                homeTeamId,
              away_team_id:
                awayTeamId,
              starts_at:
                event.date,
              start_time_tbd:
                false,
              source_notes:
                sourceNotes,
              home_score:
                parseScore(
                  home.score,
                ),
              away_score:
                parseScore(
                  away.score,
                ),
              status,
              external_provider:
                "espn",
              external_id:
                String(event.id),
            },
            {
              onConflict:
                "external_provider,external_id",
            },
          );

        if (gameError) {
          return NextResponse.json(
            {
              error:
                `Failed importing ${away.team.displayName} at ${home.team.displayName}.`,
              competition:
                config.fambamName,
              details:
                gameError.message,
            },
            { status: 500 },
          );
        }

        gamesImported += 1;
        competitionImported += 1;
      }

      competitionResults.push({
        competition:
          config.fambamName,
        espnSlug:
          config.espnSlug,
        eventsReceived:
          events.length,
        gamesImported:
          competitionImported,
        gamesSkipped:
          competitionSkipped,
      });
    }

    return NextResponse.json({
      success: true,
      source: "espn",
      range: {
        start:
          startDate
            .toISOString()
            .slice(0, 10),
        end:
          endDate
            .toISOString()
            .slice(0, 10),
      },
      competitions:
        competitionResults,
      gamesImported,
      gamesSkipped,
      teamsCreated,
      teamsReused,
    });
  } catch (error) {
    console.error(
      "ESPN soccer import error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unexpected ESPN soccer import error.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 },
    );
  }
}
