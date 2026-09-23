import { NextResponse } from "next/server";

type TableRow = {
  position: number;
  team: string;
  abbreviation?: string;
  logo?: string;
  played?: string;
  wins?: string;
  draws?: string;
  losses?: string;
  goalsFor?: string;
  goalsAgainst?: string;
  overtimeLosses?: string;
  differential?: string;
  points?: string;
  record?: string;
  previous?: string;
  percentage?: string;
  gamesBack?: string;
  note?: string;
};

type TableGroup = {
  name: string;
  rows: TableRow[];
};

type SoccerEntry = {
  team?: { displayName?: string; name?: string; abbreviation?: string; logos?: Array<{ href?: string }> };
  stats?: Array<{ name?: string; displayValue?: string }>;
  note?: { description?: string };
};

type RankingEntry = {
  current?: number;
  previous?: number;
  recordSummary?: string;
  team?: {
    nickname?: string;
    location?: string;
    name?: string;
    abbreviation?: string;
    logos?: Array<{ href?: string }>;
  };
};

type NhlStanding = {
  divisionName?: string;
  divisionSequence?: number;
  teamName?: { default?: string };
  teamAbbrev?: { default?: string };
  teamLogo?: string;
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  points?: number;
  seasonId?: number;
};

type MlbTeamRecord = {
  divisionRank?: string;
  team?: { id?: number; name?: string; abbreviation?: string };
  leagueRecord?: { wins?: number; losses?: number; pct?: string };
  gamesBack?: string;
};

type MlbDivisionRecord = {
  division?: { nameShort?: string; name?: string };
  teamRecords?: MlbTeamRecord[];
};

const ESPN_SOCCER: Record<string, { league: string; title: string }> = {
  "premier-league": { league: "eng.1", title: "Premier League" },
  "champions-league": { league: "uefa.champions", title: "Champions League" },
  "league-one": { league: "eng.3", title: "League One" },
};

const ESPN_RANKINGS: Record<string, { path: string; title: string }> = {
  "college-football": {
    path: "football/college-football",
    title: "College Football",
  },
  "college-basketball": {
    path: "basketball/mens-college-basketball",
    title: "College Basketball",
  },
  volleyball: {
    path: "volleyball/womens-college-volleyball",
    title: "College Volleyball",
  },
};

function statValue(
  stats: Array<{ name?: string; displayValue?: string }> | undefined,
  name: string,
) {
  return stats?.find((stat) => stat.name === name)?.displayValue ?? "—";
}

async function getSoccerTable(id: string) {
  const config = ESPN_SOCCER[id];
  const response = await fetch(
    `https://site.web.api.espn.com/apis/v2/sports/soccer/${config.league}/standings`,
    { next: { revalidate: 1800 } },
  );

  if (!response.ok) throw new Error(`${config.title} table is unavailable.`);
  const data = await response.json();
  const entries = data?.children?.[0]?.standings?.entries ?? [];

  return {
    id,
    title: config.title,
    subtitle: data?.children?.[0]?.name ?? "Current season",
    kind: "soccer",
    columns: [
      { key: "points", label: "Pts" },
      { key: "played", label: "P" },
      { key: "wins", label: "W" },
      { key: "draws", label: "D" },
      { key: "losses", label: "L" },
      { key: "goalsFor", label: "GF" },
      { key: "goalsAgainst", label: "GA" },
      { key: "differential", label: "GD" },
    ],
    groups: [{
      name: config.title,
      rows: entries.map((entry: SoccerEntry, index: number): TableRow => ({
        position: Number(statValue(entry.stats, "rank")) || index + 1,
        team: entry.team?.displayName ?? entry.team?.name ?? "Team",
        abbreviation: entry.team?.abbreviation,
        logo: entry.team?.logos?.[0]?.href,
        played: statValue(entry.stats, "gamesPlayed"),
        wins: statValue(entry.stats, "wins"),
        draws: statValue(entry.stats, "ties"),
        losses: statValue(entry.stats, "losses"),
        goalsFor: statValue(entry.stats, "pointsFor"),
        goalsAgainst: statValue(entry.stats, "pointsAgainst"),
        differential: statValue(entry.stats, "pointDifferential"),
        points: statValue(entry.stats, "points"),
        note: entry.note?.description,
      })),
    }],
  };
}

