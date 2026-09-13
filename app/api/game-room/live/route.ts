import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TeamRow = {
  name: string;
};

type GameRow = {
  id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  starts_at: string | null;
  external_provider: string | null;
  external_id: string | null;
  home_team: TeamRow | TeamRow[] | null;
  away_team: TeamRow | TeamRow[] | null;
};

type EspnCompetitor = {
  homeAway: "home" | "away";
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    name?: string;
  };
};

type EspnEvent = {
  id: string;
  date?: string;
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
      description?: string;
      detail?: string;
      shortDetail?: string;
    };
    period?: number;
    displayClock?: string;
  };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
  }>;
};

type EspnScoreboard = {
  events?: EspnEvent[];
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

function getTeamName(
  value: TeamRow | TeamRow[] | null,
) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value.name;
}

function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamNamesMatch(
  fambamName: string,
  providerName: string,
) {
  const fambam =
    normalizeTeamName(fambamName);
  const provider =
    normalizeTeamName(providerName);

  if (!fambam || !provider) return false;

  return (
    fambam === provider ||
    provider.startsWith(`${fambam} `) ||
    fambam.startsWith(`${provider} `)
  );
}

function scoreToNumber(
  value: string | undefined,
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

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
          external_id,
          home_team:teams!games_home_team_id_fkey(name),
          away_team:teams!games_away_team_id_fkey(name)
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

    let livePeriod: number | null = null;
    let liveClock: string | null = null;
    let liveDetail: string | null = null;
    let liveProvider =
      typedGame.external_provider;

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
      const homeTeamName =
        getTeamName(typedGame.home_team);

      const awayTeamName =
        getTeamName(typedGame.away_team);

      let espnMatched = false;

      if (
        typedGame.starts_at &&
        homeTeamName &&
        awayTeamName
      ) {
        try {
          const gameDate =
            new Date(typedGame.starts_at);

          const espnDate = [
            gameDate.getUTCFullYear(),
            String(
              gameDate.getUTCMonth() + 1,
            ).padStart(2, "0"),
            String(
              gameDate.getUTCDate(),
            ).padStart(2, "0"),
          ].join("");

          const espnUrl = new URL(
            "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
          );

          espnUrl.searchParams.set(
            "dates",
            espnDate,
          );

          espnUrl.searchParams.set(
            "limit",
            "200",
          );

          const espnResponse =
            await fetch(espnUrl, {
              cache: "no-store",
              headers: {
                Accept: "application/json",
              },
            });

          if (espnResponse.ok) {
            const scoreboard =
              (await espnResponse.json()) as EspnScoreboard;

            const matchingEvent =
              (scoreboard.events ?? []).find(
                (event) => {
                  const competitors =
                    event.competitions?.[0]
                      ?.competitors ?? [];

                  const home =
                    competitors.find(
                      (team) =>
                        team.homeAway ===
                        "home",
                    );

                  const away =
                    competitors.find(
                      (team) =>
                        team.homeAway ===
                        "away",
                    );

                  const espnHomeName =
                    home?.team
                      ?.displayName ??
                    home?.team
                      ?.shortDisplayName ??
                    home?.team?.name;

                  const espnAwayName =
                    away?.team
                      ?.displayName ??
                    away?.team
                      ?.shortDisplayName ??
                    away?.team?.name;

                  if (
                    !espnHomeName ||
                    !espnAwayName
                  ) {
                    return false;
                  }

                  return (
                    teamNamesMatch(
                      homeTeamName,
                      espnHomeName,
                    ) &&
                    teamNamesMatch(
                      awayTeamName,
                      espnAwayName,
                    )
                  );
                },
              );

            if (matchingEvent) {
              const competitors =
                matchingEvent
                  .competitions?.[0]
                  ?.competitors ?? [];

              const home =
                competitors.find(
                  (team) =>
                    team.homeAway ===
                    "home",
                );

              const away =
                competitors.find(
                  (team) =>
                    team.homeAway ===
                    "away",
                );

              homeScore =
                scoreToNumber(home?.score);

              awayScore =
                scoreToNumber(away?.score);

              const espnType =
                matchingEvent.status?.type;

              if (
                espnType?.completed ||
                espnType?.state === "post"
              ) {
                status = "final";
              } else if (
                espnType?.state === "in"
              ) {
                status = "live";
              } else {
                status = "scheduled";
              }

              startsAt =
                matchingEvent.date ??
                startsAt;

              livePeriod =
                matchingEvent.status
                  ?.period ?? null;

              liveClock =
                matchingEvent.status
                  ?.displayClock ?? null;

              liveDetail =
                espnType?.shortDetail ??
                espnType?.detail ??
                espnType?.description ??
                null;

              liveProvider = "espn";
              espnMatched = true;
            }
          } else {
            console.error(
              "ESPN college football refresh error:",
              espnResponse.status,
            );
          }
        } catch (error) {
          console.error(
            "ESPN college football refresh failed:",
            error,
          );
        }
      }

      if (!espnMatched) {
        const cfbdApiKey =
          process.env.CFBD_API_KEY;

        if (!cfbdApiKey) {
          return NextResponse.json(
            {
              error:
                "Could not refresh this college football game.",
            },
            { status: 502 },
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
                "No college football data was returned for this game.",
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

        liveProvider = "cfbd";
      }
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
      live: {
        provider: liveProvider,
        period: livePeriod,
        clock: liveClock,
        detail: liveDetail,
      },
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
