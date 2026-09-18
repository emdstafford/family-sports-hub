import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type NamedRow = {
  id?: string;
  name: string;
};

type GameRow = {
  id: string;
  starts_at: string | null;
  status: string | null;
  external_provider: string | null;
  external_id: string | null;
  home_score: number | null;
  away_score: number | null;
  week_label: string | null;
  season: string | null;
  source_notes: string | null;
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
    | "previous_meeting"
    | "why_it_matters"
    | "event_context"
    | "final_score"
    | "matchup"
    | "what_to_watch";
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

function getRow(
  value: NamedRow | NamedRow[] | null,
) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

function isFinalStatus(status: string | null) {
  const value = String(status ?? "").toLowerCase();

  return [
    "final",
    "finished",
    "complete",
    "completed",
    "closed",
  ].some((item) => value.includes(item));
}

function isUsefulSourceNote(value: string | null) {
  const note = String(value ?? "").trim();

  if (!note) return false;

  const providerStatusCodes = new Set([
    "FT",
    "HT",
    "NS",
    "TBD",
    "AET",
    "PEN",
    "PST",
    "CANC",
    "ABD",
    "AWD",
    "WO",
    "LIVE",
    "FINAL",
    "FINISHED",
    "SCHEDULED",
  ]);

  return !providerStatusCodes.has(note.toUpperCase());
}

function isKnockoutCompetition(competition: string) {
  const value = competition.toLowerCase();

  return (
    value.includes("carabao") ||
    value.includes("efl cup") ||
    value.includes("league cup") ||
    value.includes("fa cup")
  );
}

function winnerText(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
) {
  if (homeScore > awayScore) return home;
  if (awayScore > homeScore) return away;
  return null;
}

function buildMatchupGuide(game: GameRow): Insight[] {
  const sport = getName(game.sport) ?? "Sports";
  const competition = getName(game.competition) ?? "Game";
  const home = getName(game.home_team) ?? "Home";
  const away = getName(game.away_team) ?? "Away";

  if (sport === "Soccer") {
    const competitionName = competition.toLowerCase();
    const isCup = isKnockoutCompetition(competition);
    const format = isCup
      ? "This is a knockout match: one club advances and the other club’s cup run ends."
      : competitionName.includes("champions league")
        ? "This European match helps determine the clubs’ path through the Champions League."
        : "This is a league match, where a win earns 3 points, a draw earns 1 and a loss earns 0.";

    return [
      {
        type: "matchup",
        title: "Matchup Guide",
        text:
          `${away} travels to ${home}. ${home} is the home side and is listed second on the fixture. ${format}`,
      },
      {
        type: "what_to_watch",
        title: "What to Watch",
        text:
          "Watch which team controls midfield, creates the better chances and wins set pieces. Counterattacks, corners and late substitutions can quickly change a close match.",
      },
    ];
  }

  if (sport === "College Football") {
    return [
      {
        type: "matchup",
        title: "Matchup Guide",
        text:
          `${away} visits ${home}. ${home} has home-field advantage in this ${competition} matchup.`,
      },
      {
        type: "what_to_watch",
        title: "What to Watch",
        text:
          "Turnovers, explosive plays, third-down stops and red-zone scoring usually decide close college football games. Also watch field position and whether either team can control the line of scrimmage.",
      },
    ];
  }

  return [];
}

function buildStoredGameInsights(game: GameRow): Insight[] {
  const sport = getName(game.sport) ?? "Sports";
  const competition = getName(game.competition) ?? "Game";
  const home = getName(game.home_team) ?? "Home";
  const away = getName(game.away_team) ?? "Away";
  const insights: Insight[] = [];

  const isFinal =
    isFinalStatus(game.status) &&
    game.home_score !== null &&
    game.away_score !== null;

  const winner =
    isFinal
      ? winnerText(
          home,
          away,
          game.home_score as number,
          game.away_score as number,
        )
      : null;

  let whyItMatters: string;

  if (isKnockoutCompetition(competition)) {
    if (isFinal && winner) {
      const eliminated =
        winner === home ? away : home;

      whyItMatters =
        `${winner} advanced in ${competition} with a ` +
        `${game.home_score}-${game.away_score} win over ${eliminated}. ` +
        `This is a knockout competition, so ${winner} moves on and ` +
        `${eliminated} is eliminated.`;
    } else if (isFinal) {
      whyItMatters =
        `${home} and ${away} finished level in ${competition}. ` +
        `Because this is a knockout competition, the tie must be decided ` +
        `by the competition's tiebreak procedure before a team advances.`;
    } else {
      whyItMatters =
        `${home} and ${away} meet in ${competition}, a knockout competition. ` +
        `The team that wins advances; the losing team's cup run ends.`;
    }
  } else if (isUsefulSourceNote(game.source_notes)) {
    whyItMatters = game.source_notes!.trim();
  } else if (
    sport === "Soccer" &&
    competition.toLowerCase().includes("premier league")
  ) {
    whyItMatters =
      `${away} at ${home} is a Premier League match. ` +
      `League results affect the season table: a win earns 3 points, ` +
      `a draw earns 1, and a loss earns 0.`;
  } else if (
    sport === "Soccer" &&
    competition.toLowerCase().includes("champions league")
  ) {
    whyItMatters =
      `${away} at ${home} is a UEFA Champions League match. ` +
      `The result affects each club's path through Europe's top club competition.`;
  } else {
    whyItMatters =
      `${away} at ${home} is part of ${competition}.`;
  }

  insights.push({
    type: "why_it_matters",
    title: "Why It Matters",
    text: whyItMatters,
  });

  let eventContext: string;

  if (isKnockoutCompetition(competition)) {
    eventContext =
      `${competition} is a knockout cup competition for English clubs. ` +
      `Unlike a league table, there are no standings points to collect from this match: ` +
      `one team advances and the other is eliminated.`;
  } else if (
    sport === "Soccer" &&
    competition.toLowerCase().includes("premier league")
  ) {
    eventContext =
      `The Premier League is a season-long table. Clubs earn 3 points for a win, ` +
      `1 for a draw and 0 for a loss, with results building toward the final standings.`;
  } else if (
    sport === "Soccer" &&
    competition.toLowerCase().includes("champions league")
  ) {
    eventContext =
      `The UEFA Champions League brings together leading clubs from across Europe. ` +
      `Results determine advancement through the competition and the path toward the final.`;
  } else {
    const contextParts = [
      sport,
      competition,
      game.week_label,
      game.season ? `Season ${game.season}` : null,
    ].filter(Boolean);

    eventContext = contextParts.join(" · ");
  }

  if (eventContext) {
    insights.push({
      type: "event_context",
      title: "Tell Me More",
      text: eventContext,
    });
  }

  if (isFinal) {
    insights.push({
      type: "final_score",
      title: "What Happened?",
      text: `${away} ${game.away_score} · ${home} ${game.home_score}`,
    });
  }

  return insights;
}


async function buildCollegeFootballInsights(
  game: GameRow,
): Promise<Insight[]> {
  const supabase = getAdminClient();
  const homeRow = getRow(game.home_team);
  const awayRow = getRow(game.away_team);
  const home = homeRow?.name ?? "Home";
  const away = awayRow?.name ?? "Away";

  const seasonNumber = Number(game.season);
  const season =
    Number.isFinite(seasonNumber) && seasonNumber > 2000
      ? seasonNumber
      : new Date(game.starts_at ?? Date.now()).getFullYear();

  const weekMatch = String(game.week_label ?? "").match(/(\d+)/);
  const week = weekMatch ? Number(weekMatch[1]) : null;

  let rankingQuery = supabase
    .from("college_football_rankings")
    .select("team_name, rank, season, week, poll")
    .eq("poll", "AP Top 25")
    .eq("season", season)
    .in("team_name", [home, away])
    .order("week", { ascending: false });

  if (week !== null) {
    rankingQuery = rankingQuery.lte("week", week);
  }

  const { data: rankingRows } = await rankingQuery.limit(10);

  const latestRankingWeek =
    (rankingRows ?? []).reduce(
      (latest, row) => Math.max(latest, Number(row.week) || 0),
      0,
    );

  const currentRankings = (rankingRows ?? []).filter(
    (row) => Number(row.week) === latestRankingWeek,
  );

  const homeRank =
    currentRankings.find(
      (row) =>
        row.team_name.trim().toLowerCase() ===
        home.trim().toLowerCase(),
    )?.rank ?? null;

  const awayRank =
    currentRankings.find(
      (row) =>
        row.team_name.trim().toLowerCase() ===
        away.trim().toLowerCase(),
    )?.rank ?? null;

  const teamIds = [homeRow?.id, awayRow?.id].filter(
    (id): id is string => Boolean(id),
  );

  let recentGames: Array<{
    home_team_id: string;
    away_team_id: string;
    home_score: number | null;
    away_score: number | null;
    starts_at: string | null;
    status: string | null;
  }> = [];

  if (teamIds.length > 0) {
    const cutoff = game.starts_at ?? new Date().toISOString();

    const { data } = await supabase
      .from("games")
      .select(
        "home_team_id, away_team_id, home_score, away_score, starts_at, status",
      )
      .eq("sport_id", game.sport ? getRow(game.sport)?.id ?? "" : "")
      .lt("starts_at", cutoff)
      .or(
        teamIds
          .flatMap((id) => [
            `home_team_id.eq.${id}`,
            `away_team_id.eq.${id}`,
          ])
          .join(","),
      )
      .order("starts_at", { ascending: false })
      .limit(20);

    recentGames = data ?? [];
  }

  function recordFor(teamId: string | undefined) {
    if (!teamId) return null;

    const teamGames = recentGames
      .filter(
        (row) =>
          row.home_team_id === teamId ||
          row.away_team_id === teamId,
      )
      .filter(
        (row) =>
          isFinalStatus(row.status) &&
          row.home_score !== null &&
          row.away_score !== null,
      )
      .slice(0, 5);

    if (!teamGames.length) return null;

    let wins = 0;
    let losses = 0;

    for (const row of teamGames) {
      const isHome = row.home_team_id === teamId;
      const teamScore = isHome ? row.home_score! : row.away_score!;
      const opponentScore = isHome ? row.away_score! : row.home_score!;

      if (teamScore > opponentScore) wins += 1;
      else if (teamScore < opponentScore) losses += 1;
    }

    return { wins, losses, games: teamGames.length };
  }

  const homeRecord = recordFor(homeRow?.id);
  const awayRecord = recordFor(awayRow?.id);

  const rankedHome = homeRank ? `#${homeRank} ${home}` : home;
  const rankedAway = awayRank ? `#${awayRank} ${away}` : away;

  let why =
    `${rankedAway} visits ${rankedHome} in NCAA Football.`;

  if (homeRank && awayRank) {
    why =
      `This is a ranked matchup: #${awayRank} ${away} visits ` +
      `#${homeRank} ${home}. A result between two AP Top 25 teams can ` +
      `matter for the national rankings and postseason picture.`;
  } else if (homeRank || awayRank) {
    const rankedTeam = homeRank
      ? `#${homeRank} ${home}`
      : `#${awayRank} ${away}`;

    why =
      `${rankedTeam} enters this matchup ranked in the AP Top 25. ` +
      `Games involving ranked teams can affect the next poll and the ` +
      `larger postseason picture.`;
  } else if (game.week_label) {
    why =
      `${away} visits ${home} in ${game.week_label} of the college football season.`;
  }

  const details: string[] = [];

  if (homeRank || awayRank) {
    details.push(
      `AP Top 25: ${awayRank ? `#${awayRank} ${away}` : `${away} unranked`} · ` +
      `${homeRank ? `#${homeRank} ${home}` : `${home} unranked`}.`,
    );
  }

  if (awayRecord || homeRecord) {
    details.push(
      `Recent completed games: ` +
      `${away}${awayRecord ? ` ${awayRecord.wins}-${awayRecord.losses}` : " —"} · ` +
      `${home}${homeRecord ? ` ${homeRecord.wins}-${homeRecord.losses}` : " —"}.`,
    );
  }

  details.push(
    `College football results can affect conference races, national rankings ` +
    `and the College Football Playoff picture.`,
  );

  return [
    {
      type: "why_it_matters",
      title: "Why It Matters",
      text: why,
    },
    {
      type: "event_context",
      title: "Tell Me More",
      text: details.join(" "),
    },
  ];
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
    getName(game.competition) === "Premier League"
      ? footballDataFetch<{
          standings: Array<{
            type: string;
            table: StandingRow[];
          }>;
        }>("/competitions/PL/standings")
      : Promise.resolve(null),

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
          home_score,
          away_score,
          week_label,
          season,
          source_notes,
          home_team:teams!games_home_team_id_fkey(id,name),
          away_team:teams!games_away_team_id_fkey(id,name),
          competition:competitions!games_competition_id_fkey(name),
          sport:sports!games_sport_id_fkey(id,name)
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

    let insights: Insight[] = [
      ...buildStoredGameInsights(game),
      ...buildMatchupGuide(game),
    ];

    if (getName(game.sport) === "College Football") {
      const collegeFootballInsights =
        await buildCollegeFootballInsights(game);

      insights = [
        ...collegeFootballInsights,
        ...insights.filter(
          (item) =>
            item.type !== "why_it_matters" &&
            item.type !== "event_context",
        ),
      ];
    }

    if (
      getName(game.sport) === "Soccer" &&
      game.external_provider ===
        "football-data"
    ) {
      const providerInsights =
        await buildFootballDataInsights(
          game,
        );

      insights = [
        ...insights,
        ...providerInsights,
      ];
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
        weekLabel: game.week_label,
        season: game.season,
        sourceNotes: game.source_notes,
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