async function getRankings(id: string) {
  const config = ESPN_RANKINGS[id];
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${config.path}/rankings`,
    { next: { revalidate: 1800 } },
  );

  if (!response.ok) throw new Error(`${config.title} rankings are unavailable.`);
  const data = await response.json();
  const poll = data?.rankings?.[0];
  const ranks = poll?.ranks ?? [];

  return {
    id,
    title: config.title,
    subtitle: poll?.headline ?? poll?.name ?? "Top 25",
    kind: "rankings",
    columns: [
      { key: "record", label: "Record" },
      { key: "previous", label: "Prev" },
    ],
    groups: [{
      name: poll?.name ?? "Top 25",
      rows: ranks.map((rank: RankingEntry): TableRow => ({
        position: Number(rank.current),
        team:
          rank.team?.nickname ??
          rank.team?.location ??
          rank.team?.name ??
          "Team",
        abbreviation: rank.team?.abbreviation,
        logo: rank.team?.logos?.[0]?.href,
        record: rank.recordSummary ?? "—",
        previous: rank.previous ? String(rank.previous) : "NR",
      })),
    }],
  };
}

async function getNhlStandings() {
  const response = await fetch("https://api-web.nhle.com/v1/standings/now", {
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new Error("NHL standings are unavailable.");
  const data = await response.json();
  const rows = data?.standings ?? [];
  const divisionOrder = ["Atlantic", "Metropolitan", "Central", "Pacific"];

  const groups: TableGroup[] = divisionOrder
    .map((division) => ({
      name: `${division} Division`,
      rows: rows
        .filter((row: NhlStanding) => row.divisionName === division)
        .sort((a: NhlStanding, b: NhlStanding) =>
          (a.divisionSequence ?? 99) - (b.divisionSequence ?? 99),
        )
        .map((row: NhlStanding): TableRow => ({
          position: Number(row.divisionSequence),
          team: row.teamName?.default ?? row.teamAbbrev?.default ?? "Team",
          abbreviation: row.teamAbbrev?.default,
          logo: row.teamLogo,
          played: String(row.gamesPlayed ?? "—"),
          wins: String(row.wins ?? "—"),
          losses: String(row.losses ?? "—"),
          overtimeLosses: String(row.otLosses ?? "—"),
          points: String(row.points ?? "—"),
        })),
    }))
    .filter((group) => group.rows.length > 0);

  const seasonId = rows[0]?.seasonId ? String(rows[0].seasonId) : "";
  const season = seasonId.length === 8
    ? `${seasonId.slice(0, 4)}–${seasonId.slice(6)}`
    : "Current season";

  return {
    id: "nhl",
    title: "NHL",
    subtitle: `${season} standings`,
    kind: "nhl",
    columns: [
      { key: "played", label: "GP" },
      { key: "wins", label: "W" },
      { key: "losses", label: "L" },
      { key: "overtimeLosses", label: "OT" },
      { key: "points", label: "Pts" },
    ],
    groups,
  };
}

async function getMlbStandings() {
  const season = new Date().getUTCFullYear();
  const response = await fetch(
    `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=division,team`,
    { next: { revalidate: 1800 } },
  );
  if (!response.ok) throw new Error("MLB standings are unavailable.");
  const data = await response.json();

  const groups: TableGroup[] = (data?.records ?? []).map((record: MlbDivisionRecord) => ({
    name: record.division?.nameShort ?? record.division?.name ?? "Division",
    rows: (record.teamRecords ?? []).map((row: MlbTeamRecord, index: number): TableRow => ({
      position: Number(row.divisionRank) || index + 1,
      team: row.team?.name ?? "Team",
      abbreviation: row.team?.abbreviation,
      logo: row.team?.id
        ? `https://www.mlbstatic.com/team-logos/${row.team.id}.svg`
        : undefined,
      wins: String(row.leagueRecord?.wins ?? "—"),
      losses: String(row.leagueRecord?.losses ?? "—"),
      percentage: row.leagueRecord?.pct ?? "—",
      gamesBack: row.gamesBack ?? "—",
    })),
  }));

  return {
    id: "mlb",
    title: "MLB",
    subtitle: `${season} regular season`,
    kind: "mlb",
    columns: [
      { key: "wins", label: "W" },
      { key: "losses", label: "L" },
      { key: "percentage", label: "PCT" },
      { key: "gamesBack", label: "GB" },
    ],
    groups,
  };
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("competition") ?? "premier-league";
    if (ESPN_SOCCER[id]) return NextResponse.json(await getSoccerTable(id));
    if (ESPN_RANKINGS[id]) return NextResponse.json(await getRankings(id));
    if (id === "nhl") return NextResponse.json(await getNhlStandings());
    if (id === "mlb") return NextResponse.json(await getMlbStandings());
    return NextResponse.json({ error: "Unknown competition." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Standings are unavailable." },
      { status: 502 },
    );
  }
}
