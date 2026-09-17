import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type GameRow = {
  id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  starts_at: string | null;
  external_provider: string | null;
  external_id: string | null;
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
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
};

type CfbdGame = {
  id: number;
  startDate: string;
  completed: boolean;
  homePoints: number | null;
  awayPoints: number | null;
};

function normalizeFootballDataStatus(
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

function statusIsFinal(status: string) {
  return [
    "final",
    "finished",
    "complete",
    "completed",
    "closed",
  ].includes(status.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        {
          error:
            "Supabase server environment variables are missing.",
        },
        { status: 500 },
      );
    }

    const gameId =
      request.nextUrl.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json(
        { error: "gameId is required." },
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

    const {
      data: game,
      error: gameError,
    } = await supabase
      .from("games")
      .select(
        `
          id,
          home_score,
          away_score,
          status,
          starts_at,
          external_provider,
          external_id
        `,
      )
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json(
        {
          error: "Game was not found.",
          details: gameError?.message ?? null,
        },
        { status: 404 },
      );
    }

    const typedGame = game as GameRow;

    if (
      !typedGame.external_provider ||
      !typedGame.external_id
    ) {
      return NextResponse.json(
        {
          error:
            "This game does not have a live data provider.",
        },
        { status: 400 },
      );
    }

    const previousHomeScore =
      typedGame.home_score;
    const previousAwayScore =
      typedGame.away_score;
    const previousStatus =
      typedGame.status;

    let homeScore =
      previousHomeScore;
    let awayScore =
      previousAwayScore;
    let status =
      previousStatus;
    let startsAt =
      typedGame.starts_at;

    if (
      typedGame.external_provider ===
      "football-data"
    ) {
      const footballDataKey =
        process.env.FOOTBALL_DATA_API_KEY;

      if (!footballDataKey) {
        return NextResponse.json(
          {
            error:
              "FOOTBALL_DATA_API_KEY is missing.",
          },
          { status: 500 },
        );
      }

      const providerResponse = await fetch(
        `https://api.football-data.org/v4/matches/${encodeURIComponent(
          typedGame.external_id,
        )}`,
        {
          headers: {
            "X-Auth-Token":
              footballDataKey,
          },
          cache: "no-store",
        },
      );

      if (!providerResponse.ok) {
        const providerBody =
          await providerResponse.text();

        console.error(
          "football-data live refresh error:",
          providerResponse.status,
          providerBody,
        );

        return NextResponse.json(
          {
            error:
              "Could not refresh this soccer game.",
            providerStatus:
              providerResponse.status,
          },
          { status: 502 },
        );
      }

      const providerGame =
        (await providerResponse.json()) as FootballDataMatch;

      homeScore =
        providerGame.score?.fullTime
          ?.home ?? null;

      awayScore =
        providerGame.score?.fullTime
          ?.away ?? null;

      status =
        normalizeFootballDataStatus(
          providerGame.status,
        );

      startsAt =
        providerGame.utcDate ??
        startsAt;
    } else if (
      typedGame.external_provider === "cfbd"
    ) {
      const cfbdApiKey =
        process.env.CFBD_API_KEY;

      if (!cfbdApiKey) {
        return NextResponse.json(
          {
            error:
              "CFBD_API_KEY is missing.",
          },
          { status: 500 },
        );
      }

      const cfbdUrl = new URL(
        "https://api.collegefootballdata.com/games",
      );

      cfbdUrl.searchParams.set(
        "id",
        typedGame.external_id,
      );

      const providerResponse =
        await fetch(cfbdUrl, {
          headers: {
            Authorization:
              `Bearer ${cfbdApiKey}`,
          },
          cache: "no-store",
        });

      if (!providerResponse.ok) {
        const providerBody =
          await providerResponse.text();

        console.error(
          "CFBD live refresh error:",
          providerResponse.status,
          providerBody,
        );

        return NextResponse.json(
          {
            error:
              "Could not refresh this college football game.",
            providerStatus:
              providerResponse.status,
          },
          { status: 502 },
        );
      }

      const providerGames =
        (await providerResponse.json()) as CfbdGame[];

      const providerGame =
        providerGames.find(
          (item) =>
            String(item.id) ===
            typedGame.external_id,
        ) ?? providerGames[0];

      if (!providerGame) {
        return NextResponse.json(
          {
            error:
              "CFBD did not return this game.",
          },
          { status: 404 },
        );
      }

      homeScore =
        providerGame.homePoints;
      awayScore =
        providerGame.awayPoints;

      status =
        providerGame.completed
          ? "final"
          : homeScore !== null ||
              awayScore !== null
            ? "live"
            : "scheduled";

      startsAt =
        providerGame.startDate ??
        startsAt;
    } else {
      return NextResponse.json(
        {
          error:
            `Live refresh is not supported for provider "${typedGame.external_provider}" yet.`,
        },
        { status: 400 },
      );
    }

    const scoreChanged =
      homeScore !==
        previousHomeScore ||
      awayScore !==
        previousAwayScore;

    const statusChanged =
      status !== previousStatus;

    const { error: updateError } =
      await supabase
        .from("games")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          status,
          starts_at: startsAt,
        })
        .eq("id", gameId);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            "Could not save the refreshed game.",
          details:
            updateError.message,
        },
        { status: 500 },
      );
    }

    let grading = null;

    if (
      statusIsFinal(status) &&
      !statusIsFinal(previousStatus)
    ) {
      const {
        data: gradingData,
        error: gradingError,
      } = await supabase.rpc(
        "grade_open_challenges",
      );

      if (gradingError) {
        console.error(
          "Live game grading error:",
          gradingError,
        );
      } else {
        grading = gradingData;
      }
    }

    return NextResponse.json({
      success: true,
      game: {
        id: gameId,
        homeScore,
        awayScore,
        status,
        startsAt,
      },
      changes: {
        scoreChanged,
        statusChanged,
        previousHomeScore,
        previousAwayScore,
        previousStatus,
      },
      grading,
      refreshedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Game Room live refresh error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unexpected error refreshing live game.",
      },
      { status: 500 },
    );
  }
}
