import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MlbTeam = {
  id: number;
  name: string;
  abbreviation?: string;
};

type MlbSide = {
  team: MlbTeam;
  score?: number;
};

type MlbGame = {
  gamePk: number;
  gameType: string;
  season: string;
  gameDate: string;
  status: {
    abstractGameState: string;
    detailedState: string;
    startTimeTBD?: boolean;
  };
  teams: {
    away: MlbSide;
    home: MlbSide;
  };
};

type MlbScheduleResponse = {
  dates?: Array<{
    date: string;
    games?: MlbGame[];
  }>;
};

function getFamBamStatus(game: MlbGame) {
  const state = game.status.abstractGameState.toLowerCase();

  if (state === "live") {
    return "live";
  }

  if (state === "final") {
    return "final";
  }

  return "scheduled";
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 },
      );
    }

    const url = new URL(request.url);

    let body: { date?: string } = {};

    try {
      body = await request.json();
    } catch {
      // Query-string-only requests are allowed.
    }

    const date =
      url.searchParams.get("date") ??
      body.date ??
      new Date().toISOString().slice(0, 10);

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
      .eq("name", "MLB")
      .single();

    if (competitionError || !competition) {
      return NextResponse.json(
        {
          error: "MLB competition was not found.",
          details: competitionError?.message ?? null,
        },
        { status: 500 },
      );
    }

    const competitionId = competition.id;
    const competitionSportId = competition.sport_id;

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(
        date,
      )}&hydrate=team`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Could not load MLB schedule.",
          status: response.status,
        },
        { status: 502 },
      );
    }

    const schedule =
      (await response.json()) as MlbScheduleResponse;

    const games =
      schedule.dates
        ?.find((day) => day.date === date)
        ?.games?.filter((game) => game.gameType === "R") ??
      [];

    const teamCache = new Map<number, string>();

    async function getOrCreateTeam(team: MlbTeam) {
      const cached = teamCache.get(team.id);

      if (cached) {
        return cached;
      }

      const { data, error } = await supabase
        .from("teams")
        .upsert(
          {
            sport_id: competitionSportId,
            name: team.name,
            external_provider: "mlb",
            external_id: String(team.id),
          },
          {
            onConflict: "external_provider,external_id",
          },
        )
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(
          `Could not save MLB team ${team.name}: ${
            error?.message ?? "Unknown error"
          }`,
        );
      }

      teamCache.set(team.id, data.id);

      return data.id;
    }

    let gamesImported = 0;
    let gamesSkipped = 0;

    const importedGames: Array<{
      id: number;
      away: string;
      home: string;
      gameDate: string;
      state: string;
    }> = [];

    for (const game of games) {
      try {
        const awayTeamId = await getOrCreateTeam(
          game.teams.away.team,
        );

        const homeTeamId = await getOrCreateTeam(
          game.teams.home.team,
        );

        const { error } = await supabase
          .from("games")
          .upsert(
            {
              sport_id: competitionSportId,
              competition_id: competitionId,
              home_team_id: homeTeamId,
              away_team_id: awayTeamId,
              starts_at: game.gameDate,
              start_time_tbd:
                game.status.startTimeTBD ?? false,
              source_notes: `MLB ${game.season}`,
              home_score:
                typeof game.teams.home.score === "number"
                  ? game.teams.home.score
                  : null,
              away_score:
                typeof game.teams.away.score === "number"
                  ? game.teams.away.score
                  : null,
              status: getFamBamStatus(game),
              external_provider: "mlb",
              external_id: String(game.gamePk),
            },
            {
              onConflict: "external_provider,external_id",
            },
          );

        if (error) {
          console.error(
            `Could not import MLB game ${game.gamePk}:`,
            error,
          );
          gamesSkipped += 1;
          continue;
        }

        gamesImported += 1;

        importedGames.push({
          id: game.gamePk,
          away: game.teams.away.team.name,
          home: game.teams.home.team.name,
          gameDate: game.gameDate,
          state: game.status.abstractGameState,
        });
      } catch (error) {
        console.error(
          `Could not process MLB game ${game.gamePk}:`,
          error,
        );
        gamesSkipped += 1;
      }
    }

    return NextResponse.json({
      success: true,
      source: "mlb",
      date,
      gamesReceived: games.length,
      gamesImported,
      gamesSkipped,
      teamsProcessed: teamCache.size,
      games: importedGames,
    });
  } catch (error) {
    console.error("MLB import error:", error);

    return NextResponse.json(
      {
        error: "Unexpected MLB import error.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}
