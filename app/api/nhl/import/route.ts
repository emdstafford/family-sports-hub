import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type NhlTeam = {
  id: number;
  commonName?: {
    default?: string;
  };
  placeName?: {
    default?: string;
  };
  abbrev: string;
  score?: number;
};

type NhlGame = {
  id: number;
  season: number;
  gameType: number;
  startTimeUTC: string;
  gameState: string;
  gameScheduleState: string;
  awayTeam: NhlTeam;
  homeTeam: NhlTeam;
};

type NhlScheduleDay = {
  date: string;
  games: NhlGame[];
};

type NhlScheduleResponse = {
  gameWeek?: NhlScheduleDay[];
};

function getTeamName(team: NhlTeam) {
  const place = team.placeName?.default?.trim();
  const common = team.commonName?.default?.trim();

  if (place && common) {
    return `${place} ${common}`;
  }

  return common || place || team.abbrev;
}

function getFamBamStatus(gameState: string) {
  const state = gameState.toUpperCase();

  if (state === "LIVE" || state === "CRIT") {
    return "live";
  }

  if (state === "OFF" || state === "FINAL") {
    return "final";
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
    const body = await request.json().catch(() => ({}));

    const queryDate =
      requestUrl.searchParams.get("date");

    const date =
      queryDate?.trim() ||
      (typeof body.date === "string" &&
      body.date.trim()
        ? body.date.trim()
        : new Date().toISOString().slice(0, 10));

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

    const {
      data: competition,
      error: competitionError,
    } = await supabase
      .from("competitions")
      .select("id, sport_id, name")
      .eq("name", "NHL")
      .single();

    if (competitionError || !competition) {
      return NextResponse.json(
        {
          error:
            'Could not find the "NHL" competition.',
          details:
            competitionError?.message ?? null,
        },
        { status: 500 },
      );
    }

    const competitionId = competition.id;
    const competitionSportId = competition.sport_id;

    const nhlUrl =
      `https://api-web.nhle.com/v1/schedule/${date}`;

    const nhlResponse = await fetch(nhlUrl, {
      cache: "no-store",
    });

    if (!nhlResponse.ok) {
      const details =
        await nhlResponse.text();

      return NextResponse.json(
        {
          error: "NHL schedule request failed.",
          status: nhlResponse.status,
          details,
        },
        { status: nhlResponse.status },
      );
    }

    const schedule =
      (await nhlResponse.json()) as NhlScheduleResponse;

    /*
     * The NHL schedule endpoint returns a week-shaped
     * response. For an import request, keep only the
     * exact requested calendar date so repeated imports
     * stay predictable.
     */
    const games =
      schedule.gameWeek
        ?.find((day) => day.date === date)
        ?.games ?? [];

    let teamsProcessed = 0;
    let gamesImported = 0;
    let gamesSkipped = 0;

    const teamCache =
      new Map<string, string>();

    async function getOrCreateTeam(
      team: NhlTeam,
    ) {
      const externalId = String(team.id);
      const cached =
        teamCache.get(externalId);

      if (cached) {
        return cached;
      }

      const name = getTeamName(team);

      const {
        data: importedTeam,
        error: teamError,
      } = await supabase
        .from("teams")
        .upsert(
          {
            sport_id:
              competitionSportId,
            name,
            short_name:
              team.commonName?.default ??
              null,
            abbreviation:
              team.abbrev ?? null,
            external_provider: "nhl",
            external_id: externalId,
          },
          {
            onConflict:
              "external_provider,external_id",
          },
        )
        .select("id")
        .single();

      if (teamError || !importedTeam) {
        throw new Error(
          `Failed importing NHL team ${name}: ${
            teamError?.message ??
            "Unknown error"
          }`,
        );
      }

      teamCache.set(
        externalId,
        importedTeam.id,
      );

      teamsProcessed += 1;

      return importedTeam.id;
    }

    for (const game of games) {
      if (
        !game.homeTeam?.id ||
        !game.awayTeam?.id ||
        !game.startTimeUTC
      ) {
        gamesSkipped += 1;
        continue;
      }

      const homeTeamId =
        await getOrCreateTeam(
          game.homeTeam,
        );

      const awayTeamId =
        await getOrCreateTeam(
          game.awayTeam,
        );

      const {
        error: gameError,
      } = await supabase
        .from("games")
        .upsert(
          {
            sport_id:
              competitionSportId,
            competition_id:
              competitionId,
            home_team_id:
              homeTeamId,
            away_team_id:
              awayTeamId,
            starts_at:
              game.startTimeUTC,
            start_time_tbd: false,
            source_notes:
              `NHL ${game.season}`,
            home_score:
              typeof game.homeTeam.score ===
              "number"
                ? game.homeTeam.score
                : null,
            away_score:
              typeof game.awayTeam.score ===
              "number"
                ? game.awayTeam.score
                : null,
            status:
              getFamBamStatus(
                game.gameState,
              ),
            external_provider: "nhl",
            external_id:
              String(game.id),
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
              `Failed importing ${getTeamName(
                game.awayTeam,
              )} at ${getTeamName(
                game.homeTeam,
              )}.`,
            details:
              gameError.message,
          },
          { status: 500 },
        );
      }

      gamesImported += 1;
    }

    return NextResponse.json({
      success: true,
      source: "nhl",
      date,
      gamesReceived: games.length,
      gamesImported,
      gamesSkipped,
      teamsProcessed,
      games: games.map((game) => ({
        id: game.id,
        away:
          getTeamName(game.awayTeam),
        home:
          getTeamName(game.homeTeam),
        startTimeUTC:
          game.startTimeUTC,
        state:
          game.gameState,
      })),
    });
  } catch (error) {
    console.error(
      "NHL import error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unexpected NHL import error.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 },
    );
  }
}
