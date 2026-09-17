import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type NamedRow = {
  name: string;
};

type GameRow = {
  id: string;
  starts_at: string | null;
  status: string | null;
  external_provider: string | null;
  external_id: string | null;
  home_team: NamedRow | NamedRow[] | null;
  away_team: NamedRow | NamedRow[] | null;
  competition: NamedRow | NamedRow[] | null;
  sport: NamedRow | NamedRow[] | null;
};

type FootballDataTeam = {
  id: number;
  name: string;
  shortName: string;
};

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score: {
    winner: string | null;
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
};

type StandingRow = {
  position: number;
  team: FootballDataTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type TeamForm = {
  teamId: number;
  teamName: string;
  results: string[];
  wins: number;
  draws: number;
  losses: number;
};

type Insight = {
  type:
    | "standings"
    | "standings_note"
    | "form"
    | "previous_meeting";
  title: string;
  text: string;
};

function getName(
  value: NamedRow | NamedRow[] | null,
) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value.name;
}

function getAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase server environment variables",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function footballDataFetch<T>(
  path: string,
): Promise<T | null> {
  const key =
    process.env.FOOTBALL_DATA_API_KEY;

  if (!key) {
    return null;
  }

  const response = await fetch(
    `https://api.football-data.org/v4${path}`,
    {
      headers: {
        "X-Auth-Token": key,
      },
      next: {
        revalidate: 900,
      },
    },
  );

  if (!response.ok) {
    console.error(
      "Football-data insights request failed:",
      path,
      response.status,
    );

    return null;
  }

  return (await response.json()) as T;
}

function calculateForm(
  teamId: number,
  teamName: string,
  matches: FootballDataMatch[],
  beforeDate: string | null,
): TeamForm {
  const cutoff = beforeDate
    ? new Date(beforeDate).getTime()
    : Date.now();

  const completed = matches
    .filter((match) => {
      if (match.status !== "FINISHED") {
        return false;
      }

      return (
        new Date(match.utcDate).getTime() <
        cutoff
      );
    })
    .sort(
      (a, b) =>
        new Date(b.utcDate).getTime() -
        new Date(a.utcDate).getTime(),
    )
    .slice(0, 5);

  const results: string[] = [];
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const match of completed) {
    const isHome =
      match.homeTeam.id === teamId;

    const teamScore = isHome
      ? match.score.fullTime.home
      : match.score.fullTime.away;

    const opponentScore = isHome
      ? match.score.fullTime.away
      : match.score.fullTime.home;

    if (
      teamScore === null ||
      opponentScore === null
    ) {
      continue;
    }

    if (teamScore > opponentScore) {
      results.push("W");
      wins += 1;
    } else if (teamScore < opponentScore) {
      results.push("L");
      losses += 1;
    } else {
      results.push("D");
      draws += 1;
    }
  }

  return {
    teamId,
    teamName,
    results,
    wins,
    draws,
    losses,
  };
}

function standingSummary(
  row: StandingRow,
) {
  return (
    `${row.position}${ordinalSuffix(row.position)} · ` +
    `${row.points} pts · ` +
    `${row.won}-${row.draw}-${row.lost} · ` +
    `GF ${row.goalsFor} · ` +
    `GA ${row.goalsAgainst} · ` +
    `GD ${row.goalDifference >= 0 ? "+" : ""}${row.goalDifference}`
  );
}

