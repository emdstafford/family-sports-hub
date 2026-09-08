import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type FootballDataTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
};

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "SUSPENDED"
    | "POSTPONED"
    | "CANCELLED"
    | "AWARDED";

  matchday: number | null;

  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;

  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
};

type FootballDataResponse = {
  matches: FootballDataMatch[];
};

function normalizeStatus(
  status: FootballDataMatch["status"],
) {
  switch (status) {
    case "FINISHED":
    case "AWARDED":
      return "final";

    case "IN_PLAY":
    case "PAUSED":
      return "live";

    case "POSTPONED":
      return "postponed";

    case "CANCELLED":
      return "cancelled";

    case "SUSPENDED":
      return "suspended";

    default:
      return "scheduled";
  }
}

export async function POST(request: NextRequest) {
  try {
    const footballDataKey =
      process.env.FOOTBALL_DATA_API_KEY;

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!footballDataKey) {
      return NextResponse.json(
        {
          error:
            "FOOTBALL_DATA_API_KEY is missing.",
        },
        { status: 500 },
      );
    }

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        {
          error:
            "Supabase server environment variables are missing.",
        },
        { status: 500 },
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

    const url = new URL(request.url);

    const season =
      url.searchParams.get("season") ?? "2026";

    const response = await fetch(
      `https://api.football-data.org/v4/competitions/EL1/matches?season=${season}`,
      {
        headers: {
          "X-Auth-Token": footballDataKey,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const body = await response.text();

      console.error(
        "football-data.org League One error:",
        response.status,
        body,
      );

      return NextResponse.json(
        {
          error:
            "Could not load League One matches.",
          status: response.status,
        },
        { status: 502 },
      );
    }

    const body =
      (await response.json()) as FootballDataResponse;

    const matches = body.matches ?? [];

    const {
      data: competition,
      error: competitionError,
    } = await supabase
      .from("competitions")
      .select("id")
      .eq("name", "EFL League One")
      .single();

    if (competitionError || !competition) {
      return NextResponse.json(
        {
          error:
            "EFL League One competition row was not found.",
        },
        { status: 500 },
      );
    }

    const {
      data: soccerSport,
      error: sportError,
    } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "Soccer")
      .single();

    if (sportError || !soccerSport) {
      return NextResponse.json(
        {
          error:
            "Soccer sport row was not found.",
        },
        { status: 500 },
      );
    }

    const uniqueTeams = new Map<
      number,
      FootballDataTeam
    >();

    for (const match of matches) {
      uniqueTeams.set(
        match.homeTeam.id,
        match.homeTeam,
      );

      uniqueTeams.set(
        match.awayTeam.id,
        match.awayTeam,
      );
    }

    const teamRows = Array.from(
      uniqueTeams.values(),
    ).map((team) => ({
      sport_id: soccerSport.id,
      name: team.name,
      short_name:
        team.shortName ?? team.name,
      external_provider: "football-data",
      external_id: String(team.id),
    }));

    if (teamRows.length > 0) {
      const { error: teamError } =
        await supabase
          .from("teams")
          .upsert(teamRows, {
            onConflict:
              "external_provider,external_id",
          });

      if (teamError) {
        console.error(teamError);

        return NextResponse.json(
          {
            error:
              "Could not import League One teams.",
            details: teamError.message,
          },
          { status: 500 },
        );
      }
    }

    const {
      data: importedTeams,
      error: importedTeamsError,
    } = await supabase
      .from("teams")
      .select(
        "id, external_id, external_provider",
      )
      .eq(
        "external_provider",
        "football-data",
      );

    if (importedTeamsError) {
      return NextResponse.json(
        {
          error:
            "Could not reload League One teams.",
        },
        { status: 500 },
      );
    }

    const teamIdMap = new Map<
      string,
      string
    >();

    for (const team of importedTeams ?? []) {
      if (team.external_id) {
        teamIdMap.set(
          team.external_id,
          team.id,
        );
      }
    }

    const gameRows = matches
      .map((match) => {
        const homeTeamId = teamIdMap.get(
          String(match.homeTeam.id),
        );

        const awayTeamId = teamIdMap.get(
          String(match.awayTeam.id),
        );

        if (!homeTeamId || !awayTeamId) {
          return null;
        }

        const startTimeTbd =
          match.status === "SCHEDULED";

        return {
          sport_id:
            soccerSport.id,

          competition_id:
            competition.id,

          home_team_id:
            homeTeamId,

          away_team_id:
            awayTeamId,

          starts_at:
            match.utcDate,

          start_time_tbd:
            startTimeTbd,

          source_notes:
            startTimeTbd
              ? "League One kickoff time not yet confirmed"
              : `League One Matchweek ${
                  match.matchday ?? "TBD"
                }`,

          home_score:
            match.score?.fullTime?.home ??
            null,

          away_score:
            match.score?.fullTime?.away ??
            null,

          status:
            normalizeStatus(match.status),

          external_provider:
            "football-data",

          external_id:
            String(match.id),
        };
      })
      .filter(
        (
          game,
        ): game is NonNullable<
          typeof game
        > => game !== null,
      );

    if (gameRows.length > 0) {
      const { error: gameError } =
        await supabase
          .from("games")
          .upsert(gameRows, {
            onConflict:
              "external_provider,external_id",
          });

      if (gameError) {
        console.error(gameError);

        return NextResponse.json(
          {
            error:
              "Could not import League One games.",
            details: gameError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      source: "football-data",
      competition: "EFL League One",
      season,
      matchesReceived: matches.length,
      gamesImported: gameRows.length,
      teamsProcessed: teamRows.length,
      message:
        `Imported ${gameRows.length} League One games into FamBam Sports.`,
    });
  } catch (error) {
    console.error(
      "League One import error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unexpected League One import error.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 },
    );
  }
}