function ordinalSuffix(value: number) {
  const mod100 = value % 100;

  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function buildStandingsNote(
  home: StandingRow,
  away: StandingRow,
) {
  const pointGap = Math.abs(
    home.points - away.points,
  );

  const positionGap = Math.abs(
    home.position - away.position,
  );

  const gdGap = Math.abs(
    home.goalDifference -
      away.goalDifference,
  );

  if (home.points === away.points) {
    if (
      home.goalDifference !==
      away.goalDifference
    ) {
      const ahead =
        home.position < away.position
          ? home
          : away;

      const behind =
        ahead.team.id === home.team.id
          ? away
          : home;

      return (
        `${ahead.team.shortName} and ` +
        `${behind.team.shortName} are level on ` +
        `${ahead.points} points. ` +
        `${ahead.team.shortName} is higher in the table ` +
        `with a ${ahead.goalDifference >= 0 ? "+" : ""}` +
        `${ahead.goalDifference} goal difference compared with ` +
        `${behind.goalDifference >= 0 ? "+" : ""}` +
        `${behind.goalDifference}.`
      );
    }

    return (
      `These teams are level on ${home.points} points, ` +
      `so the margins between them are especially small.`
    );
  }

  if (pointGap <= 3) {
    return (
      `Only ${pointGap} point${pointGap === 1 ? "" : "s"} ` +
      `separate these teams. A win is worth 3 points, ` +
      `so one result can quickly change their positions.`
    );
  }

  if (positionGap <= 3 && gdGap <= 5) {
    return (
      `These teams are close in the table, and their ` +
      `goal difference is also close. Goals scored and ` +
      `conceded can matter when teams finish level on points.`
    );
  }

  return null;
}

function previousMeetingInsight(
  currentMatchId: number,
  homeTeamId: number,
  awayTeamId: number,
  matches: FootballDataMatch[],
  beforeDate: string | null,
): Insight | null {
  const cutoff = beforeDate
    ? new Date(beforeDate).getTime()
    : Date.now();

  const previous = matches
    .filter((match) => {
      if (
        match.id === currentMatchId ||
        match.status !== "FINISHED"
      ) {
        return false;
      }

      if (
        new Date(match.utcDate).getTime() >=
        cutoff
      ) {
        return false;
      }

      const sameTeams =
        (match.homeTeam.id === homeTeamId &&
          match.awayTeam.id === awayTeamId) ||
        (match.homeTeam.id === awayTeamId &&
          match.awayTeam.id === homeTeamId);

      return sameTeams;
    })
    .sort(
      (a, b) =>
        new Date(b.utcDate).getTime() -
        new Date(a.utcDate).getTime(),
    )[0];

  if (!previous) {
    return null;
  }

  const homeScore =
    previous.score.fullTime.home;
  const awayScore =
    previous.score.fullTime.away;

  if (
    homeScore === null ||
    awayScore === null
  ) {
    return null;
  }

  return {
    type: "previous_meeting",
    title: "Last Meeting",
    text:
      `${previous.homeTeam.shortName} ${homeScore}-${awayScore} ` +
      `${previous.awayTeam.shortName}`,
  };
}

async function buildFootballDataInsights(
  game: GameRow,
): Promise<Insight[]> {
  if (
    !game.external_id ||
    game.external_provider !==
      "football-data"
  ) {
    return [];
  }

  const match =
    await footballDataFetch<FootballDataMatch>(
      `/matches/${game.external_id}`,
    );

  if (!match) {
    return [];
  }

  const [
    standingsResponse,
    homeMatchesResponse,
    awayMatchesResponse,
  ] = await Promise.all([
    footballDataFetch<{
      standings: Array<{
        type: string;
        table: StandingRow[];
      }>;
    }>("/competitions/PL/standings"),

    footballDataFetch<{
      matches: FootballDataMatch[];
    }>(
      `/teams/${match.homeTeam.id}/matches?status=FINISHED&limit=20`,
    ),

    footballDataFetch<{
      matches: FootballDataMatch[];
    }>(
      `/teams/${match.awayTeam.id}/matches?status=FINISHED&limit=20`,
    ),
  ]);

  const insights: Insight[] = [];

  const totalTable =
    standingsResponse?.standings.find(
      (standing) =>
        standing.type === "TOTAL",
    )?.table ?? [];

  const homeStanding =
    totalTable.find(
      (row) =>
        row.team.id === match.homeTeam.id,
    );

  const awayStanding =
    totalTable.find(
      (row) =>
        row.team.id === match.awayTeam.id,
    );

  if (homeStanding && awayStanding) {
    insights.push({
      type: "standings",
      title: "Premier League Table",
      text:
        `${match.homeTeam.shortName}: ` +
        standingSummary(homeStanding) +
        `\n` +
        `${match.awayTeam.shortName}: ` +
        standingSummary(awayStanding),
    });

    const note =
      buildStandingsNote(
        homeStanding,
        awayStanding,
      );

    if (note) {
      insights.push({
        type: "standings_note",
        title: "What That Means",
        text: note,
      });
    }
  }

  const homeMatches =
    homeMatchesResponse?.matches ?? [];

  const awayMatches =
    awayMatchesResponse?.matches ?? [];

  const homeForm =
    calculateForm(
      match.homeTeam.id,
      match.homeTeam.shortName,
      homeMatches,
      game.starts_at,
    );

  const awayForm =
    calculateForm(
      match.awayTeam.id,
      match.awayTeam.shortName,
      awayMatches,
      game.starts_at,
    );

  if (
    homeForm.results.length ||
    awayForm.results.length
  ) {
    const parts: string[] = [];

    if (homeForm.results.length) {
      parts.push(
        `${homeForm.teamName}: ${homeForm.results.join("-")} ` +
          `(${homeForm.wins}W ${homeForm.draws}D ${homeForm.losses}L)`,
      );
    }

    if (awayForm.results.length) {
      parts.push(
        `${awayForm.teamName}: ${awayForm.results.join("-")} ` +
          `(${awayForm.wins}W ${awayForm.draws}D ${awayForm.losses}L)`,
      );
    }

    insights.push({
      type: "form",
      title: "Recent Form",
      text: parts.join("\n"),
    });
  }

  const previous =
    previousMeetingInsight(
      match.id,
      match.homeTeam.id,
      match.awayTeam.id,
      [
        ...homeMatches,
        ...awayMatches,
      ],
      game.starts_at,
    );

  if (previous) {
    insights.push(previous);
  }

  return insights;
}

export async function GET(
  request: NextRequest,
) {
  try {
    const gameId =
      request.nextUrl.searchParams.get(
        "gameId",
      );

    if (!gameId) {
      return NextResponse.json(
        { error: "Missing gameId" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const { data, error } =
      await supabase
        .from("games")
        .select(`
          id,
          starts_at,
          status,
          external_provider,
          external_id,
          home_team:teams!games_home_team_id_fkey(name),
          away_team:teams!games_away_team_id_fkey(name),
          competition:competitions!games_competition_id_fkey(name),
          sport:sports!games_sport_id_fkey(name)
        `)
        .eq("id", gameId)
        .maybeSingle();

    if (error) {
      console.error(
        "Game Insights lookup error:",
        error,
      );

      return NextResponse.json(
        {
          error:
            "Unable to load game insights",
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Game not found" },
        { status: 404 },
      );
    }

    const game =
      data as unknown as GameRow;

    let insights: Insight[] = [];

    if (
      getName(game.sport) === "Soccer" &&
      game.external_provider ===
        "football-data"
    ) {
      insights =
        await buildFootballDataInsights(
          game,
        );
    }

    return NextResponse.json({
      game: {
        id: game.id,
        sport:
          getName(game.sport) ?? "Sports",
        competition:
          getName(game.competition) ??
          "Game",
        home:
          getName(game.home_team) ?? "TBD",
        away:
          getName(game.away_team) ?? "TBD",
        startsAt: game.starts_at,
        status: game.status,
        externalProvider:
          game.external_provider,
        externalId:
          game.external_id,
      },
      insights,
    });
  } catch (error) {
    console.error(
      "Game Insights exception:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load game insights",
      },
      { status: 500 },
    );
  }
}
