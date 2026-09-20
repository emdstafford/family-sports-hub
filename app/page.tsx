"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  display_name: string;
  initials: string | null;
  is_admin: boolean;
  sort_order: number;
  avatar_url?: string | null;
};

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
};

type Sport =
  | "All"
  | "Soccer"
  | "College Football"
  | "College Basketball"
  | "Volleyball"
  | "Hockey"
  | "Baseball"
  | "Cheerleading";

type ProfileSport = {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  active: boolean;
};

type ProfileTeam = {
  id: string;
  sport_id: string;
  name: string;
  short_name: string | null;
  abbreviation: string | null;
  logo_url: string | null;
};

type ProfileSportChoice = {
  sportId: string;
  interestType: "follow" | "play_follow";
};

type LockerTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  sport: string;
  is_primary: boolean;
};

type LockerPlayer = {
  id: string;
  display_name: string;
  initials: string | null;
  teams: LockerTeam[];
};

type ApiGame = {
  id: string;
  sport: string;
  competition: string;
  home: string;
  away: string;
  startsAt: string | null;
  startTimeTbd: boolean;
  sourceNotes: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  externalProvider: string | null;
  externalId: string | null;
};

type BrowserGame = {
  id: string;
  sport: Sport;
  competition: string;
  home: string;
  away: string;
  startsAt: string | null;
  startTimeTbd: boolean;
  sourceNotes: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  externalProvider: string | null;
  externalId: string | null;
  icon: string;
  liveData: boolean;
};

type GameRoomMessage = {
  id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  player_initials: string;
  message: string;
  created_at: string;
};

type GameRoomPick = {
  player_id: string;
  display_name: string;
  initials: string | null;
  pick_choice: PickChoice | null;
};

type GameRoomLiveEvent = {
  id: string;
  message: string;
  created_at: string;
};

type PickChoice = "home" | "away" | "draw";

type SavedPick = {
  game_id: string;
  pick_choice: PickChoice;
  submitted_at: string;
};

type ChallengePickStatusRow = {
  player_id: string;
  display_name: string;
  picks_made: number;
};

type ChallengePickStatus = Record<string, number>;

type LeaderboardRow = {
  player_id: string;
  display_name: string;
  initials: string;
  points: number;
  correct: number;
  completed_picks: number;
  total_picks: number;
  accuracy: number;
};

type RecordBookAchievement = {
  weeklyWins: number;
  fullCards: number;
  perfectTens: number;
  bestWeekCorrect: number;
  bestWeekAccuracy: number;
  maxWinStreak: number;
  backToBack: boolean;
};

type CollegeFootballRanking = {
  team_name: string;
  rank: number;
  season: number;
  week: number;
  poll: string;
};

const sportButtons: Sport[] = [
  "All",
  "Soccer",
  "College Football",
  "College Basketball",
  "Volleyball",
  "Hockey",
  "Baseball",
  "Cheerleading",
];

function formatGameDate(startsAt: string | null) {
  if (!startsAt) return "Date TBD";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(startsAt));
}

function formatGameTime(
  startsAt: string | null,
  startTimeTbd: boolean,
) {
  if (startTimeTbd || !startsAt) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(startsAt));
}

function normalizeLockerTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|afc|cf|the|men|mens|women|womens|wildcats|football|basketball|hockey|baseball|soccer)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type TrophyTeamSport = "soccer" | "college-football" | "college-basketball" | "volleyball" | "hockey" | "baseball";

function lockerTeamCountsForTrophy(team: LockerTeam, target: TrophyTeamSport) {
  const sport = team.sport.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const teamName = `${team.name} ${team.short_name ?? ""}`.toLowerCase();

  if (target === "soccer") {
    return sport.includes("soccer") || /\b(fc|afc)\b/.test(teamName) || ["arsenal", "liverpool", "aston villa", "wimbledon"].some((name) => teamName.includes(name));
  }

  if (target === "college-football") {
    return sport.includes("college football") || sport.includes("ncaa football") || sport === "football" || sport === "cfb";
  }

  if (target === "college-basketball") {
    return sport.includes("college basketball") || sport.includes("ncaa basketball") || sport === "basketball";
  }

  if (target === "volleyball") {
    return sport.includes("volleyball");
  }

  if (target === "hockey") {
    return sport.includes("hockey") || sport === "nhl" || ["canucks", "ice dawgs"].some((name) => teamName.includes(name));
  }

  return sport.includes("baseball") || sport === "mlb" || ["braves", "cubs"].some((name) => teamName.includes(name));
}

function lockerTeamLogo(team: LockerTeam) {
  const name = team.name.trim().toLowerCase();
  if (name.includes("rock lobster")) {
    return "/logos/athens-rock-lobsters.webp";
  }
  if (name.includes("kentucky") && team.sport === "Hockey") {
    return "/logos/kentucky-hockey.webp";
  }
  if (
    team.sport === "College Football" &&
    ["georgia", "georgia bulldogs", "georgia bulldogs football", "university of georgia"].includes(name)
  ) {
    return "https://a.espncdn.com/i/teamlogos/ncaa/500/61.png";
  }
  return team.logo_url;
}

function lockerTeamColors(team: LockerTeam) {
  const name = team.name.toLowerCase();

  if (name.includes("arsenal")) return { primary: "#EF0107", secondary: "#FFFFFF", accent: "#063672" };
  if (name.includes("liverpool")) return { primary: "#C8102E", secondary: "#FFFFFF", accent: "#00B2A9" };
  if (name.includes("aston villa")) return { primary: "#670E36", secondary: "#95BFE5", accent: "#FEE505" };
  if (name.includes("wimbledon")) return { primary: "#0047AB", secondary: "#FFD100", accent: "#FFFFFF" };
  if (name.includes("kentucky")) return { primary: "#0033A0", secondary: "#FFFFFF", accent: "#C8C9C7" };
  if (name.includes("vancouver") || name.includes("canucks")) return { primary: "#00205B", secondary: "#00843D", accent: "#FFFFFF" };
  if (name.includes("rock lobster")) return { primary: "#E21D2D", secondary: "#071B36", accent: "#FFFFFF" };
  if (name.includes("georgia")) return { primary: "#BA0C2F", secondary: "#000000", accent: "#FFFFFF" };
  if (name.includes("atlanta braves") || name.includes("braves")) return { primary: "#CE1141", secondary: "#13274F", accent: "#FFFFFF" };
  if (name.includes("atlanta vibe") || name === "vibe") return { primary: "#27C7D4", secondary: "#10254A", accent: "#FF5E78" };

  return { primary: "#10254a", secondary: "#f3c64f", accent: "#FFFFFF" };
}

function lockerUniformAsset(team: LockerTeam) {
  const name = team.name.toLowerCase();

  if (name.includes("aston villa")) return "/uniforms/aston-villa.webp";
  if (name.includes("arsenal")) return "/uniforms/arsenal.webp";
  if (name.includes("liverpool")) return "/uniforms/liverpool.webp";
  if (name.includes("wimbledon")) return "/uniforms/afc-wimbledon.webp";
  if (name.includes("vancouver") || name.includes("canucks")) {
    return "/uniforms/vancouver-canucks.webp";
  }
  if (name.includes("rock lobster")) {
    return "/uniforms/athens-rock-lobsters.webp";
  }
  if (name.includes("kentucky") && team.sport === "Hockey") {
    return "/uniforms/kentucky-hockey.webp";
  }
  if (name.includes("kentucky") && team.sport === "Cheerleading") {
    return "/uniforms/kentucky-cheer.webp";
  }
  if (name.includes("kentucky") && team.sport === "College Football") {
    return "/uniforms/kentucky-football.webp";
  }
  if (name.includes("kentucky") && team.sport === "College Basketball") {
    return "/uniforms/kentucky-basketball.webp";
  }
  if (name.includes("kentucky") && team.sport === "Volleyball") {
    return "/uniforms/kentucky-volleyball.webp";
  }
  if (name.includes("georgia") && team.sport === "College Football") {
    return "/uniforms/georgia-football.webp";
  }
  if (name.includes("atlanta braves") || name === "braves") {
    return "/uniforms/atlanta-braves.webp";
  }
  if (name.includes("atlanta vibe") || name === "vibe") {
    return "/uniforms/atlanta-vibe.webp";
  }
  if (name.includes("chicago cubs") || name === "cubs") {
    return "/uniforms/chicago-cubs.webp";
  }

  return null;
}

function lockerTeamMatchesGame(team: LockerTeam, game: BrowserGame) {
  const sportFamily = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("football") || normalized === "cfb") return "football";
    if (normalized.includes("basketball")) return "basketball";
    if (normalized.includes("volleyball")) return "volleyball";
    if (normalized.includes("soccer")) return "soccer";
    if (normalized.includes("hockey") || normalized === "nhl") return "hockey";
    if (normalized.includes("baseball") || normalized === "mlb") return "baseball";
    return normalized.replace(/[^a-z0-9]+/g, " ").trim();
  };

  // Favorite-team records sometimes use a shorter sport label (for example,
  // "Football") than the game feed ("College Football"). Match the sport
  // family so a valid upcoming game is not hidden from the locker.
  if (sportFamily(team.sport) !== sportFamily(game.sport)) return false;

  const lockerName = normalizeLockerTeamName(team.name);
  const shortName = normalizeLockerTeamName(team.short_name ?? "");
  const home = normalizeLockerTeamName(game.home);
  const away = normalizeLockerTeamName(game.away);

  const candidates = [lockerName, shortName].filter((name) => name.length >= 3);

  // Locker matching must be exact after normalization. Partial matching made
  // "Kentucky" incorrectly match schools such as Kentucky Wesleyan.
  return candidates.some((name) => home === name || away === name);
}

function nextLockerGame(team: LockerTeam, games: BrowserGame[]) {
  const now = Date.now();
  return games
    .filter((game) => {
      if (!game.startsAt || !lockerTeamMatchesGame(team, game)) return false;
      const status = (game.status ?? "").toLowerCase();
      const final = ["final", "finished", "complete", "completed", "closed"].some((value) =>
        status.includes(value),
      );
      return !final && new Date(game.startsAt).getTime() >= now - 3 * 60 * 60 * 1000;
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt ?? 0).getTime() -
        new Date(b.startsAt ?? 0).getTime(),
    )[0] ?? null;
}

function lockerOpponent(team: LockerTeam, game: BrowserGame) {
  const homeMatches = lockerTeamMatchesGame(team, { ...game, away: "__no_match__" });
  return homeMatches ? game.away : game.home;
}

function getStatusLabel(game: BrowserGame) {
  if (!game.liveData) return "SAMPLE";

  const normalizedStatus = (
    game.status ?? ""
  ).toLowerCase();

  const isFinal = [
    "final",
    "finished",
    "complete",
    "completed",
    "closed",
  ].some((status) =>
    normalizedStatus.includes(status),
  );

  if (isFinal) return "FINAL";
  if (game.startTimeTbd) return "TIME TBD";

  const startMs = game.startsAt
    ? new Date(game.startsAt).getTime()
    : Number.MAX_SAFE_INTEGER;

  const hasStarted = Date.now() >= startMs;

  const isLive =
    hasStarted &&
    (normalizedStatus.includes("live") ||
      normalizedStatus.includes("in_progress") ||
      normalizedStatus.includes("in progress"));

  return isLive ? "LIVE" : "SCHEDULED";
}

function getEasternDateParts(value: Date | number | string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const get = (type: string) =>
    Number(
      parts.find((part) => part.type === type)?.value ??
        0,
    );

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function getEasternDateKey(
  value: Date | number | string,
) {
  const { year, month, day } =
    getEasternDateParts(value);

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function getTomorrowEasternDateKey(
  currentTime: number,
) {
  const { year, month, day } =
    getEasternDateParts(currentTime);

  return new Date(
    Date.UTC(year, month - 1, day + 1),
  )
    .toISOString()
    .slice(0, 10);
}

function isTomorrowGame(
  game: BrowserGame,
  currentTime: number | null,
) {
  if (!game.startsAt) return false;

  const now = currentTime ?? Date.now();

  return (
    getEasternDateKey(game.startsAt) ===
    getTomorrowEasternDateKey(now)
  );
}

function gameIsLocked(
  game: BrowserGame,
  currentTime: number | null,
) {
  if (game.startTimeTbd) return true;
  if (!game.startsAt) return true;
  if (currentTime === null) return false;

  return (
    currentTime >=
    new Date(game.startsAt).getTime()
  );
}


type WatchInfo = {
  score: number;
  label:
    | "🔥 Must Watch"
    | "⭐ Big Game"
    | "❤️ FamBam Game"
    | "👀 Keep an Eye On";
  reasons: string[];
};

function normalizeTeamName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(bulldogs|wildcats|crimson tide|tigers|rebels|cardinals|buckeyes|ducks|fighting irish|longhorns|hoosiers|hurricanes|aggies|sooners|red raiders|trojans|cougars|wolverines|huskies|nittany lions|mustangs|volunteers|utes|hawkeyes)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function canonicalTeamName(name: string) {
  const normalized = normalizeTeamName(name);

  const aliases: Record<string, string> = {
    arsenalfc: "arsenal",
    arsenal: "arsenal",
    liverpoolfc: "liverpool",
    liverpool: "liverpool",
    astonvillafc: "astonvilla",
    astonvilla: "astonvilla",
    chelseafc: "chelsea",
    chelsea: "chelsea",
    manchestercityfc: "manchestercity",
    manchestercity: "manchestercity",
    manchesterunitedfc: "manchesterunited",
    manchesterunited: "manchesterunited",
    tottenhamhotspurfc: "tottenham",
    tottenhamhotspur: "tottenham",
    tottenham: "tottenham",
    afcwimbledon: "afcwimbledon",
    mkdons: "mkdons",

    // Keep these college teams deliberately distinct.
    // "Georgia" means the University of Georgia only.
    georgia: "georgia",
    georgiastate: "georgiastate",
    georgiatech: "georgiatech",
    kentucky: "kentucky",
  };

  return aliases[normalized] ?? normalized;
}

function teamNameMatches(actualName: string, wantedName: string) {
  return canonicalTeamName(actualName) === canonicalTeamName(wantedName);
}

function hasTeam(game: BrowserGame, team: string) {
  return (
    teamNameMatches(game.home, team) ||
    teamNameMatches(game.away, team)
  );
}

function hasMatchup(
  game: BrowserGame,
  teamA: string,
  teamB: string,
) {
  return hasTeam(game, teamA) && hasTeam(game, teamB);
}

function getTeamRank(
  teamName: string,
  rankings: CollegeFootballRanking[],
) {
  const target = normalizeTeamName(teamName);

  return (
    rankings.find(
      (ranking) =>
        normalizeTeamName(ranking.team_name) === target,
    )?.rank ?? null
  );
}

function rankedTeamLabel(
  teamName: string,
  rankings: CollegeFootballRanking[],
) {
  const rank = getTeamRank(teamName, rankings);
  return rank ? `#${rank} ${teamName}` : teamName;
}

function getWatchInfo(
  game: BrowserGame,
  rankings: CollegeFootballRanking[],
): WatchInfo {
  let score = 0;
  const reasons: string[] = [];

  const isCollegeFootball =
    game.sport === "College Football";

  const isCollegeFamilyGame =
    isCollegeFootball &&
    (hasTeam(game, "kentucky") ||
      hasTeam(game, "georgia"));

  const isSoccerFamilyGame =
    game.sport === "Soccer" &&
    ["arsenal", "liverpool", "aston villa", "afc wimbledon"].some(
      (team) => hasTeam(game, team),
    );

  const isFamilyGame =
    isCollegeFamilyGame || isSoccerFamilyGame;

  if (isFamilyGame) {
    score += 80;
    reasons.push("FamBam team");
  }

  const rivalries: Array<[string, string, string]> = [
    ["arsenal", "chelsea", "London rivalry"],
    ["arsenal", "tottenham", "North London rivalry"],
    ["arsenal", "manchester united", "historic rivalry"],
    ["liverpool", "everton", "Merseyside derby"],
    ["liverpool", "manchester united", "historic rivalry"],
    ["aston villa", "birmingham", "Second City derby"],
    ["afc wimbledon", "mk dons", "major club rivalry"],
    ["georgia", "florida", "major SEC rivalry"],
    ["georgia", "auburn", "Deep South rivalry"],
    ["georgia", "georgia tech", "Clean, Old-Fashioned Hate"],
    ["kentucky", "louisville", "in-state rivalry"],
    ["kentucky", "tennessee", "SEC rivalry"],
  ];

  const rivalry = rivalries.find(([a, b]) =>
    hasMatchup(game, a, b),
  );

  if (rivalry) {
    score += 80;
    reasons.push(rivalry[2]);
  }

  if (isCollegeFootball) {
    const homeRank = getTeamRank(game.home, rankings);
    const awayRank = getTeamRank(game.away, rankings);
    const ranks = [homeRank, awayRank].filter(
      (rank): rank is number => rank !== null,
    );

    if (homeRank && awayRank) {
      // Ranked-vs-ranked should always be one of the week's headline games.
      score += 100;
      reasons.push(
        `#${awayRank} vs #${homeRank} ranked matchup`,
      );

      if (Math.min(homeRank, awayRank) <= 10) {
        score += 25;
        reasons.push("Top-10 team");
      }
    } else if (ranks.length === 1) {
      const rank = ranks[0];

      if (rank <= 10) {
        score += 55;
        reasons.push(`Top-10 team (#${rank})`);
      } else if (rank <= 15) {
        score += 40;
        reasons.push(`Top-15 team (#${rank})`);
      } else {
        score += 25;
        reasons.push(`Top-25 team (#${rank})`);
      }
    }
  }

  const premierLeagueHeavyweights = [
    "arsenal",
    "chelsea",
    "liverpool",
    "manchester city",
    "manchester united",
    "tottenham",
  ].filter((team) => hasTeam(game, team));

  if (
    game.competition === "Premier League" &&
    premierLeagueHeavyweights.length >= 2
  ) {
    score += 50;
    reasons.push("major Premier League matchup");
  }

  if (game.competition === "UEFA Champions League") {
    score += 40;
    reasons.push("Champions League");
  }

  if (
    game.competition === "EFL League One" &&
    hasTeam(game, "afc wimbledon")
  ) {
    score += 15;
    reasons.push("Wimbledon league match");
  }

  let label: WatchInfo["label"];

  if (score >= 130) {
    label = "🔥 Must Watch";
  } else if (score >= 95) {
    label = "⭐ Big Game";
  } else if (isFamilyGame) {
    label = "❤️ FamBam Game";
  } else {
    label = "👀 Keep an Eye On";
  }

  return {
    score,
    label,
    reasons:
      reasons.length > 0
        ? reasons
        : ["worth watching this week"],
  };
}


function getCompetitionExplainer(
  game: BrowserGame,
): string[] {
  const competition = (
    game.competition ?? ""
  ).toLowerCase();

  if (competition.includes("premier league")) {
    return [
      "The Premier League is a season-long table. A win earns 3 points, a draw earns 1, and a loss earns 0.",
      "Each club plays 38 league matches, so this result contributes directly to the title race, European places, or the relegation fight.",
      "When teams finish level on points, goal difference becomes an important tiebreaker — so the score can matter beyond simply winning or losing.",
    ];
  }

  if (
    competition.includes("champions league") ||
    competition.includes("uefa champions")
  ) {
    return [
      "The Champions League brings together Europe's top clubs rather than teams from only one domestic league.",
      "In the current format, 36 clubs share one league-phase table and each club plays eight different opponents — four at home and four away.",
      "League-phase position affects who advances directly, who must survive an extra playoff round, and the path into the knockout rounds.",
    ];
  }

  if (
    competition.includes("fa cup") ||
    competition.includes("efl cup") ||
    competition.includes("league cup")
  ) {
    return [
      "This is a cup competition, so league-table points are not at stake.",
      "Cup matches are about advancement: survive the tie and move closer to a trophy; lose and the cup run ends.",
      "Cup games can create some of English football's best upset stories when a smaller club gets a chance against a bigger one.",
    ];
  }

  if (
    competition.includes("league one") ||
    competition.includes("efl league one")
  ) {
    return [
      "League One is part of England's promotion and relegation system, so every league result affects the race up or down the pyramid.",
      "The top two clubs earn automatic promotion, while the next four enter the promotion playoffs.",
      "Results near the bottom matter too because the lowest clubs are relegated to League Two.",
    ];
  }

  if (game.sport === "College Football") {
    return [
      "College football results can affect conference races, national rankings, and the College Football Playoff picture.",
      "Ranked matchups matter even more because one result can move both teams significantly in the national conversation.",
      "Conference games become especially important because they help determine who reaches the conference championship.",
    ];
  }

  if (game.sport === "College Basketball") {
    return [
      "College basketball results build a team's résumé for conference positioning and eventually the NCAA Tournament.",
      "Conference games affect league standings, while strong wins can become important when tournament selections and seeding are decided.",
    ];
  }

  if (game.sport === "Hockey") {
    return [
      "NHL games contribute to the standings through points, so results build toward division position and the playoff race.",
      "As the season progresses, games against nearby teams in the standings can have an especially large playoff impact.",
    ];
  }

  if (game.sport === "Baseball") {
    return [
      "MLB teams are building toward division championships and Wild Card places across a long regular season.",
      "Series against division opponents can become especially important because they affect both teams competing in the same race.",
    ];
  }

  if (game.sport === "Volleyball") {
    return [
      "College volleyball matches help shape conference standings, national rankings, and the résumé used for NCAA Tournament selection.",
      "Conference matches become particularly valuable later in the season as teams fight for championships and postseason positioning.",
    ];
  }

  return [
    "This section will teach you what this competition means, what is at stake, and how this game fits into the bigger season.",
  ];
}

function getGameContext(
  game: BrowserGame,
  rankings: CollegeFootballRanking[],
) {
  if (game.sport === "College Football") {
    const homeRank = getTeamRank(game.home, rankings);
    const awayRank = getTeamRank(game.away, rankings);

    if (homeRank && awayRank) {
      if (homeRank <= 5 && awayRank <= 5) {
        return "Two Top-5 teams meet in one of the biggest games of the week.";
      }
      return `A ranked-vs-ranked matchup with #${awayRank} ${game.away} visiting #${homeRank} ${game.home}.`;
    }

    const rankedTeam = awayRank
      ? { rank: awayRank, team: game.away, opponent: game.home, away: true }
      : homeRank
        ? { rank: homeRank, team: game.home, opponent: game.away, away: false }
        : null;

    if (rankedTeam) {
      if (hasTeam(game, "Kentucky") && rankedTeam.team !== "Kentucky") {
        return `Kentucky gets a home shot at the #${rankedTeam.rank} team in the country.`;
      }
      if (hasTeam(game, "Georgia")) {
        return `Georgia brings a #${rankedTeam.rank} ranking into this week's matchup.`;
      }
      return `#${rankedTeam.rank} ${rankedTeam.team} is one of the ranked teams to watch this week.`;
    }

    if (hasTeam(game, "Kentucky") || hasTeam(game, "Georgia")) {
      return "A FamBam college football game worth keeping on the radar.";
    }
  }

  if (game.sport === "Soccer") {
    if (game.competition === "Premier League") {
      if (
        hasTeam(game, "Arsenal") ||
        hasTeam(game, "Liverpool") ||
        hasTeam(game, "Aston Villa")
      ) {
        return "A Premier League match featuring one of the FamBam teams.";
      }
      return "A Premier League matchup worth watching this week.";
    }

    if (game.competition === "UEFA Champions League") {
      return "A Champions League night with European stakes.";
    }
  }

  return "One of this week's FamBam Challenge games.";
}


type PassportMemory = { playerId: string; playerName: string; note: string };
type PassportEntry = {
  id: string;
  createdByPlayerId?: string;
  gameId?: string;
  sport: "Football" | "MLB" | "Tour";
  visitType?: "game" | "tour";
  date: string;
  away: string;
  home: string;
  venue: string;
  city: string;
  state: string;
  awayScore: string;
  homeScore: string;
  result: "W" | "L" | "T" | "";
  attendeeIds: string[];
  attendeeNames: string[];
  memories: PassportMemory[];
  photos: string[];
  entryType?: "passport" | "family";
  familyCategory?: string;
  familyMilestone?: string;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

const STATE_NAMES: Record<string,string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};

function passportEntryTitle(entry: PassportEntry) {
  if (entry.entryType === "family") return entry.away;
  return entry.visitType === "tour" || entry.sport === "Tour"
    ? `${entry.venue} Stadium Tour`
    : `${entry.away} at ${entry.home}`;
}

function familyEventIcon(category?: string) {
  if (category === "Volleyball") return "🏐";
  if (category === "Cheer") return "📣";
  if (category === "Chorus") return "🎶";
  if (category === "Theater") return "🎭";
  if (category === "School") return "🎓";
  return "⭐";
}

async function preparePhotoForUpload(
  file: File,
  aspectRatio: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This picture could not be opened on your device."));
    image.src = sourceUrl;
  });

  URL.revokeObjectURL(sourceUrl);

  const sourceAspect = image.naturalWidth / image.naturalHeight;
  let baseWidth = image.naturalWidth;
  let baseHeight = image.naturalHeight;

  if (sourceAspect > aspectRatio) {
    baseWidth = image.naturalHeight * aspectRatio;
  } else {
    baseHeight = image.naturalWidth / aspectRatio;
  }

  const cropWidth = baseWidth / zoom;
  const cropHeight = baseHeight / zoom;
  const availableX = Math.max(0, image.naturalWidth - cropWidth);
  const availableY = Math.max(0, image.naturalHeight - cropHeight);
  const sourceX = Math.max(0, Math.min(availableX, availableX * ((offsetX + 100) / 200)));
  const sourceY = Math.max(0, Math.min(availableY, availableY * ((offsetY + 100) / 200)));
  const canvas = document.createElement("canvas");
  canvas.width = aspectRatio === 1 ? 1200 : 1600;
  canvas.height = Math.round(canvas.width / aspectRatio);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This device could not prepare the picture.");

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("This picture could not be prepared.")),
      "image/jpeg",
      0.84,
    );
  });
}

type PhotoCropRequest = {
  file: File;
  previewUrl: string;
  purpose: "profile" | "passport";
  eventId?: string;
};

const EVENT_NAMES: Record<string, string> = {
  "mlb-playoffs-world-series": "MLB Playoffs & World Series",
  "nfl-playoffs-super-bowl": "NFL Playoffs & Super Bowl",
  "sec-basketball-tournaments": "SEC Basketball Tournaments",
  "college-world-series": "College World Series",
  "pro-volleyball-playoffs": "Pro Volleyball Playoffs",
  "carabao-cup": "Carabao Cup",
  "champions-league": "Champions League",
  "europa-league": "Europa League",
  "conference-league": "Conference League",
  "womens-champions-league": "Women’s Champions League",
  "stanley-cup": "Stanley Cup",
  "acha-college-hockey-postseason": "ACHA College Hockey Postseason",
  "sphl-presidents-cup": "SPHL President’s Cup Playoffs",
  "efl-trophy": "EFL Trophy",
  "fa-cup": "FA Cup",
  "bowl-pickem": "Bowl Pick’em",
  "college-football-playoff": "College Football Playoff",
  "mens-march-madness": "Men’s March Madness",
  "womens-march-madness": "Women’s March Madness",
  "uca-college-cheer-nationals": "UCA College Cheer Nationals",
  "sec-volleyball-tournament": "SEC Volleyball Tournament",
  "ncaa-volleyball-tournament": "NCAA Volleyball Tournament",
  "kentucky-derby": "Kentucky Derby",
  "triple-crown": "Triple Crown",
  "world-cups-euros": "World Cups & Euros",
  olympics: "Olympics",
};

function eventIdFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [challenge, setChallenge] =
    useState<Challenge | null>(null);

  const [leaderboard, setLeaderboard] =
    useState<LeaderboardRow[]>([]);

  const [recordBookLeaderboard, setRecordBookLeaderboard] =
    useState<LeaderboardRow[]>([]);

  const [recordBookAchievements, setRecordBookAchievements] =
    useState<Record<string, RecordBookAchievement>>({});

  const [collegeFootballRankings, setCollegeFootballRankings] =
    useState<CollegeFootballRanking[]>([]);

  const [realGames, setRealGames] =
    useState<BrowserGame[]>([]);

  const [challengeGameIds, setChallengeGameIds] =
    useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(true);

  const [currentTime, setCurrentTime] =
    useState<number | null>(null);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const [gamesError, setGamesError] =
    useState<string | null>(null);

  const [selectedPlayer, setSelectedPlayer] =
    useState<Player | null>(null);


  const [signedInPlayer, setSignedInPlayer] =
    useState<Player | null>(null);

  const [pin, setPin] = useState("");
  const [pinEmojis, setPinEmojis] =
    useState(["🏈", "⚽", "🏀", "⚾"]);
  const [pinError, setPinError] =
    useState<string | null>(null);

  const [checkingPin, setCheckingPin] =
    useState(false);

  const [activeSport, setActiveSport] =
    useState<Sport>("All");

  const [activeWatchFilter, setActiveWatchFilter] =
    useState<
      | "All"
      | "Must Watch"
      | "Big Game"
      | "FamBam"
      | "Worth Watching"
    >("All");

  const [trophyRoomOpen, setTrophyRoomOpen] =
    useState(false);

  const [lockerRoomOpen, setLockerRoomOpen] =
    useState(false);

  const [profileOpen, setProfileOpen] =
    useState(false);

  useEffect(() => {
    if (!profileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [profileOpen]);

  const [profileLoading, setProfileLoading] =
    useState(false);

  const [profileSaving, setProfileSaving] =
    useState(false);

  const [profileError, setProfileError] =
    useState<string | null>(null);

  const [notificationSupported, setNotificationSupported] = useState(true);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState({
    pickReminders: true,
    bigGameAlerts: true,
    trophyAlerts: true,
  });

  const [profileDisplayName, setProfileDisplayName] =
    useState("");

  const [profileInitials, setProfileInitials] =
    useState("");

  const [profileAvatarUrl, setProfileAvatarUrl] =
    useState<string | null>(null);

  const [profilePhotoUploading, setProfilePhotoUploading] =
    useState(false);

  const [photoCrop, setPhotoCrop] = useState<PhotoCropRequest | null>(null);
  const [photoCropZoom, setPhotoCropZoom] = useState(1);
  const [photoCropX, setPhotoCropX] = useState(0);
  const [photoCropY, setPhotoCropY] = useState(0);
  const [photoCropSaving, setPhotoCropSaving] = useState(false);
  const [photoCropError, setPhotoCropError] = useState<string | null>(null);

  const [profileSports, setProfileSports] =
    useState<ProfileSport[]>([]);

  const [profileTeams, setProfileTeams] =
    useState<ProfileTeam[]>([]);

  const [profileSportChoices, setProfileSportChoices] =
    useState<ProfileSportChoice[]>([]);

  const [profileFavoriteTeamIds, setProfileFavoriteTeamIds] =
    useState<string[]>([]);

  const [
    profilePrimaryTeamIdsBySport,
    setProfilePrimaryTeamIdsBySport,
  ] = useState<Record<string, string>>({});

  const [profileTeamSearch, setProfileTeamSearch] =
    useState("");

  const [profileAddingTeam, setProfileAddingTeam] =
    useState(false);

  const [lockerPlayers, setLockerPlayers] =
    useState<LockerPlayer[]>([]);

  const [lockerSportFilter, setLockerSportFilter] =
    useState("All");

  const [lockerLoading, setLockerLoading] =
    useState(false);

  const [trophyRoomPanel, setTrophyRoomPanel] =
    useState<null | "records" | "passport" | "memories">(null);

  const [selectedTrophy, setSelectedTrophy] =
    useState<{
      icon: string;
      title: string;
      note: string;
      progress?: string;
      milestone?: string;
      repeatable?: boolean;
      earned?: boolean;
    } | null>(null);

  const [passportView, setPassportView] =
    useState<"year" | "venue" | "states">("year");

  const [passportEntries, setPassportEntries] = useState<PassportEntry[]>([]);
  const [visitedStates, setVisitedStates] = useState<string[]>([]);
  const [passportAddOpen, setPassportAddOpen] = useState(false);
  const [passportEditingId, setPassportEditingId] = useState<string | null>(null);
  const [passportLoading, setPassportLoading] = useState(false);
  const [passportSaving, setPassportSaving] = useState(false);
  const [passportPhotoUploadingId, setPassportPhotoUploadingId] = useState<string | null>(null);
  const [passportPhotoViewer, setPassportPhotoViewer] = useState<{
    eventId: string;
    url: string;
    title: string;
    canDelete: boolean;
  } | null>(null);
  const [passportError, setPassportError] = useState<string | null>(null);
  const [stadiumSportFilter, setStadiumSportFilter] = useState<"All" | "Football" | "MLB" | "Tour">("All");
  const [passportAddMode, setPassportAddMode] = useState<"search" | "manual">("search");
  const [passportGameSearch, setPassportGameSearch] = useState("");
  const [passportAttendeeIds, setPassportAttendeeIds] = useState<string[]>([]);
  const [passportMyNote, setPassportMyNote] = useState("");
  const [passportMemoryEvent, setPassportMemoryEvent] = useState<PassportEntry | null>(null);
  const [passportMemoryNote, setPassportMemoryNote] = useState("");
  const [familyEventOpen, setFamilyEventOpen] = useState(false);
  const [familyEventSaving, setFamilyEventSaving] = useState(false);
  const [familyEventPhoto, setFamilyEventPhoto] = useState<File | null>(null);
  const [familyEventDraft, setFamilyEventDraft] = useState({
    date: "",
    title: "",
    category: "Volleyball",
    milestone: "",
    location: "",
    note: "",
    attendeeIds: [] as string[],
  });
  const [passportDraft, setPassportDraft] = useState<PassportEntry>({ id:"", sport:"Football", visitType:"game", date:"", away:"", home:"", venue:"", city:"", state:"", awayScore:"", homeScore:"", result:"", attendeeIds:[], attendeeNames:[], memories:[], photos:[] });

  const [activeSection, setActiveSection] =
    useState<"Home" | "Challenge" | "Events" | "Games" | "Locker Room" | "Trophy Room">("Home");

  const [selectedEventGuide, setSelectedEventGuide] =
    useState<null | {
      icon: string;
      name: string;
      sport: string;
      season: string;
      format: string;
      description: string;
      dates: string[];
      learning: string;
    }>(null);

  const [eventPicks, setEventPicks] =
    useState<Record<string, Record<string, PickChoice>>>({});
  const [eventProgress, setEventProgress] =
    useState<Record<string, {
      made: number;
      completed: number;
      correct: number;
      accuracy: number;
      trophies: {
        firstEventPick: boolean;
        cupExpert: boolean;
        perfectRound: boolean;
      };
    }>>({});
  const [eventPickSavingKey, setEventPickSavingKey] =
    useState<string | null>(null);
  const [eventPickMessage, setEventPickMessage] =
    useState<string | null>(null);
  const [eventPickMessageEventId, setEventPickMessageEventId] =
    useState<string | null>(null);
  const [hiddenEventIds, setHiddenEventIds] = useState<string[]>([]);
  const [showHiddenEvents, setShowHiddenEvents] = useState(false);
  const [eventVisibilitySavingId, setEventVisibilitySavingId] = useState<string | null>(null);
  const [eventVisibilityMessage, setEventVisibilityMessage] = useState<string | null>(null);

  const [adminGame, setAdminGame] =
    useState<BrowserGame | null>(null);

  const [adminPin, setAdminPin] = useState("");

  const [adminError, setAdminError] =
    useState<string | null>(null);

  const [addingGame, setAddingGame] =
    useState(false);

  const [picksOpen, setPicksOpen] =
    useState(false);

  const [picksUnlocked, setPicksUnlocked] =
    useState(false);

  const [picksError, setPicksError] =
    useState<string | null>(null);

  const [picksSuccess, setPicksSuccess] =
    useState<string | null>(null);

  const [loadingPicks, setLoadingPicks] =
    useState(false);

  const [savingPicks, setSavingPicks] =
    useState(false);

  const [pickChoices, setPickChoices] =
    useState<Record<string, PickChoice | null>>({});

  const [savedPickGameIds, setSavedPickGameIds] =
    useState<string[]>([]);

  const [gameRoomGame, setGameRoomGame] =
    useState<BrowserGame | null>(null);

  const [gameRoomMessages, setGameRoomMessages] =
    useState<GameRoomMessage[]>([]);

  const [gameRoomMessage, setGameRoomMessage] =
    useState("");

  const [gameRoomLoading, setGameRoomLoading] =
    useState(false);

  const [gameInsights, setGameInsights] =
    useState<
      Array<{
        type: string;
        title: string;
        text: string;
      }>
    >([]);

  const [gameInsightsLoading, setGameInsightsLoading] =
    useState(false);

  const [gameRoomSending, setGameRoomSending] =
    useState(false);

  const [gameRoomError, setGameRoomError] =
    useState<string | null>(null);

  const [gameRoomTypingName, setGameRoomTypingName] =
    useState<string | null>(null);

  const [gameRoomPicks, setGameRoomPicks] =
    useState<GameRoomPick[]>([]);

  const [challengeRevealedPicks, setChallengeRevealedPicks] =
    useState<Record<string, GameRoomPick[]>>({});

  const [gameRoomPicksRevealed, setGameRoomPicksRevealed] =
    useState(false);

  const [gameRoomPickedCount, setGameRoomPickedCount] =
    useState(0);

  const [gameRoomTotalPlayers, setGameRoomTotalPlayers] =
    useState(0);

  const [gameRoomPicksLoading, setGameRoomPicksLoading] =
    useState(false);

  const [gameRoomLiveEvents, setGameRoomLiveEvents] =
    useState<GameRoomLiveEvent[]>([]);

  const gameRoomScoreSnapshotRef = useRef<{
    gameId: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  } | null>(null);

  const gameRoomSeenLiveEventKeysRef =
    useRef<Set<string>>(new Set());

  const gameRoomBottomRef =
    useRef<HTMLDivElement | null>(null);

  const gameRoomTypingTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastTypingSignalAtRef =
    useRef(0);

  async function loadGameRoomMessages(game: BrowserGame) {
    if (!signedInPlayer) return;

    const sessionToken =
      window.localStorage.getItem("fambam_session_token");

    if (!sessionToken) {
      setGameRoomError("Your FamBam session has expired. Please switch players and sign in again.");
      return;
    }

    setGameRoomLoading(true);
    setGameRoomError(null);

    try {
      const params = new URLSearchParams({
        playerId: signedInPlayer.id,
        gameId: game.id,
      });

      const response = await fetch(
        `/api/game-room?${params.toString()}`,
        {
          headers: {
            "x-fambam-session": sessionToken,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to load the Game Room.",
        );
      }

      setGameRoomMessages(data.messages ?? []);
    } catch (error) {
      setGameRoomError(
        error instanceof Error
          ? error.message
          : "Unable to load the Game Room.",
      );
    } finally {
      setGameRoomLoading(false);
    }
  }

  useEffect(() => {
    if (!gameRoomGame) return;

    requestAnimationFrame(() => {
      gameRoomBottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
  }, [
    gameRoomGame?.id,
    gameRoomMessages.length,
    gameRoomLiveEvents.length,
    gameRoomTypingName,
  ]);

  function addGameRoomLiveEvent(
    eventKey: string,
    message: string,
  ) {
    if (
      gameRoomSeenLiveEventKeysRef.current.has(
        eventKey,
      )
    ) {
      return;
    }

    gameRoomSeenLiveEventKeysRef.current.add(
      eventKey,
    );

    setGameRoomLiveEvents((current) => [
      ...current,
      {
        id: eventKey,
        message,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  async function loadGameRoomPicks(
    game: BrowserGame,
    silent = false,
  ) {
    if (
      !signedInPlayer ||
      !challenge ||
      !challengeGameIds.includes(game.id)
    ) {
      setGameRoomPicks([]);
      setGameRoomPicksRevealed(false);
      setGameRoomPickedCount(0);
      setGameRoomTotalPlayers(0);
      return;
    }

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    if (!sessionToken) return;

    if (!silent) {
      setGameRoomPicksLoading(true);
    }

    try {
      const params = new URLSearchParams({
        playerId: signedInPlayer.id,
        gameId: game.id,
        challengeId: challenge.id,
      });

      const response = await fetch(
        `/api/game-room/picks?${params.toString()}`,
        {
          headers: {
            "x-fambam-session": sessionToken,
          },
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Unable to load FamBam picks.",
        );
      }

      setGameRoomPicks(
        (data.picks ?? []) as GameRoomPick[],
      );

      setGameRoomPicksRevealed(
        Boolean(data.revealed),
      );

      setGameRoomPickedCount(
        Number(data.pickedCount) || 0,
      );

      setGameRoomTotalPlayers(
        Number(data.totalPlayers) || 0,
      );
    } catch (error) {
      console.error(
        "Game Room picks load failed:",
        error,
      );
    } finally {
      if (!silent) {
        setGameRoomPicksLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!signedInPlayer || !challenge) return;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    if (!sessionToken) return;

    const gamesToReveal = realGames.filter(
      (game) =>
        challengeGameIds.includes(game.id) &&
        !game.startTimeTbd &&
        gameIsLocked(game, currentTime) &&
        !challengeRevealedPicks[game.id],
    );

    if (gamesToReveal.length === 0) return;

    let cancelled = false;

    async function loadRevealedChallengePicks(
      game: BrowserGame,
    ) {
      try {
        const params = new URLSearchParams({
          playerId: signedInPlayer!.id,
          gameId: game.id,
          challengeId: challenge!.id,
        });

        const response = await fetch(
          `/api/game-room/picks?${params.toString()}`,
          {
            headers: {
              "x-fambam-session": sessionToken!,
            },
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (
          !response.ok ||
          !data.revealed ||
          cancelled
        ) {
          return;
        }

        setChallengeRevealedPicks((current) => ({
          ...current,
          [game.id]:
            (data.picks ?? []) as GameRoomPick[],
        }));
      } catch (error) {
        console.error(
          "Challenge pick reveal failed:",
          error,
        );
      }
    }

    void Promise.all(
      gamesToReveal.map((game) =>
        loadRevealedChallengePicks(game),
      ),
    );

    return () => {
      cancelled = true;
    };
  }, [
    signedInPlayer?.id,
    challenge?.id,
    challengeGameIds,
    realGames,
    currentTime,
    challengeRevealedPicks,
  ]);

  async function loadEventPicks(eventId: string) {
    if (!signedInPlayer) return;
    const sessionToken = window.localStorage.getItem("fambam_session_token");
    if (!sessionToken) return;

    try {
      const params = new URLSearchParams({
        playerId: signedInPlayer.id,
        eventId,
      });
      const response = await fetch(`/api/event-picks?${params.toString()}`, {
        headers: { "x-fambam-session": sessionToken },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load event picks.");

      setEventPicks((current) => ({
        ...current,
        [eventId]: Object.fromEntries(
          (data.picks ?? []).map((pick: { gameId: string; pickChoice: PickChoice }) => [
            pick.gameId,
            pick.pickChoice,
          ]),
        ),
      }));
      setEventProgress((current) => ({
        ...current,
        [eventId]: {
          ...(data.progress ?? { made: 0, completed: 0, correct: 0, accuracy: 0 }),
          trophies: data.trophies ?? {
            firstEventPick: false,
            cupExpert: false,
            perfectRound: false,
          },
        },
      }));
    } catch (error) {
      console.error("Event picks load failed:", error);
    }
  }

  async function saveEventPick(
    eventId: string,
    game: BrowserGame,
    pickChoice: "home" | "away",
  ) {
    if (!signedInPlayer) return;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      )?.trim();

    setEventPickMessageEventId(eventId);

    if (!sessionToken) {
      setEventPickMessage(
        "Please enter your PIN again to save this pick.",
      );
      setSelectedPlayer(signedInPlayer);
      setSignedInPlayer(null);
      window.localStorage.removeItem(
        "fambam_player_id",
      );
      return;
    }

    const previousChoice =
      eventPicks[eventId]?.[game.id];
    const savingKey =
      `${eventId}:${game.id}`;

    setEventPicks((current) => ({
      ...current,
      [eventId]: {
        ...(current[eventId] ?? {}),
        [game.id]: pickChoice,
      },
    }));
    setEventPickSavingKey(savingKey);
    setEventPickMessage("Saving your pick…");

    try {
      const response = await fetch(
        "/api/event-picks",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            playerId:
              signedInPlayer.id,
            eventId,
            gameId: game.id,
            pickChoice,
            sessionToken,
          }),
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setSelectedPlayer(
            signedInPlayer,
          );
          setSignedInPlayer(null);
          window.localStorage.removeItem(
            "fambam_player_id",
          );
          window.localStorage.removeItem(
            "fambam_session_token",
          );
        }

        throw new Error(
          data?.error ??
            "Could not save this event pick.",
        );
      }

      setEventPickMessage(
        "Pick saved! 🏆",
      );
      await loadEventPicks(eventId);
    } catch (error) {
      setEventPicks((current) => {
        const nextEventPicks = {
          ...(current[eventId] ?? {}),
        };

        if (previousChoice) {
          nextEventPicks[game.id] =
            previousChoice;
        } else {
          delete nextEventPicks[game.id];
        }

        return {
          ...current,
          [eventId]:
            nextEventPicks,
        };
      });

      setEventPickMessage(
        error instanceof Error
          ? error.message
          : "Could not save this event pick.",
      );
    } finally {
      setEventPickSavingKey(null);
    }
  }

  useEffect(() => {
    if (activeSection !== "Events") return;

    let cancelled = false;

    async function refreshEventGames() {
      try {
        const response = await fetch("/api/games", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const body = (await response.json()) as {
          games?: ApiGame[];
        };

        if (cancelled) return;

        const refreshedGames: BrowserGame[] = (
          body.games ?? []
        )
          .filter(
            (game) =>
              game.sport === "College Football" ||
              game.sport === "Soccer" ||
              game.sport === "College Basketball" ||
              game.sport === "Volleyball" ||
              game.sport === "Hockey" ||
              game.sport === "Baseball",
          )
          .map((game) => ({
            id: game.id,
            sport: game.sport as Sport,
            competition: game.competition,
            home: game.home,
            away: game.away,
            startsAt: game.startsAt,
            startTimeTbd: game.startTimeTbd,
            sourceNotes: game.sourceNotes,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            status: game.status,
            externalProvider:
              game.externalProvider ?? null,
            externalId: game.externalId ?? null,
            icon:
              game.sport === "Soccer"
                ? "⚽"
                : game.sport === "College Football"
                  ? "🏈"
                  : game.sport === "College Basketball"
                    ? "🏀"
                    : game.sport === "Volleyball"
                      ? "🏐"
                      : game.sport === "Hockey"
                        ? "🏒"
                        : "⚾",
            liveData: true,
          }));

        setRealGames(refreshedGames);
      } catch (error) {
        console.error(
          "Unable to refresh event games:",
          error,
        );
      }
    }

    void refreshEventGames();

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  useEffect(() => {
    if (
      !signedInPlayer ||
      (activeSection !== "Events" && activeSection !== "Trophy Room")
    ) {
      return;
    }

    ["fa-cup", "carabao-cup", "champions-league", "efl-trophy", "stanley-cup"].forEach(
      (eventId) => void loadEventPicks(eventId),
    );

    const signedInPlayerIsMama =
      signedInPlayer.display_name.trim().toLowerCase() === "mama";

    if (signedInPlayerIsMama && challenge?.id) {
      void loadEventPicks(`mamas-hockey-${challenge.id}`);
    }
  }, [activeSection, signedInPlayer?.id, challenge?.id]);

  async function openGameRoom(game: BrowserGame) {
    if (!signedInPlayer) {
      setLoadError("Choose your player before opening Game Details.");
      return;
    }

    setGameRoomGame(game);
    setGameRoomMessages([]);
    setGameInsights([]);
    setGameInsightsLoading(true);

    void fetch(
      `/api/game-insights?gameId=${encodeURIComponent(game.id)}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load game insights");
        }

        return response.json();
      })
      .then((data) => {
        setGameInsights(
          Array.isArray(data.insights)
            ? data.insights
            : [],
        );
      })
      .catch((error) => {
        console.error(
          "Unable to load game insights:",
          error,
        );
        setGameInsights([]);
      })
      .finally(() => {
        setGameInsightsLoading(false);
      });
    setGameRoomMessage("");
    setGameRoomError(null);

    setGameRoomPicks([]);
    setGameRoomPicksRevealed(false);
    setGameRoomPickedCount(0);
    setGameRoomTotalPlayers(0);

    setGameRoomLiveEvents([]);
    gameRoomScoreSnapshotRef.current = null;
    gameRoomSeenLiveEventKeysRef.current =
      new Set();

    await loadGameRoomPicks(game);
  }

  // Chat/typing realtime subscriptions are intentionally disabled.
  // Game Details keeps live scores, game events and FamBam Picks,
  // while the old chat code remains available for a future feature.


  function closeGameRoom() {
    setGameRoomGame(null);
    setGameRoomMessages([]);
    setGameInsights([]);
    setGameInsightsLoading(false);
    setGameRoomMessage("");
    setGameRoomError(null);
    setGameRoomPicks([]);
    setGameRoomPicksRevealed(false);
    setGameRoomPickedCount(0);
    setGameRoomTotalPlayers(0);

    setGameRoomLiveEvents([]);
    gameRoomScoreSnapshotRef.current = null;
    gameRoomSeenLiveEventKeysRef.current =
      new Set();
  }

  useEffect(() => {
    if (!gameRoomGame) return;

    const gameRoomGameId = gameRoomGame.id;

    let cancelled = false;

    async function refreshGameRoomGame() {
      try {
        // First refresh this exact game from its live data provider.
        // This updates Supabase before the Game Room reads the score.
        try {
          const liveResponse = await fetch(
            `/api/game-room/live?gameId=${encodeURIComponent(gameRoomGameId)}`,
            {
              cache: "no-store",
            },
          );

          if (!liveResponse.ok) {
            const liveBody = await liveResponse
              .json()
              .catch(() => null);

            console.error(
              "Game Details provider refresh failed:",
              liveResponse.status,
              liveBody,
            );
          }
        } catch (liveError) {
          console.error(
            "Game Details provider refresh request failed:",
            liveError,
          );
        }

        const response = await fetch(
          `/api/games?gameId=${encodeURIComponent(gameRoomGameId)}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) return;

        const body = (await response.json()) as {
          games?: ApiGame[];
        };

        const updatedGame = (body.games ?? []).find(
          (game) => game.id === gameRoomGameId,
        );

        if (!updatedGame || cancelled) return;

        const previousSnapshot =
          gameRoomScoreSnapshotRef.current;

        const nextSnapshot = {
          gameId: updatedGame.id,
          homeScore: updatedGame.homeScore,
          awayScore: updatedGame.awayScore,
          status: String(updatedGame.status ?? ""),
        };

        if (
          previousSnapshot &&
          previousSnapshot.gameId ===
            updatedGame.id
        ) {
          const previousStatus =
            previousSnapshot.status.toLowerCase();

          const nextStatus =
            nextSnapshot.status.toLowerCase();

          const finalStatuses = [
            "final",
            "finished",
            "complete",
            "completed",
            "closed",
          ];

          const isFinal =
            finalStatuses.some((status) =>
              nextStatus.includes(status),
            );

          const wasFinal =
            finalStatuses.some((status) =>
              previousStatus.includes(status),
            );

          const isHalftime =
            nextStatus === "ht" ||
            nextStatus.includes("half");

          const wasHalftime =
            previousStatus === "ht" ||
            previousStatus.includes("half");

          const hasScore =
            updatedGame.homeScore !== null &&
            updatedGame.awayScore !== null;

          const scoreText = hasScore
            ? `${updatedGame.away} ${updatedGame.awayScore} – ${updatedGame.home} ${updatedGame.homeScore}`
            : "";

          if (isFinal && !wasFinal) {
            addGameRoomLiveEvent(
              `${updatedGame.id}:final:${updatedGame.awayScore}:${updatedGame.homeScore}`,
              `🏁 FINAL — ${scoreText}`,
            );
          } else {
            const homeIncreased =
              previousSnapshot.homeScore !==
                null &&
              updatedGame.homeScore !== null &&
              updatedGame.homeScore >
                previousSnapshot.homeScore;

            const awayIncreased =
              previousSnapshot.awayScore !==
                null &&
              updatedGame.awayScore !== null &&
              updatedGame.awayScore >
                previousSnapshot.awayScore;

            if (
              hasScore &&
              (homeIncreased || awayIncreased)
            ) {
              const scoringTeam =
                homeIncreased && !awayIncreased
                  ? updatedGame.home
                  : awayIncreased && !homeIncreased
                    ? updatedGame.away
                    : null;

              const sport =
                String(
                  updatedGame.sport ?? "",
                ).toLowerCase();

              let scoringMessage = "";

              if (
                sport.includes("soccer") &&
                scoringTeam
              ) {
                scoringMessage =
                  `⚽ GOAL! ${scoringTeam} — ${scoreText}`;
              } else if (
                sport.includes("football") &&
                scoringTeam
              ) {
                scoringMessage =
                  `🏈 ${scoringTeam} scored! — ${scoreText}`;
              } else if (
                sport.includes("basketball")
              ) {
                scoringMessage =
                  `🏀 Score update — ${scoreText}`;
              } else if (
                sport.includes("hockey") &&
                scoringTeam
              ) {
                scoringMessage =
                  `🏒 GOAL! ${scoringTeam} — ${scoreText}`;
              } else if (
                sport.includes("baseball") &&
                scoringTeam
              ) {
                scoringMessage =
                  `⚾ ${scoringTeam} scored! — ${scoreText}`;
              } else if (
                sport.includes("baseball")
              ) {
                scoringMessage =
                  `⚾ Run update — ${scoreText}`;
              } else {
                scoringMessage =
                  `📣 Score update — ${scoreText}`;
              }

              addGameRoomLiveEvent(
                `${updatedGame.id}:score:${updatedGame.awayScore}:${updatedGame.homeScore}`,
                scoringMessage,
              );
            }

            if (isHalftime && !wasHalftime) {
              addGameRoomLiveEvent(
                `${updatedGame.id}:halftime:${updatedGame.awayScore}:${updatedGame.homeScore}`,
                hasScore
                  ? `⏱️ Halftime — ${scoreText}`
                  : "⏱️ Halftime",
              );
            }
          }
        }

        gameRoomScoreSnapshotRef.current =
          nextSnapshot;

        setGameRoomGame((current) => {
          if (
            !current ||
            current.id !== updatedGame.id
          ) {
            return current;
          }

          const unchanged =
            current.startsAt === updatedGame.startsAt &&
            current.startTimeTbd ===
              updatedGame.startTimeTbd &&
            current.homeScore ===
              updatedGame.homeScore &&
            current.awayScore ===
              updatedGame.awayScore &&
            current.status === updatedGame.status;

          if (unchanged) return current;

          return {
            ...current,
            startsAt: updatedGame.startsAt,
            startTimeTbd:
              updatedGame.startTimeTbd,
            homeScore: updatedGame.homeScore,
            awayScore: updatedGame.awayScore,
            status: updatedGame.status,
          };
        });

        setRealGames((currentGames) => {
          let changed = false;

          const nextGames = currentGames.map(
            (game) => {
              if (game.id !== updatedGame.id) {
                return game;
              }

              const unchanged =
                game.startsAt === updatedGame.startsAt &&
                game.startTimeTbd ===
                  updatedGame.startTimeTbd &&
                game.homeScore ===
                  updatedGame.homeScore &&
                game.awayScore ===
                  updatedGame.awayScore &&
                game.status === updatedGame.status;

              if (unchanged) return game;

              changed = true;

              return {
                ...game,
                startsAt: updatedGame.startsAt,
                startTimeTbd:
                  updatedGame.startTimeTbd,
                homeScore: updatedGame.homeScore,
                awayScore: updatedGame.awayScore,
                status: updatedGame.status,
              };
            },
          );

          return changed
            ? nextGames
            : currentGames;
        });
      } catch (error) {
        console.error(
          "Game Details score refresh failed:",
          error,
        );
      }
    }

    void refreshGameRoomGame();

    const finalStatuses = [
      "final",
      "finished",
      "complete",
      "completed",
      "closed",
    ];

    const status =
      String(gameRoomGame.status ?? "").toLowerCase();

    const alreadyFinal = finalStatuses.some(
      (value) => status.includes(value),
    );

    const startsAtMs = gameRoomGame.startsAt
      ? new Date(gameRoomGame.startsAt).getTime()
      : null;

    const nowMs = Date.now();

    // Keep live polling focused around the actual game window.
    // Start 10 minutes before kickoff and allow a generous
    // six-hour window for long football games / delays.
    const inLiveWindow =
      startsAtMs !== null &&
      nowMs >= startsAtMs - 10 * 60_000 &&
      nowMs <= startsAtMs + 6 * 60 * 60_000;

    if (alreadyFinal || !inLiveWindow) {
      return () => {
        cancelled = true;
      };
    }

    const interval = window.setInterval(
      refreshGameRoomGame,
      60_000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [gameRoomGame?.id]);

  useEffect(() => {
    if (
      !gameRoomGame ||
      !challenge ||
      !challengeGameIds.includes(
        gameRoomGame.id,
      )
    ) {
      return;
    }

    const currentGame = gameRoomGame;

    const interval = window.setInterval(
      () => {
        void loadGameRoomPicks(
          currentGame,
          true,
        );
      },
      30_000,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [
    gameRoomGame?.id,
    challenge?.id,
    signedInPlayer?.id,
    challengeGameIds.join(","),
  ]);

  async function signalGameRoomTyping() {
    if (!signedInPlayer || !gameRoomGame) return;

    const now = Date.now();

    if (now - lastTypingSignalAtRef.current < 1200) {
      return;
    }

    lastTypingSignalAtRef.current = now;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    if (!sessionToken) return;

    try {
      const response = await fetch("/api/game-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fambam-session": sessionToken,
        },
        body: JSON.stringify({
          action: "typing",
          playerId: signedInPlayer.id,
          gameId: gameRoomGame.id,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        console.error(
          "Game Room typing failed:",
          response.status,
          body,
        );
      }
    } catch (error) {
      console.error(
        "Game Room typing request failed:",
        error,
      );
    }
  }

  async function sendGameRoomMessage(messageOverride?: string) {
    if (
      !signedInPlayer ||
      !gameRoomGame ||
      gameRoomSending
    ) {
      return;
    }

    const outgoingMessage = (
      messageOverride ?? gameRoomMessage
    ).trim();

    if (!outgoingMessage) return;

    const sessionToken =
      window.localStorage.getItem("fambam_session_token");

    if (!sessionToken) {
      setGameRoomError("Your FamBam session has expired. Please sign in again.");
      return;
    }

    setGameRoomSending(true);
    setGameRoomError(null);

    try {
      const response = await fetch("/api/game-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fambam-session": sessionToken,
        },
        body: JSON.stringify({
          playerId: signedInPlayer.id,
          gameId: gameRoomGame.id,
          message: outgoingMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to send your message.",
        );
      }

      setGameRoomMessage("");
      await loadGameRoomMessages(gameRoomGame);
    } catch (error) {
      setGameRoomError(
        error instanceof Error
          ? error.message
          : "Unable to send your message.",
      );
    } finally {
      setGameRoomSending(false);
    }
  }

  useEffect(() => {
    if (signedInPlayer) {
      void openProfile(false);
    }
  }, [signedInPlayer?.id]);

  useEffect(() => {
    if (
      activeSection === "Trophy Room" &&
      signedInPlayer &&
      trophyRoomPanel === "records" &&
      !profileLoading
    ) {
      void openProfile(false);
    }

    if (
      (activeSection === "Locker Room" || activeSection === "Trophy Room") &&
      signedInPlayer
    ) {
      void loadLockerRoom();
    }
  }, [activeSection, signedInPlayer?.id, trophyRoomPanel]);

  useEffect(() => {
    if (activeSection !== "Trophy Room" || trophyRoomPanel !== "records" || !signedInPlayer) return;

    const interval = window.setInterval(() => {
      void openProfile(false);
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [activeSection, trophyRoomPanel, signedInPlayer?.id]);

  async function loadLockerRoom() {
    if (!signedInPlayer) return;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    if (!sessionToken) return;

    try {
      setLockerLoading(true);

      // Use the same proven profile endpoint that powers Edit Profile.
      // This keeps the Locker Room in sync with the player's saved teams.
      const params = new URLSearchParams({
        playerId: signedInPlayer.id,
      });

      const response = await fetch(
        `/api/player-profile?${params.toString()}`,
        {
          cache: "no-store",
          headers: {
            "x-fambam-session": sessionToken,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to load the Locker Room.",
        );
      }

      const sportsById = new Map<string, string>(
        (data.sports ?? []).map(
          (sport: ProfileSport) => [
            sport.id,
            sport.name,
          ],
        ),
      );

      const teamsById = new Map<string, ProfileTeam>(
        (data.teams ?? []).map(
          (team: ProfileTeam) => [
            team.id,
            team,
          ],
        ),
      );

      const lockerTeams: LockerTeam[] =
        (data.favoriteTeams ?? [])
          .map(
            (favorite: {
              team_id: string;
              is_primary?: boolean;
            }) => {
              const team =
                teamsById.get(
                  favorite.team_id,
                );

              if (!team) return null;

              return {
                id: team.id,
                name: team.name,
                short_name:
                  team.short_name ??
                  team.abbreviation ??
                  null,
                logo_url:
                  team.logo_url ?? null,
                sport:
                  sportsById.get(
                    team.sport_id,
                  ) ?? "Other",
                is_primary:
                  favorite.is_primary === true,
              };
            },
          )
          .filter(
            (
              team: LockerTeam | null,
            ): team is LockerTeam =>
              team !== null,
          );

      const savedLockerOrder = Array.isArray(data.lockerTeamOrder)
        ? data.lockerTeamOrder.filter((teamId: unknown): teamId is string => typeof teamId === "string")
        : [];
      const lockerPosition = new Map<string, number>(savedLockerOrder.map((teamId: string, index: number) => [teamId, index]));
      lockerTeams.sort((a, b) =>
        (lockerPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (lockerPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );

      setLockerPlayers([
        {
          id: signedInPlayer.id,
          display_name:
            data.player?.display_name ??
            signedInPlayer.display_name,
          initials:
            data.player?.initials ??
            signedInPlayer.initials ??
            null,
          teams: lockerTeams,
        },
      ]);
    } catch (error) {
      console.error(
        "Locker Room load error:",
        error,
      );
      setLockerPlayers([]);
    } finally {
      setLockerLoading(false);
    }
  }

  async function openProfile(showModal = true) {
    if (!signedInPlayer) return;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    setProfileOpen(showModal);
    setProfileLoading(true);
    setProfileError(null);
    setProfileTeamSearch("");

    if (!sessionToken) {
      setProfileLoading(false);
      setProfileError(
        "Your FamBam session needs to be refreshed. Switch players and sign in again.",
      );
      return;
    }

    void loadNotificationSettings();

    try {
      const params = new URLSearchParams({
        playerId: signedInPlayer.id,
      });

      const response = await fetch(
        `/api/player-profile?${params.toString()}`,
        {
          cache: "no-store",
          headers: {
            "x-fambam-session": sessionToken,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Could not load your profile.",
        );
      }

      setProfileDisplayName(
        data.player?.display_name ??
          signedInPlayer.display_name,
      );

      setProfileInitials(
        data.player?.initials ??
          signedInPlayer.initials ??
          "",
      );

      setProfileAvatarUrl(
        data.player?.avatar_url ?? null,
      );

      const avatarByPlayer = new Map<string, string | null>(
        (Array.isArray(data.playerAvatars) ? data.playerAvatars : []).map(
          (row: { id: string; avatar_url: string | null }) => [row.id, row.avatar_url],
        ),
      );

      setPlayers((current) => current.map((player) => ({
        ...player,
        avatar_url: avatarByPlayer.has(player.id)
          ? avatarByPlayer.get(player.id) ?? null
          : player.avatar_url,
      })));

      if (data.player) {
        setSignedInPlayer((current) => current ? {
          ...current,
          display_name: data.player.display_name ?? current.display_name,
          initials: data.player.initials ?? current.initials,
          avatar_url: data.player.avatar_url ?? null,
        } : current);
      }

      setRecordBookLeaderboard(
        Array.isArray(data.recordBookLeaderboard)
          ? data.recordBookLeaderboard
          : [],
      );

      setRecordBookAchievements(
        data.recordBookAchievements && typeof data.recordBookAchievements === "object"
          ? data.recordBookAchievements
          : {},
      );

      setProfileSports(
        data.sports ?? [],
      );

      setProfileTeams(
        data.teams ?? [],
      );

      setProfileSportChoices(
        (data.playerSports ?? []).map(
          (row: {
            sport_id: string;
            interest_type: string;
          }) => ({
            sportId: row.sport_id,
            interestType:
              row.interest_type ===
              "play_follow"
                ? "play_follow"
                : "follow",
          }),
        ),
      );

      const favorites =
        (data.favoriteTeams ?? []).map(
          (row: {
            team_id: string;
          }) => row.team_id,
        );

      const savedLockerOrder = Array.isArray(data.lockerTeamOrder)
        ? data.lockerTeamOrder.filter((teamId: unknown): teamId is string => typeof teamId === "string")
        : [];

      const orderedFavorites = [
        ...savedLockerOrder.filter((teamId: string) => favorites.includes(teamId)),
        ...favorites.filter((teamId: string) => !savedLockerOrder.includes(teamId)),
      ];

      setProfileFavoriteTeamIds(
        orderedFavorites,
      );

      setHiddenEventIds(
        Array.isArray(data.hiddenEventIds)
          ? data.hiddenEventIds.filter(
              (eventId: unknown): eventId is string => typeof eventId === "string",
            )
          : [],
      );

      const primaryBySport: Record<string, string> = {};

      for (const row of data.favoriteTeams ?? []) {
        if (!row.is_primary) continue;

        const team = (data.teams ?? []).find(
          (candidate: ProfileTeam) =>
            candidate.id === row.team_id,
        );

        if (team) {
          primaryBySport[team.sport_id] =
            row.team_id;
        }
      }

      setProfilePrimaryTeamIdsBySport(
        primaryBySport,
      );
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Could not load your profile.",
      );
    } finally {
      setProfileLoading(false);
    }
  }

  async function setEventHidden(eventId: string, hidden: boolean) {
    if (!signedInPlayer || eventVisibilitySavingId) return;

    const sessionToken = window.localStorage.getItem("fambam_session_token");

    if (!sessionToken) {
      setEventVisibilityMessage("Please switch players and sign in again.");
      return;
    }

    const nextHiddenEventIds = hidden
      ? [...new Set([...hiddenEventIds, eventId])]
      : hiddenEventIds.filter((savedId) => savedId !== eventId);

    setEventVisibilitySavingId(eventId);
    setEventVisibilityMessage(null);

    try {
      const response = await fetch("/api/player-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fambam-session": sessionToken,
        },
        body: JSON.stringify({
          action: "hiddenEvents",
          playerId: signedInPlayer.id,
          hiddenEventIds: nextHiddenEventIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not update this event.");
      }

      setHiddenEventIds(nextHiddenEventIds);
      setEventVisibilityMessage(
        hidden
          ? "Event hidden from your Events screen."
          : "Event added back to your Events screen.",
      );
    } catch (error) {
      setEventVisibilityMessage(
        error instanceof Error ? error.message : "Could not update this event.",
      );
    } finally {
      setEventVisibilitySavingId(null);
    }
  }

  function notificationApplicationKey(value: string) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  async function loadNotificationSettings() {
    if (!signedInPlayer) return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setNotificationSupported(supported);
    if (!supported) return;
    const sessionToken = window.localStorage.getItem("fambam_session_token");
    if (!sessionToken) return;
    try {
      const [response, registration] = await Promise.all([
        fetch(`/api/notifications?playerId=${encodeURIComponent(signedInPlayer.id)}`, {
          cache: "no-store",
          headers: { "x-fambam-session": sessionToken },
        }),
        navigator.serviceWorker.register("/sw.js"),
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load notification settings.");
      setNotificationPreferences(data.preferences);
      setNotificationEnabled(Boolean(await registration.pushManager.getSubscription()));
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Could not load notification settings.");
    }
  }

  async function enableNotifications() {
    if (!signedInPlayer || notificationSaving) return;
    setNotificationSaving(true);
    setNotificationMessage(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setNotificationSupported(false);
        throw new Error("Notifications need this site added to your Home Screen and iOS 16.4 or newer.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are off. You can allow them in your iPhone Settings for FamBam Sports.");
      const sessionToken = window.localStorage.getItem("fambam_session_token");
      if (!sessionToken) throw new Error("Please sign in again first.");
      const settingsResponse = await fetch(`/api/notifications?playerId=${encodeURIComponent(signedInPlayer.id)}`, {
        cache: "no-store",
        headers: { "x-fambam-session": sessionToken },
      });
      const settings = await settingsResponse.json();
      if (!settingsResponse.ok) throw new Error(settings?.error ?? "Could not start notifications.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: notificationApplicationKey(settings.publicKey),
      });
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fambam-session": sessionToken },
        body: JSON.stringify({ action: "subscribe", playerId: signedInPlayer.id, subscription: subscription.toJSON() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not turn on notifications.");
      setNotificationEnabled(true);
      setNotificationMessage("Notifications are on for this phone! 🎉");
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : "Could not turn on notifications.");
    } finally {
      setNotificationSaving(false);
    }
  }

  async function updateNotificationPreference(key: keyof typeof notificationPreferences, enabled: boolean) {
    if (!signedInPlayer) return;
    const next = { ...notificationPreferences, [key]: enabled };
    setNotificationPreferences(next);
    const sessionToken = window.localStorage.getItem("fambam_session_token");
    if (!sessionToken) return;
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fambam-session": sessionToken },
        body: JSON.stringify({ action: "preferences", playerId: signedInPlayer.id, preferences: next }),
      });
      if (!response.ok) throw new Error("Could not save notification choices.");
    } catch (error) {
      setNotificationPreferences(notificationPreferences);
      setNotificationMessage(error instanceof Error ? error.message : "Could not save notification choices.");
    }
  }

  async function disableNotifications() {
    if (!signedInPlayer || notificationSaving) return;
    setNotificationSaving(true);
    setNotificationMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? "";
      if (subscription) await subscription.unsubscribe();
      const sessionToken = window.localStorage.getItem("fambam_session_token");
      if (sessionToken) await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fambam-session": sessionToken },
        body: JSON.stringify({ action: "unsubscribe", playerId: signedInPlayer.id, endpoint }),
      });
      setNotificationEnabled(false);
      setNotificationMessage("Notifications are off on this phone.");
    } finally {
      setNotificationSaving(false);
    }
  }

  function setProfileSport(
    sportId: string,
    interestType:
      | "follow"
      | "play_follow"
      | null,
  ) {
    setProfileSportChoices(
      (current) => {
        const withoutSport =
          current.filter(
            (item) =>
              item.sportId !== sportId,
          );

        if (!interestType) {
          return withoutSport;
        }

        return [
          ...withoutSport,
          {
            sportId,
            interestType,
          },
        ];
      },
    );
  }

  function toggleFavoriteTeam(
    teamId: string,
  ) {
    setProfileFavoriteTeamIds(
      (current) => {
        if (current.includes(teamId)) {
          const next =
            current.filter(
              (id) => id !== teamId,
            );

          const removedTeam =
            profileTeams.find(
              (team) => team.id === teamId,
            );

          if (removedTeam) {
            setProfilePrimaryTeamIdsBySport(
              (currentPrimary) => {
                if (
                  currentPrimary[
                    removedTeam.sport_id
                  ] !== teamId
                ) {
                  return currentPrimary;
                }

                const next = {
                  ...currentPrimary,
                };

                delete next[
                  removedTeam.sport_id
                ];

                return next;
              },
            );
          }

          return next;
        }

        return [...current, teamId];
      },
    );
  }

  function moveFavoriteTeam(teamId: string, direction: -1 | 1) {
    setProfileFavoriteTeamIds((current) => {
      const from = current.indexOf(teamId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  async function saveProfile() {
    if (!signedInPlayer) return;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    if (!sessionToken) {
      setProfileError(
        "Your FamBam session has expired. Please switch players and sign in again.",
      );
      return;
    }

    if (
      !profileDisplayName.trim()
    ) {
      setProfileError(
        "Your display name cannot be blank.",
      );
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      const response = await fetch(
        "/api/player-profile",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "x-fambam-session":
              sessionToken,
          },
          body: JSON.stringify({
            playerId:
              signedInPlayer.id,
            displayName:
              profileDisplayName,
            initials:
              profileInitials,
            playerSports:
              profileSportChoices,
            favoriteTeamIds:
              profileFavoriteTeamIds,
            primaryTeamIds:
              Object.values(
                profilePrimaryTeamIdsBySport,
              ),
            lockerTeamOrder:
              profileFavoriteTeamIds,
          }),
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Could not save your profile.",
        );
      }

      setPlayers(
        (current) =>
          current.map((player) =>
            player.id ===
            signedInPlayer.id
              ? {
                  ...player,
                  display_name:
                    profileDisplayName.trim(),
                  initials:
                    profileInitials.trim() ||
                    null,
                }
              : player,
          ),
      );

      setSignedInPlayer(
        (current) =>
          current
            ? {
                ...current,
                display_name:
                  profileDisplayName.trim(),
                initials:
                  profileInitials.trim() ||
                  null,
              }
            : current,
      );

      setProfileOpen(false);
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Could not save your profile.",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadProfilePhoto(file: Blob) {
    if (!signedInPlayer) return;

    const sessionToken = window.localStorage.getItem("fambam_session_token");
    if (!sessionToken) {
      setProfileError("Your FamBam session has expired.");
      return;
    }

    setProfilePhotoUploading(true);
    setProfileError(null);

    try {
      const form = new FormData();
      form.append("playerId", signedInPlayer.id);
      form.append("purpose", "profile");
      form.append("file", file, "profile-photo.jpg");

      const response = await fetch("/api/player-profile", {
        method: "POST",
        headers: { "x-fambam-session": sessionToken },
        body: form,
      });
      const responseText = await response.text();
      const body = responseText ? (() => {
        try { return JSON.parse(responseText); }
        catch { return { error: `Picture service returned an unreadable response (${response.status}).` }; }
      })() : { error: `Picture service returned an empty response (${response.status}).` };

      if (!response.ok) throw new Error(body.error || "Could not upload picture.");

      setProfileAvatarUrl(body.url);
      setPlayers((current) => current.map((player) =>
        player.id === signedInPlayer.id ? { ...player, avatar_url: body.url } : player,
      ));
      setSignedInPlayer((current) => current ? { ...current, avatar_url: body.url } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload picture.";
      setProfileError(message);
      throw new Error(message);
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  async function deleteProfilePhoto() {
    if (!signedInPlayer || !profileAvatarUrl) return;
    if (!window.confirm("Delete your profile picture? Your initials will show instead.")) return;

    const sessionToken = window.localStorage.getItem("fambam_session_token");
    if (!sessionToken) {
      setProfileError("Your FamBam session has expired.");
      return;
    }

    setProfilePhotoUploading(true);
    setProfileError(null);
    try {
      const response = await fetch("/api/player-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fambam-session": sessionToken },
        body: JSON.stringify({ action: "deletePhoto", playerId: signedInPlayer.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not delete picture.");

      setProfileAvatarUrl(null);
      setPlayers((current) => current.map((player) =>
        player.id === signedInPlayer.id ? { ...player, avatar_url: null } : player,
      ));
      setSignedInPlayer((current) => current ? { ...current, avatar_url: null } : current);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not delete picture.");
    } finally {
      setProfilePhotoUploading(false);
    }
  }

  const [challengePickStatus, setChallengePickStatus] =
    useState<ChallengePickStatus>({});

  useEffect(() => {
    setCurrentTime(Date.now());

    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSection !== "Home") return;

    let cancelled = false;

    async function refreshHomeLiveScores() {
      const now = Date.now();

      const finalStatuses = [
        "final",
        "finished",
        "complete",
        "completed",
        "closed",
      ];

      const gamesToRefresh = realGames.filter((game) => {
        if (
          game.sport !== "Soccer" &&
          game.sport !== "College Football" &&
          game.sport !== "Baseball" &&
          game.sport !== "Hockey" &&
          game.sport !== "Volleyball"
        ) {
          return false;
        }

        if (!game.startsAt) return false;

        const status = String(
          game.status ?? "",
        ).toLowerCase();

        if (
          finalStatuses.some((finalStatus) =>
            status.includes(finalStatus),
          )
        ) {
          return false;
        }

        const startsAtMs = new Date(
          game.startsAt,
        ).getTime();

        return (
          now >= startsAtMs - 10 * 60_000 &&
          now <= startsAtMs + 6 * 60 * 60_000
        );
      });

      if (gamesToRefresh.length === 0) return;

      await Promise.all(
        gamesToRefresh.map(async (game) => {
          try {
            // Refresh this exact game from the provider first.
            const liveResponse = await fetch(
              `/api/game-room/live?gameId=${encodeURIComponent(
                game.id,
              )}`,
              {
                cache: "no-store",
              },
            );

            // Unsupported providers or temporary provider
            // failures should never break the Home page.
            if (!liveResponse.ok) return;

            // Read the newly updated game back from Supabase.
            const gameResponse = await fetch(
              `/api/games?gameId=${encodeURIComponent(
                game.id,
              )}`,
              {
                cache: "no-store",
              },
            );

            if (!gameResponse.ok || cancelled) return;

            const body = (await gameResponse.json()) as {
              games?: ApiGame[];
            };

            const updatedGame = (
              body.games ?? []
            ).find(
              (candidate) =>
                candidate.id === game.id,
            );

            if (!updatedGame || cancelled) return;

            setRealGames((currentGames) => {
              let changed = false;

              const nextGames = currentGames.map(
                (currentGame) => {
                  if (
                    currentGame.id !==
                    updatedGame.id
                  ) {
                    return currentGame;
                  }

                  const unchanged =
                    currentGame.homeScore ===
                      updatedGame.homeScore &&
                    currentGame.awayScore ===
                      updatedGame.awayScore &&
                    currentGame.status ===
                      updatedGame.status &&
                    currentGame.startsAt ===
                      updatedGame.startsAt &&
                    currentGame.startTimeTbd ===
                      updatedGame.startTimeTbd;

                  if (unchanged) {
                    return currentGame;
                  }

                  changed = true;

                  return {
                    ...currentGame,
                    homeScore:
                      updatedGame.homeScore,
                    awayScore:
                      updatedGame.awayScore,
                    status: updatedGame.status,
                    startsAt:
                      updatedGame.startsAt,
                    startTimeTbd:
                      updatedGame.startTimeTbd,
                  };
                },
              );

              return changed
                ? nextGames
                : currentGames;
            });
          } catch (error) {
            console.error(
              "Home live score refresh failed:",
              error,
            );
          }
        }),
      );
    }

    void refreshHomeLiveScores();

    const interval = window.setInterval(
      refreshHomeLiveScores,
      60_000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeSection, realGames]);

  useEffect(() => {
    async function loadHome() {
      const supabase = createClient();

      const [
        playersResult,
        challengeResult,
        gamesResponse,
        rankingsResult,
      ] = await Promise.all([
        supabase.rpc("get_active_players"),
        supabase.rpc("get_open_challenge"),
        fetch("/api/games", {
          cache: "no-store",
        }),
        supabase
          .from("college_football_rankings")
          .select("team_name, rank, season, week, poll")
          .eq("poll", "AP Top 25")
          .order("season", { ascending: false })
          .order("week", { ascending: false })
          .order("rank", { ascending: true }),
      ]);

      if (playersResult.error) {
        console.error(playersResult.error);
        setLoadError(playersResult.error.message);
        setLoading(false);
        return;
      }

      const loadedPlayers =
        (playersResult.data ?? []) as Player[];

      setPlayers(loadedPlayers);

      if (rankingsResult.error) {
        console.error(rankingsResult.error);
      } else {
        const rankingRows =
          (rankingsResult.data ?? []) as CollegeFootballRanking[];

        const latestSeason = rankingRows[0]?.season;
        const latestWeek = rankingRows[0]?.week;

        setCollegeFootballRankings(
          latestSeason === undefined || latestWeek === undefined
            ? []
            : rankingRows.filter(
                (row) =>
                  row.season === latestSeason &&
                  row.week === latestWeek,
              ),
        );
      }

      let openChallenge: Challenge | null = null;

      if (challengeResult.error) {
        console.error(challengeResult.error);
      } else {
        const openChallenges =
          (challengeResult.data ?? []) as Challenge[];

        openChallenge =
          openChallenges[0] ?? null;

        setChallenge(openChallenge);
      }

      if (openChallenge) {
        const {
          data: challengeGameData,
          error: challengeGameError,
        } = await supabase.rpc(
          "get_challenge_game_ids",
          {
            target_challenge_id:
              openChallenge.id,
          },
        );

        let loadedChallengeGameIds: string[] = [];

        if (challengeGameError) {
          console.error(challengeGameError);
        } else {
          loadedChallengeGameIds =
            (challengeGameData ?? []).map(
              (row: { game_id: string }) =>
                row.game_id,
            );

          setChallengeGameIds(
            loadedChallengeGameIds,
          );
        }

        const {
          data: pickStatusData,
          error: pickStatusError,
        } = await supabase.rpc(
          "get_challenge_pick_status",
          {
            target_challenge_id:
              openChallenge.id,
          },
        );

        if (pickStatusError) {
          console.error(pickStatusError);
          setChallengePickStatus({});
        } else {
          const nextPickStatus: ChallengePickStatus = {};

          loadedPlayers.forEach((player) => {
            nextPickStatus[player.id] = 0;
          });

          (
            (pickStatusData ?? []) as ChallengePickStatusRow[]
          ).forEach((row) => {
            nextPickStatus[row.player_id] =
              Math.min(
                Number(row.picks_made) || 0,
                loadedChallengeGameIds.length,
              );
          });

          setChallengePickStatus(nextPickStatus);
        }

        const {
          data: leaderboardData,
          error: leaderboardError,
        } = await supabase.rpc(
          "get_challenge_leaderboard",
          {
            target_challenge_id:
              openChallenge.id,
          },
        );

        if (leaderboardError) {
          console.error(leaderboardError);
        } else {
          setLeaderboard(
            (leaderboardData ?? []) as LeaderboardRow[],
          );
        }
      }

      try {
        if (!gamesResponse.ok) {
          const body =
            await gamesResponse.json();

          throw new Error(
            body.details ??
              body.error ??
              "Could not load games.",
          );
        }

        const gamesBody =
          (await gamesResponse.json()) as {
            games: ApiGame[];
          };

        const loadedGames: BrowserGame[] = (
          gamesBody.games ?? []
        )
          .filter(
            (game) =>
              game.sport === "College Football" ||
              game.sport === "Soccer" ||
              game.sport === "College Basketball" ||
              game.sport === "Volleyball" ||
              game.sport === "Hockey" ||
              game.sport === "Baseball",
          )
          .map((game) => ({
            id: game.id,
            sport: game.sport as Sport,
            competition: game.competition,
            home: game.home,
            away: game.away,
            startsAt: game.startsAt,
            startTimeTbd:
              game.startTimeTbd,
            sourceNotes:
              game.sourceNotes,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            status: game.status,
            externalProvider:
              game.externalProvider ?? null,
            externalId:
              game.externalId ?? null,
            icon:
              game.sport === "Soccer"
                ? "⚽"
                : game.sport === "College Football"
                  ? "🏈"
                  : game.sport === "College Basketball"
                    ? "🏀"
                    : game.sport === "Volleyball"
                      ? "🏐"
                      : game.sport === "Hockey"
                        ? "🏒"
                        : "⚾",
            liveData: true,
          }));

        setRealGames(loadedGames);
      } catch (error) {
        console.error(error);

        setGamesError(
          error instanceof Error
            ? error.message
            : "Could not load games.",
        );
      } finally {
        setGamesLoading(false);
      }

      const storedPlayerId =
        localStorage.getItem(
          "fambam_player_id",
        );
      const storedSessionToken =
        localStorage.getItem(
          "fambam_session_token",
        );

      if (
        storedPlayerId &&
        storedSessionToken
      ) {
        const rememberedPlayer =
          loadedPlayers.find(
            (player) =>
              player.id ===
              storedPlayerId,
          );

        if (rememberedPlayer) {
          setSignedInPlayer(
            rememberedPlayer,
          );
        } else {
          localStorage.removeItem(
            "fambam_player_id",
          );
          localStorage.removeItem(
            "fambam_session_token",
          );
        }
      } else if (storedPlayerId) {
        localStorage.removeItem(
          "fambam_player_id",
        );
      }

      setLoading(false);
    }

    loadHome();
  }, []);

  const watchWindowStart =
    currentTime === null
      ? null
      : currentTime - 6 * 60 * 60 * 1000;

  const watchWindowEnd =
    currentTime === null
      ? null
      : currentTime + 7 * 24 * 60 * 60 * 1000;

  const thisWeekGames = realGames
    .filter((game) => {
      if (!game.startsAt) return false;

      const gameTime = new Date(
        game.startsAt,
      ).getTime();

      if (
        watchWindowStart === null ||
        watchWindowEnd === null
      ) {
        return false;
      }

      return (
        gameTime >= watchWindowStart &&
        gameTime <= watchWindowEnd
      );
    })
    .sort((a, b) => {
      const importanceDifference =
        getWatchInfo(b, collegeFootballRankings).score -
        getWatchInfo(a, collegeFootballRankings).score;

      if (importanceDifference !== 0) {
        return importanceDifference;
      }

      const aTime = a.startsAt
        ? new Date(a.startsAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      const bTime = b.startsAt
        ? new Date(b.startsAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
    });

  /*
   * Games to Watch is curated, but there is NO arbitrary game cap.
   *
   * Always keep:
   * - every game involving an AP Top-10 team
   * - every ranked-vs-ranked college football game
   * - every true Georgia or Kentucky game
   * - qualifying family soccer games / rivalries / major games
   *
   * Exact team matching prevents Georgia State and Georgia Tech
   * from being treated as the University of Georgia.
   */
  const favoriteProfileTeams = profileFavoriteTeamIds
    .map((teamId) =>
      profileTeams.find((team) => team.id === teamId),
    )
    .filter(
      (team): team is ProfileTeam => Boolean(team),
    );

  const isMama =
    signedInPlayer?.display_name.trim().toLowerCase() === "mama";

  const mamasHockeyEventId =
    isMama && challenge?.id
      ? `mamas-hockey-${challenge.id}`
      : null;

  const mamasHockeyTeams = new Set([
    "vancouver canucks",
    "kentucky hockey",
    "athens rock lobsters",
  ]);

  const challengeStartsAt = challenge?.starts_at
    ? new Date(challenge.starts_at).getTime()
    : null;
  const challengeEndsAt = challenge?.ends_at
    ? new Date(challenge.ends_at).getTime()
    : null;

  const weeklyHockeyCandidates = realGames
    .filter((game) => {
      if (
        game.sport !== "Hockey" ||
        !game.startsAt ||
        challengeStartsAt === null ||
        challengeEndsAt === null
      ) {
        return false;
      }

      const gameTime = new Date(game.startsAt).getTime();
      return gameTime >= challengeStartsAt && gameTime <= challengeEndsAt;
    })
    .sort((a, b) => {
      const competitionScore = (game: BrowserGame) => {
        const competition = game.competition.toLowerCase();
        if (competition.includes("nhl")) return 300;
        if (competition.includes("acha")) return 220;
        if (competition.includes("sphl")) return 200;
        return 100;
      };

      const importanceDifference =
        competitionScore(b) + getWatchInfo(b, collegeFootballRankings).score -
        (competitionScore(a) + getWatchInfo(a, collegeFootballRankings).score);

      if (importanceDifference !== 0) return importanceDifference;
      return new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime();
    });

  const isMamasFavoriteHockeyGame = (game: BrowserGame) => {
      const home = game.home.trim().toLowerCase();
      const away = game.away.trim().toLowerCase();
      return mamasHockeyTeams.has(home) || mamasHockeyTeams.has(away);
  };

  const favoriteHockeyGames = weeklyHockeyCandidates
    .filter(isMamasFavoriteHockeyGame)
    .slice(0, 3);
  const featuredHockeyGames = weeklyHockeyCandidates
    .filter((game) => !isMamasFavoriteHockeyGame(game))
    .slice(0, Math.max(0, 5 - favoriteHockeyGames.length));
  const initiallySelectedHockeyIds = new Set(
    [...favoriteHockeyGames, ...featuredHockeyGames].map((game) => game.id),
  );
  const mamasHockeyGames = [
    ...favoriteHockeyGames,
    ...featuredHockeyGames,
    ...weeklyHockeyCandidates.filter((game) => !initiallySelectedHockeyIds.has(game.id)),
  ]
    .slice(0, 5)
    .sort(
      (a, b) =>
        new Date(a.startsAt ?? 0).getTime() -
        new Date(b.startsAt ?? 0).getTime(),
    );

  const personalTeamSports = new Set([
    "Hockey",
    "Baseball",
    "Volleyball",
  ]);

  const watchGames = thisWeekGames.filter((game) => {
    if (personalTeamSports.has(game.sport)) {
      return favoriteProfileTeams.some(
        (team) =>
          team.name.trim().toLowerCase() ===
            game.home.trim().toLowerCase() ||
          team.name.trim().toLowerCase() ===
            game.away.trim().toLowerCase(),
      );
    }

    const watchInfo =
      getWatchInfo(game, collegeFootballRankings);

    if (game.sport === "College Football") {
      const homeRank =
        getTeamRank(game.home, collegeFootballRankings);
      const awayRank =
        getTeamRank(game.away, collegeFootballRankings);

      const hasTopTenTeam =
        (homeRank !== null && homeRank <= 10) ||
        (awayRank !== null && awayRank <= 10);

      const isRankedVsRanked =
        homeRank !== null && awayRank !== null;

      const isTrueFamBamCollegeGame =
        hasTeam(game, "Georgia") ||
        hasTeam(game, "Kentucky");

      return (
        hasTopTenTeam ||
        isRankedVsRanked ||
        isTrueFamBamCollegeGame ||
        watchInfo.score >= 80
      );
    }

    return watchInfo.score >= 80;
  });

  const isFamBamGame = (game: BrowserGame) =>
    hasTeam(game, "Georgia") ||
    hasTeam(game, "Kentucky") ||
    hasTeam(game, "Arsenal") ||
    hasTeam(game, "Liverpool") ||
    hasTeam(game, "Aston Villa") ||
    hasTeam(game, "AFC Wimbledon");

  const recentResults = realGames
    .filter((game) => {
      if (!game.startsAt) return false;

      const normalizedStatus = String(
        game.status ?? "",
      ).toLowerCase();

      const isFinal = [
        "final",
        "finished",
        "complete",
        "completed",
        "closed",
      ].some((status) =>
        normalizedStatus.includes(status),
      );

      if (!isFinal) return false;

      const gameTime = new Date(game.startsAt).getTime();
      const now = currentTime ?? Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      if (gameTime < sevenDaysAgo || gameTime > now) {
        return false;
      }

      if (challengeGameIds.includes(game.id)) {
        return true;
      }

      if (isFamBamGame(game)) {
        return true;
      }

      if (personalTeamSports.has(game.sport)) {
        return favoriteProfileTeams.some(
          (team) =>
            team.name.trim().toLowerCase() ===
              game.home.trim().toLowerCase() ||
            team.name.trim().toLowerCase() ===
              game.away.trim().toLowerCase(),
        );
      }

      return (
        getWatchInfo(game, collegeFootballRankings).score >= 80
      );
    })
    .sort(
      (a, b) =>
        new Date(b.startsAt ?? 0).getTime() -
        new Date(a.startsAt ?? 0).getTime(),
    )
    .slice(0, 6);

  const sportFilteredGames =
    activeSport === "All"
      ? watchGames
      : watchGames.filter(
          (game) =>
            game.sport === activeSport,
        );

  const filteredGames = sportFilteredGames.filter((game) => {
    if (activeWatchFilter === "All") return true;

    const watchInfo = getWatchInfo(
      game,
      collegeFootballRankings,
    );

    if (activeWatchFilter === "Must Watch") {
      return watchInfo.score >= 95;
    }

    if (activeWatchFilter === "Big Game") {
      return (
        watchInfo.score >= 90 &&
        watchInfo.score < 95
      );
    }

    if (activeWatchFilter === "FamBam") {
      return isFamBamGame(game);
    }

    if (activeWatchFilter === "Worth Watching") {
      return watchInfo.score < 90;
    }

    return true;
  });

  const challengeGames =
    realGames.filter((game) =>
      challengeGameIds.includes(game.id),
    );

  const completedChallengeGameCount =
    challengeGames.filter((game) => {
      const status = game.status.toLowerCase();

      return [
        "final",
        "finished",
        "complete",
        "completed",
        "closed",
      ].some((finalStatus) =>
        status.includes(finalStatus),
      );
    }).length;

  // The database leaderboard can retain grading from a game that was
  // replaced while the weekly card was still being assembled. Reconcile
  // every total with the games that are actually on this week's card so
  // upcoming games never appear as scored and an old 12-game card cannot
  // leak into the current 10-game challenge.
  const weeklyLeaderboard = leaderboard.map((row) => {
    // Every player is scored against the same completed games on the
    // shared weekly card. A missing pick is effectively an incorrect
    // pick; it must not shrink that player's denominator and make the
    // displayed accuracy look artificially better.
    const completedPicks = Math.min(
      completedChallengeGameCount,
      challengeGames.length,
    );
    const correct = Math.min(row.correct, completedPicks);
    const points =
      completedPicks === 0
        ? 0
        : Math.min(row.points, completedPicks);

    return {
      ...row,
      points,
      correct,
      completed_picks: completedPicks,
      total_picks: challengeGames.length,
      accuracy:
        completedPicks > 0
          ? (correct / completedPicks) * 100
          : 0,
    };
  });

  const activeChallengeId = challenge?.id ?? null;

  useEffect(() => {
    if (!activeChallengeId || completedChallengeGameCount === 0) {
      return;
    }

    let cancelled = false;

    async function refreshCompletedChallengeScores() {
      try {
        await fetch("/api/challenge/grade", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeId: activeChallengeId,
          }),
        });

        const supabase = createClient();
        const { data, error } = await supabase.rpc(
          "get_challenge_leaderboard",
          {
            target_challenge_id: activeChallengeId,
          },
        );

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setLeaderboard(
            (data ?? []) as LeaderboardRow[],
          );
        }
      } catch (error) {
        console.error(
          "Challenge score refresh failed:",
          error,
        );
      }
    }

    void refreshCompletedChallengeScores();

    return () => {
      cancelled = true;
    };
  }, [activeChallengeId, completedChallengeGameCount]);

  const availablePickGames =
    challengeGames.filter(
      (game) => !gameIsLocked(game, currentTime),
    );

  function choosePlayer(player: Player) {
    const shuffledSports = ["🏈", "⚽", "🏀", "🏐", "⚾", "🏒"]
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    setSelectedPlayer(player);
    setPinEmojis(shuffledSports);
    setPin("");
    setPinError(null);
  }

  function closePinModal() {
    if (checkingPin) return;

    setSelectedPlayer(null);
    setPin("");
    setPinError(null);
  }

  function enterDigit(digit: string) {
    if (
      pin.length >= 4 ||
      checkingPin
    ) {
      return;
    }

    setPin((current) => current + digit);
    setPinError(null);
  }

  function deleteDigit() {
    if (checkingPin) return;

    setPin((current) =>
      current.slice(0, -1),
    );

    setPinError(null);
  }

  async function verifyPin() {
  if (
    !selectedPlayer ||
    pin.length !== 4
  ) {
    return;
  }

  setCheckingPin(true);
  setPinError(null);

  try {
    const response = await fetch(
      "/api/player-session",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          playerId:
            selectedPlayer.id,
          pin,
        }),
      },
    );

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body.error ??
          "That PIN wasn't right. Try again.",
      );
    }

    localStorage.setItem(
      "fambam_player_id",
      selectedPlayer.id,
    );

    localStorage.setItem(
      "fambam_session_token",
      body.sessionToken,
    );

    setSignedInPlayer(
      selectedPlayer,
    );

    setSelectedPlayer(null);
    setPin("");
  } catch (error) {
    setPinError(
      error instanceof Error
        ? error.message
        : "Could not sign in. Try again.",
    );

    setPin("");
  } finally {
    setCheckingPin(false);
  }
}

  function switchPlayer() {
    localStorage.removeItem(
      "fambam_player_id",
    );

    setSignedInPlayer(null);
    closePicks();
  }

  function openAdminAdd(game: BrowserGame) {
    if (
      !signedInPlayer?.is_admin ||
      !challenge ||
      !game.liveData ||
      gameIsLocked(game, currentTime) ||
      challengeGameIds.includes(game.id) ||
      challengeGameIds.length >= 10
    ) {
      return;
    }

    setAdminGame(game);
    setAdminPin("");
    setAdminError(null);
  }

  function closeAdminModal() {
    if (addingGame) return;

    setAdminGame(null);
    setAdminPin("");
    setAdminError(null);
  }

  function enterAdminDigit(digit: string) {
    if (
      adminPin.length >= 4 ||
      addingGame
    ) {
      return;
    }

    setAdminPin(
      (current) => current + digit,
    );
  }

  function deleteAdminDigit() {
    if (addingGame) return;

    setAdminPin((current) =>
      current.slice(0, -1),
    );
  }

  async function addGameToChallenge() {
    if (
      !signedInPlayer ||
      !challenge ||
      !adminGame ||
      adminPin.length !== 4 ||
      challengeGameIds.length >= 10
    ) {
      return;
    }

    setAddingGame(true);
    setAdminError(null);

    try {
      const response = await fetch(
        "/api/challenge-games",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            playerId:
              signedInPlayer.id,
            challengeId:
              challenge.id,
            gameId: adminGame.id,
            pin: adminPin,
          }),
        },
      );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Could not add game.",
        );
      }

      setChallengeGameIds(
        (current) =>
          current.includes(adminGame.id)
            ? current
            : [...current, adminGame.id],
      );

      setAdminGame(null);
      setAdminPin("");
    } catch (error) {
      setAdminError(
        error instanceof Error
          ? error.message
          : "Could not add game.",
      );

      setAdminPin("");
    } finally {
      setAddingGame(false);
    }
  }

  async function openPicks() {
    if (!signedInPlayer || !challenge) {
      return;
    }

    setActiveSection("Challenge");
    setPicksUnlocked(false);
    setPicksError(null);
    setPicksSuccess(null);
    setPickChoices({});
    setSavedPickGameIds([]);
    setLoadingPicks(true);

    try {
      const sessionToken =
        localStorage.getItem(
          "fambam_session_token",
        );

      if (!sessionToken) {
        throw new Error(
          "Your FamBam session has expired. Switch players and sign in again.",
        );
      }

      const params = new URLSearchParams({
        playerId: signedInPlayer.id,
        challengeId: challenge.id,
      });

      const response = await fetch(
        `/api/player-picks?${params.toString()}`,
        {
          headers: {
            "x-fambam-session":
              sessionToken,
          },
        },
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Could not open your picks.",
        );
      }

      const saved =
        (body.picks ?? []) as SavedPick[];

      const choices: Record<
        string,
        PickChoice | null
      > = {};

      challengeGames.forEach((game) => {
        const existing =
          saved.find(
            (pick) =>
              pick.game_id === game.id,
          );

        choices[game.id] =
          existing?.pick_choice ?? null;
      });

      setPickChoices(choices);

      setSavedPickGameIds(
        saved.map(
          (pick) => pick.game_id,
        ),
      );

      setPicksUnlocked(true);
    } catch (error) {
      setPicksError(
        error instanceof Error
          ? error.message
          : "Could not open your picks.",
      );
    } finally {
      setLoadingPicks(false);
    }
  }

  function closePicks() {
    if (savingPicks || loadingPicks) {
      return;
    }

    setPicksOpen(false);
    setPicksUnlocked(false);
    setPicksError(null);
    setPicksSuccess(null);
    setPickChoices({});
    setSavedPickGameIds([]);
  }

  function selectPick(
    gameId: string,
    choice: PickChoice,
  ) {
    setPickChoices((current) => ({
      ...current,
      [gameId]: choice,
    }));

    setPicksError(null);
    setPicksSuccess(null);
  }

  async function saveAllPicks() {
    if (
      !signedInPlayer ||
      !challenge ||
      !picksUnlocked
    ) {
      return;
    }

    const gamesToSave =
      availablePickGames.filter(
        (game) => pickChoices[game.id],
      );

    if (gamesToSave.length === 0) {
      setPicksError(
        "Make at least one pick before saving.",
      );
      return;
    }

    setSavingPicks(true);
    setPicksError(null);
    setPicksSuccess(null);

    try {
      const sessionToken =
        localStorage.getItem(
          "fambam_session_token",
        );

      if (!sessionToken) {
        throw new Error(
          "Your FamBam session has expired. Switch players and sign in again.",
        );
      }

      for (const game of gamesToSave) {
        const choice =
          pickChoices[game.id];

        if (!choice) continue;

        const response = await fetch(
          "/api/player-picks",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-fambam-session":
                sessionToken,
            },
            body: JSON.stringify({
              playerId:
                signedInPlayer.id,
              challengeId:
                challenge.id,
              gameId: game.id,
              pickChoice: choice,
            }),
          },
        );

        const body =
          await response.json();

        if (!response.ok) {
          throw new Error(
            body.error ??
              `Could not save ${game.away} at ${game.home}.`,
          );
        }
      }

      const newlySavedGameIds =
        gamesToSave.map(
          (game) => game.id,
        );

      const totalSaved = new Set([
        ...savedPickGameIds,
        ...newlySavedGameIds,
      ]).size;

      setSavedPickGameIds(
        (current) => [
          ...new Set([
            ...current,
            ...newlySavedGameIds,
          ]),
        ],
      );

      const activeSavedCount =
        Math.min(
          totalSaved,
          challengeGames.length,
        );

      setChallengePickStatus(
        (current) => ({
          ...current,
          [signedInPlayer.id]:
            activeSavedCount,
        }),
      );

      setPicksSuccess(
        activeSavedCount ===
          challengeGames.length
          ? `You're all set! ${activeSavedCount}/${challengeGames.length} picks saved. ✅`
          : `${activeSavedCount}/${challengeGames.length} picks saved. Come back anytime to finish!`,
      );
    } catch (error) {
      setPicksError(
        error instanceof Error
          ? error.message
          : "Could not save your picks.",
      );
    } finally {
      setSavingPicks(false);
    }
  }


  const challengeGamesWithSavedPick =
    signedInPlayer
      ? challengePickStatus[signedInPlayer.id] ?? 0
      : 0;

  const currentPlayerReady =
    challengeGames.length > 0 &&
    challengeGamesWithSavedPick >=
      challengeGames.length;

  const trophyStanding = signedInPlayer
    ? weeklyLeaderboard.find((row) => row.player_id === signedInPlayer.id) ?? null
    : null;

  const perfectTenProgress = trophyStanding
    ? trophyStanding.completed_picks > trophyStanding.correct
      ? 0
      : Math.min(trophyStanding.correct, 10)
    : 0;

  const currentChallengeProgress = trophyStanding
    ? Math.min(trophyStanding.correct, 10)
    : 0;

  async function readPassportResponse(response: Response) {
    const text = await response.text();

    if (!text.trim()) {
      return {
        body: null as any,
        error: `Passport service returned an empty response (${response.status}).`,
      };
    }

    try {
      return { body: JSON.parse(text), error: null as string | null };
    } catch {
      const looksLikeHtml = /^\s*</.test(text);
      return {
        body: null as any,
        error: looksLikeHtml
          ? `Passport service is not available on this deployment yet (${response.status}). The rest of FamBam is still safe to use.`
          : `Passport service returned an unreadable response (${response.status}).`,
      };
    }
  }

  async function loadPassport() {
    if (!signedInPlayer) return;
    const token = window.localStorage.getItem("fambam_session_token");
    if (!token) return;
    setPassportLoading(true);
    setPassportError(null);
    try {
      const response = await fetch(`/api/passport?playerId=${encodeURIComponent(signedInPlayer.id)}`, {
        cache: "no-store",
        headers: { "x-fambam-session": token },
      });
      const parsed = await readPassportResponse(response);
      if (parsed.error) throw new Error(parsed.error);
      const body = parsed.body ?? {};
      if (!response.ok) throw new Error(body.error || `Could not load Passport (${response.status}).`);
      const attendees = body.attendees ?? [];
      const memories = body.memories ?? [];
      const photos = body.photos ?? {};
      const mapped: PassportEntry[] = (body.events ?? []).map((event: any) => {
        const isTour = event.sport === "Tour" || event.away_team === "__STADIUM_TOUR__";
        const familyParts = String(event.away_team ?? "").split("|");
        const isFamilyEvent = familyParts[0] === "__FAMILY_EVENT__";

        return {
        id: event.id,
        createdByPlayerId: event.created_by_player_id || undefined,
        gameId: event.game_id || undefined,
        sport: isTour ? "Tour" : event.sport === "MLB" ? "MLB" : "Football",
        visitType: isTour ? "tour" : "game",
        date: event.event_date,
        away: isFamilyEvent ? event.home_team : isTour ? "Stadium Tour" : event.away_team,
        home: isFamilyEvent ? "" : isTour ? event.venue_name : event.home_team,
        venue: event.venue_name,
        city: event.city || "",
        state: event.state_code || "",
        awayScore: event.away_score == null ? "" : String(event.away_score),
        homeScore: event.home_score == null ? "" : String(event.home_score),
        result: event.result || "",
        attendeeIds: attendees.filter((a: any) => a.event_id === event.id).map((a: any) => a.player_id),
        attendeeNames: attendees.filter((a: any) => a.event_id === event.id).map((a: any) => Array.isArray(a.players) ? a.players[0]?.display_name : a.players?.display_name).filter(Boolean),
        memories: memories.filter((m: any) => m.event_id === event.id).map((m: any) => ({ playerId: m.player_id, playerName: (Array.isArray(m.players) ? m.players[0]?.display_name : m.players?.display_name) || "FamBam", note: m.note || "" })),
        photos: Array.isArray(photos[event.id]) ? photos[event.id] : [],
        entryType: isFamilyEvent ? "family" : "passport",
        familyCategory: isFamilyEvent ? familyParts[1] || "Other" : undefined,
        familyMilestone: isFamilyEvent ? familyParts[2] || "" : undefined,
      };
      });
      setPassportEntries(mapped);
      setVisitedStates(Array.isArray(body.visitedStates) ? body.visitedStates : []);
    } catch (error) {
      setPassportError(error instanceof Error ? error.message : "Could not load Passport.");
    } finally {
      setPassportLoading(false);
    }
  }

  useEffect(() => { void loadPassport(); }, [signedInPlayer?.id]);

  async function passportPost(payload: any) {
    if (!signedInPlayer) throw new Error("Sign in first.");
    const token = window.localStorage.getItem("fambam_session_token");
    if (!token) throw new Error("Your FamBam session has expired.");
    const response = await fetch("/api/passport", {
      method: "POST",
      headers: { "content-type": "application/json", "x-fambam-session": token },
      body: JSON.stringify({ playerId: signedInPlayer.id, ...payload }),
    });
    const parsed = await readPassportResponse(response);
    if (parsed.error) throw new Error(parsed.error);
    const body = parsed.body ?? {};
    if (!response.ok) throw new Error(body.error || `Passport update failed (${response.status}).`);
    return body;
  }

  async function toggleVisitedState(code: string) {
    const currentlyVisited = visitedStates.includes(code);
    setVisitedStates(currentlyVisited ? visitedStates.filter((x) => x !== code) : [...visitedStates, code]);
    try {
      await passportPost({ action: "toggleState", state: code, visited: !currentlyVisited });
    } catch (error) {
      setVisitedStates(visitedStates);
      setPassportError(error instanceof Error ? error.message : "Could not update state.");
    }
  }

  function openPassportAdd() {
    if (!signedInPlayer) return;
    setPassportAttendeeIds([signedInPlayer.id]);
    setPassportMyNote("");
    setPassportGameSearch("");
    setPassportAddMode("search");
    setPassportEditingId(null);
    setPassportDraft({ id:"", sport:"Football", visitType:"game", date:"", away:"", home:"", venue:"", city:"", state:"", awayScore:"", homeScore:"", result:"", attendeeIds:[], attendeeNames:[], memories:[], photos:[] });
    setPassportAddOpen(true);
  }

  function openFamilyEventAdd() {
    if (!signedInPlayer) return;
    setFamilyEventDraft({
      date: "",
      title: "",
      category: "Volleyball",
      milestone: "",
      location: "",
      note: "",
      attendeeIds: [signedInPlayer.id],
    });
    setFamilyEventPhoto(null);
    setPassportError(null);
    setFamilyEventOpen(true);
  }

  function openPassportAddFromMemories() {
    setTrophyRoomPanel("passport");
    window.setTimeout(openPassportAdd, 0);
  }

  async function saveFamilyEvent() {
    if (!signedInPlayer) return;
    setFamilyEventSaving(true);
    setPassportError(null);
    try {
      const body = await passportPost({
        action: "createFamilyEvent",
        event: familyEventDraft,
        attendeeIds: familyEventDraft.attendeeIds,
        myNote: familyEventDraft.note,
      });
      setFamilyEventOpen(false);
      await loadPassport();
      if (familyEventPhoto && body.eventId) beginPhotoCrop(familyEventPhoto, "passport", body.eventId);
    } catch (error) {
      setPassportError(error instanceof Error ? error.message : "Could not save family event.");
    } finally {
      setFamilyEventSaving(false);
    }
  }

  function openPassportEdit(entry: PassportEntry) {
    if (!signedInPlayer) return;
    setPassportEditingId(entry.id);
    setPassportAttendeeIds(entry.attendeeIds);
    setPassportMyNote(entry.memories.find((memory) => memory.playerId === signedInPlayer.id)?.note ?? "");
    setPassportGameSearch("");
    setPassportAddMode("manual");
    setPassportDraft({ ...entry, photos: [...entry.photos], memories: [...entry.memories] });
    setPassportError(null);
    setPassportAddOpen(true);
  }

  const passportSearchResults = realGames.filter((game) => {
    const q = passportGameSearch.trim().toLowerCase();
    if (!q) return false;
    const football = game.sport === "College Football";
    const baseball = game.sport === "Baseball";
    if (passportDraft.sport === "Football" && !football) return false;
    if (passportDraft.sport === "MLB" && !baseball) return false;
    return `${game.away} ${game.home} ${game.competition} ${game.startsAt ?? ""}`.toLowerCase().includes(q);
  }).slice(0, 8);

  function choosePassportGame(game: BrowserGame) {
    const date = game.startsAt ? game.startsAt.slice(0, 10) : "";
    setPassportDraft((d) => ({ ...d, gameId: game.id, date, away: game.away, home: game.home, awayScore: game.awayScore == null ? "" : String(game.awayScore), homeScore: game.homeScore == null ? "" : String(game.homeScore) }));
    setPassportGameSearch(`${game.away} at ${game.home}`);
  }

  const signedInLockerTeams =
    lockerPlayers.find((player) => player.id === signedInPlayer?.id)?.teams ?? [];

  const hasTrophyTeam = (sport: TrophyTeamSport) =>
    signedInLockerTeams.some((team) => lockerTeamCountsForTrophy(team, sport));

  const followedTrophySportsCount = new Set(
    signedInLockerTeams.map((team) => team.sport.toLowerCase().trim()),
  ).size;

  const kentuckyTrophySports = new Set(
    signedInLockerTeams
      .filter((team) => team.name.toLowerCase().includes("kentucky"))
      .map((team) => (["soccer", "college-football", "college-basketball", "volleyball", "hockey", "baseball"] as TrophyTeamSport[])
        .find((sport) => lockerTeamCountsForTrophy(team, sport)) ?? team.sport.toLowerCase()),
  );

  const hasPrimaryFavorite = signedInLockerTeams.some((team) => team.is_primary);

  const passportVisitEntries = passportEntries.filter((entry) => entry.entryType !== "family");
  const recordBookRows = recordBookLeaderboard.length > 0 ? recordBookLeaderboard : leaderboard;
  const myRecordAchievements = signedInPlayer
    ? recordBookAchievements[signedInPlayer.id]
    : undefined;

  const savedMemoryCount = passportEntries.reduce(
    (total, entry) => total + entry.memories.filter((memory) => memory.note.trim().length > 0).length,
    0,
  );

  async function savePassportEntry() {
    const isTour = passportDraft.visitType === "tour";
    if (!passportDraft.date || !passportDraft.venue || !passportDraft.state || (!isTour && (!passportDraft.home || !passportDraft.away))) {
      setPassportError(isTour ? "Date, stadium and state are required." : "Date, teams, stadium and state are required.");
      return;
    }
    setPassportSaving(true);
    setPassportError(null);
    try {
      await passportPost({
        action: passportEditingId ? "updateEvent" : "createEvent",
        eventId: passportEditingId,
        event: passportDraft,
        attendeeIds: passportAttendeeIds,
        myNote: passportMyNote,
      });
      setPassportAddOpen(false);
      setPassportEditingId(null);
      await loadPassport();
    } catch (error) {
      setPassportError(error instanceof Error ? error.message : "Could not save stamp.");
    } finally { setPassportSaving(false); }
  }

  async function savePassportMemory() {
    if (!passportMemoryEvent) return;
    setPassportSaving(true);
    try {
      await passportPost({ action: "saveMemory", eventId: passportMemoryEvent.id, note: passportMemoryNote });
      setPassportMemoryEvent(null);
      await loadPassport();
    } catch (error) { setPassportError(error instanceof Error ? error.message : "Could not save memory."); }
    finally { setPassportSaving(false); }
  }

  async function uploadPassportPhoto(eventId: string, file: Blob) {
    if (!signedInPlayer) return;
    const token = window.localStorage.getItem("fambam_session_token");
    if (!token) {
      setPassportError("Your FamBam session has expired.");
      return;
    }

    setPassportPhotoUploadingId(eventId);
    setPassportError(null);
    try {
      const form = new FormData();
      form.append("playerId", signedInPlayer.id);
      form.append("purpose", "passport");
      form.append("eventId", eventId);
      form.append("file", file, "memory-photo.jpg");
      const response = await fetch("/api/passport", {
        method: "POST",
        headers: { "x-fambam-session": token },
        body: form,
      });
      const responseText = await response.text();
      const body = responseText ? (() => {
        try { return JSON.parse(responseText); }
        catch { return { error: `Picture service returned an unreadable response (${response.status}).` }; }
      })() : { error: `Picture service returned an empty response (${response.status}).` };
      if (!response.ok) throw new Error(body.error || "Could not upload picture.");
      setPassportEntries((current) => current.map((entry) =>
        entry.id === eventId && !entry.photos.includes(body.url)
          ? { ...entry, photos: [body.url, ...entry.photos] }
          : entry,
      ));
      return body.url as string;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload picture.";
      setPassportError(message);
      throw new Error(message);
    } finally {
      setPassportPhotoUploadingId(null);
    }
  }

  async function deletePassportPhoto(eventId: string, photoUrl: string) {
    if (!signedInPlayer) return false;
    if (!window.confirm("Delete this picture from the Passport entry?")) return false;

    setPassportPhotoUploadingId(eventId);
    setPassportError(null);
    try {
      await passportPost({ action: "deletePhoto", eventId, photoUrl });
      setPassportEntries((current) => current.map((entry) =>
        entry.id === eventId
          ? { ...entry, photos: entry.photos.filter((photo) => photo !== photoUrl) }
          : entry,
      ));
      return true;
    } catch (error) {
      setPassportError(error instanceof Error ? error.message : "Could not delete picture.");
      return false;
    } finally {
      setPassportPhotoUploadingId(null);
    }
  }

  function beginPhotoCrop(
    file: File,
    purpose: "profile" | "passport",
    eventId?: string,
  ) {
    if (photoCrop) URL.revokeObjectURL(photoCrop.previewUrl);
    setPhotoCrop({ file, purpose, eventId, previewUrl: URL.createObjectURL(file) });
    setPhotoCropZoom(1);
    setPhotoCropX(0);
    setPhotoCropY(0);
    setPhotoCropError(null);
  }

  function closePhotoCrop() {
    if (photoCrop) URL.revokeObjectURL(photoCrop.previewUrl);
    setPhotoCrop(null);
    setPhotoCropSaving(false);
    setPhotoCropError(null);
  }

  async function saveCroppedPhoto() {
    if (!photoCrop) return;
    setPhotoCropSaving(true);
    setPhotoCropError(null);
    setProfileError(null);
    setPassportError(null);

    try {
      const cropped = await preparePhotoForUpload(
        photoCrop.file,
        photoCrop.purpose === "profile" ? 1 : 4 / 3,
        photoCropZoom,
        photoCropX,
        photoCropY,
      );

      if (photoCrop.purpose === "profile") {
        await uploadProfilePhoto(cropped);
      } else if (photoCrop.eventId) {
        await uploadPassportPhoto(photoCrop.eventId, cropped);
      } else {
        throw new Error("This Passport entry could not be identified. Close the crop window and try again.");
      }

      closePhotoCrop();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not crop this picture.";
      if (photoCrop.purpose === "profile") setProfileError(message);
      else setPassportError(message);
      setPhotoCropError(message);
      setPhotoCropSaving(false);
    }
  }


  return (
    <main className="min-h-screen bg-[#eef1f4] pb-24 text-[#10254a]">
      {/* DARK APP HEADER */}
      <header className="sticky top-0 z-50 bg-[#06284a] text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/icon-512.png"
              alt="FamBam Sports"
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />

            <div className="min-w-0">
              <div className="truncate text-xl font-black tracking-tight">
                FamBam
              </div>
              <div className="text-[8px] font-black uppercase tracking-[0.28em] text-[#f3c64f]">
                Family · Sports · Fun
              </div>
            </div>
          </div>

          {signedInPlayer ? (
            <button
              onClick={() => void openProfile()}
              className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-[#f3c64f] text-[10px] font-black text-[#06284a]">
                {signedInPlayer.avatar_url ? (
                  <img src={signedInPlayer.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : signedInPlayer.initials}
              </div>

              <div>
                <div className="text-sm font-black">
                  Hi {signedInPlayer.display_name}!
                </div>
                <div className="text-[9px] font-bold text-blue-100">
                  Tap for profile
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActiveSection("Home");
                setActiveSport("All");
                window.setTimeout(() => {
                  document
                    .getElementById("signin")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 0);
              }}
              className="rounded-xl bg-[#f3c64f] px-4 py-2 text-xs font-black text-[#06284a]"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {activeSection === "Home" && (
      <div className="mx-auto max-w-5xl px-3 py-3">
        {/* SIGN IN */}
        {!signedInPlayer && (
          <section
            id="signin"
            className="overflow-hidden rounded-2xl bg-[#06284a] p-5 text-white shadow-sm"
          >
            <div className="text-center">
              <div className="text-3xl">🏆</div>
              <h2 className="mt-2 text-2xl font-black">
                Who&apos;s playing?
              </h2>
              <p className="mt-1 text-xs font-semibold text-blue-100">
                Pick your profile to jump in.
              </p>
            </div>

            {loading ? (
              <p className="mt-5 text-center">Loading...</p>
            ) : (
              <div className="mt-5 grid grid-cols-5 gap-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => choosePlayer(player)}
                    className="min-w-0 rounded-xl bg-white/10 px-1 py-3 active:scale-95"
                  >
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#06284a]">
                      {player.initials}
                    </div>
                    <div className="mt-2 truncate text-[9px] font-black">
                      {player.display_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {signedInPlayer && (
          <>
            {/* CHALLENGE STRIP */}
            <section className="mb-2.5 overflow-hidden rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] shadow-sm">
              <div className="flex min-h-[92px] items-stretch">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
                  <div className="text-4xl">🏆</div>

                  <div className="min-w-0">
                    <div className="text-sm font-black uppercase text-[#10254a]">
                      This Week&apos;s Challenge
                    </div>
                    <div className="mt-0.5 text-sm font-black text-[#10254a]">
                      {currentPlayerReady
                        ? "Your picks are in!"
                        : "This week’s picks are open!"}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      Every game locks at kickoff.
                    </div>
                  </div>
                </div>

                <button
                  onClick={openPicks}
                  className="flex w-[42%] max-w-[180px] shrink-0 flex-col items-center justify-center bg-[#06284a] px-2 text-center text-white active:bg-[#0a365f]"
                >
                  {currentPlayerReady ? (
                    <>
                      <div className="text-[10px] font-bold text-blue-100">
                        You&apos;re all set
                      </div>
                      <div className="text-2xl font-black text-[#f3c64f]">
                        {challengeGamesWithSavedPick}/{challengeGames.length}
                      </div>
                      <div className="text-[10px] font-black">
                        picks complete ✓
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold text-blue-100">
                        You have
                      </div>
                      <div className="text-xl font-black text-[#f3c64f]">
                        {Math.max(
                          0,
                          challengeGames.length -
                            challengeGamesWithSavedPick,
                        )} picks left
                      </div>
                      <div className="mt-0.5 text-[10px] font-black">
                        Finish My Picks ›
                      </div>
                    </>
                  )}
                </button>
              </div>
            </section>
          </>
        )}

        {/* TODAY'S GAMES */}
        <section className="mb-2.5 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🗓️</span>
              <h2 className="text-base font-black uppercase">
                Today&apos;s Games
              </h2>
            </div>
            <div className="text-[10px] font-black uppercase text-[#10254a]">
              Today
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            {filteredGames
              .filter((game) => {
                if (!game.startsAt) return false;

                const status = (game.status ?? "").toLowerCase();
                const finalStatuses = [
                  "final",
                  "finished",
                  "complete",
                  "completed",
                  "closed",
                ];

                if (
                  finalStatuses.some((finalStatus) =>
                    status.includes(finalStatus),
                  )
                ) {
                  return false;
                }

                const gameDay = new Date(game.startsAt).toLocaleDateString(
                  "en-CA",
                  { timeZone: "America/New_York" },
                );

                const todayDay = new Date(
                  currentTime ?? Date.now(),
                ).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                return gameDay === todayDay;
              })
              .sort(
                (a, b) =>
                  new Date(a.startsAt!).getTime() -
                  new Date(b.startsAt!).getTime(),
              )
              .slice(0, 4)
              .map((game) => (
              <article
                key={game.id}
                className="rounded-xl border border-slate-200 bg-[#f9fafb] p-3 shadow-sm"
              >
                <div className="flex h-full flex-col">
                  <div className="flex min-w-0 items-center gap-2 border-b border-slate-200 pb-2">
                    <div className="text-2xl">{game.icon}</div>
                    <div className="min-w-0 truncate text-[7px] font-black uppercase leading-tight text-[#765800]">
                      {game.competition}
                    </div>
                  </div>

                  <div className="mt-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openGameRoom(game)}
                      className="block w-full rounded-xl text-left active:bg-slate-50"
                      aria-label={`Open game details for ${game.away} vs ${game.home}`}
                    >
                    <div className="text-[12px] font-black leading-tight text-[#10254a]">
                      {game.sport === "College Football"
                        ? rankedTeamLabel(game.away, collegeFootballRankings)
                        : game.away}
                      {" vs "}
                      {game.sport === "College Football"
                        ? rankedTeamLabel(game.home, collegeFootballRankings)
                        : game.home}
                    </div>

                    <div className="mt-1 text-[9px] font-semibold text-slate-500">
                      {formatGameTime(game.startsAt, game.startTimeTbd)}
                    </div>

                    {(() => {
                      const normalizedStatus = (
                        game.status ?? ""
                      ).toLowerCase();

                      const isFinal = [
                        "final",
                        "finished",
                        "complete",
                        "completed",
                        "closed",
                      ].some((status) =>
                        normalizedStatus.includes(status),
                      );

                      const startMs = game.startsAt
                        ? new Date(game.startsAt).getTime()
                        : Number.MAX_SAFE_INTEGER;

                      const hasStarted = Date.now() >= startMs;

                      const isLive =
                        !isFinal &&
                        hasStarted &&
                        (normalizedStatus.includes("live") ||
                          normalizedStatus.includes("in_progress") ||
                          normalizedStatus.includes("in progress"));

                      if (!isLive && !isFinal) {
                        return null;
                      }

                      return (
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-[#06284a] px-3 py-2 text-white">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-wide text-[#f3c64f]">
                              {isFinal ? "Final" : "🔴 Live"}
                            </div>

                            <div className="mt-0.5 text-xs font-black">
                              {game.away} {game.awayScore ?? 0}
                              {" · "}
                              {game.home} {game.homeScore ?? 0}
                            </div>
                          </div>

                          <div className="text-[9px] font-black uppercase text-slate-200">
                            {isFinal ? "FINAL" : "LIVE"}
                          </div>
                        </div>
                      );
                    })()}

                    </button>

                  </div>
                </div>
              </article>
            ))}

            {!gamesLoading &&
              filteredGames.filter((game) => {
                if (!game.startsAt) return false;

                const status = (game.status ?? "").toLowerCase();
                const finalStatuses = [
                  "final",
                  "finished",
                  "complete",
                  "completed",
                  "closed",
                ];

                if (
                  finalStatuses.some((finalStatus) =>
                    status.includes(finalStatus),
                  )
                ) {
                  return false;
                }

                const gameDay = new Date(game.startsAt).toLocaleDateString(
                  "en-CA",
                  { timeZone: "America/New_York" },
                );

                const todayDay = new Date(
                  currentTime ?? Date.now(),
                ).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                return gameDay === todayDay;
              }).length > 0 && (
                <div className="py-2 text-center">
                  <button
                    onClick={() => setActiveSection("Games")}
                    className="text-[11px] font-black text-[#164d9b]"
                  >
                    See All Today →
                  </button>
                </div>
              )}

            {!gamesLoading &&
              filteredGames.filter((game) => {
                if (!game.startsAt) return false;

                const status = (game.status ?? "").toLowerCase();
                const finalStatuses = [
                  "final",
                  "finished",
                  "complete",
                  "completed",
                  "closed",
                ];

                if (
                  finalStatuses.some((finalStatus) =>
                    status.includes(finalStatus),
                  )
                ) {
                  return false;
                }

                const gameDay = new Date(game.startsAt).toLocaleDateString(
                  "en-CA",
                  { timeZone: "America/New_York" },
                );

                const todayDay = new Date(
                  currentTime ?? Date.now(),
                ).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                return gameDay === todayDay;
              }).length === 0 && (
              <div className="col-span-2 py-5 text-center text-xs font-bold text-slate-500">
                No games on your radar today.
              </div>
            )}
          </div>
        </section>

        {/* RECENT RESULTS */}
        {recentResults.length > 0 && (
          <section className="mb-2.5 overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏁</span>
                <h2 className="text-base font-black uppercase">
                  Recent Results
                </h2>
              </div>

              <div className="text-[10px] font-black uppercase text-slate-500">
                Last 7 Days
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3">
              {recentResults.map((game) => {
                const hasScore =
                  game.awayScore !== null &&
                  game.homeScore !== null;

                const awayWon =
                  hasScore &&
                  game.awayScore! > game.homeScore!;

                const homeWon =
                  hasScore &&
                  game.homeScore! > game.awayScore!;

                return (
                  <article key={game.id} className="rounded-xl border border-slate-200 bg-[#f9fafb] p-3 shadow-sm">
                    <button
                      type="button"
                      onClick={() => openGameRoom(game)}
                      className="block w-full rounded-xl text-left active:bg-slate-50"
                      aria-label={`Open final game details for ${game.away} vs ${game.home}`}
                    >
                      <div className="flex h-full flex-col">
                        <div className="flex min-w-0 items-center gap-2 border-b border-slate-200 pb-2">
                          <div className="text-2xl">{game.icon}</div>
                          <div className="min-w-0 truncate text-[7px] font-black uppercase leading-tight text-[#765800]">
                            {game.competition}
                          </div>
                        </div>

                        <div className="mt-2 min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-1.5">
                            <span className="rounded-full bg-[#f7f4ec] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-[#b28a2e]">
                              Final
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {formatGameDate(game.startsAt)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div
                              className={`truncate text-[12px] ${
                                awayWon
                                  ? "font-black text-[#10254a]"
                                  : "font-bold text-slate-600"
                              }`}
                            >
                              {game.sport === "College Football"
                                ? rankedTeamLabel(
                                    game.away,
                                    collegeFootballRankings,
                                  )
                                : game.away}
                            </div>
                            <div className="shrink-0 text-sm font-black text-[#10254a]">
                              {game.awayScore ?? "—"}
                            </div>
                          </div>

                          <div className="mt-0.5 flex items-center justify-between gap-3">
                            <div
                              className={`truncate text-[14px] ${
                                homeWon
                                  ? "font-black text-[#10254a]"
                                  : "font-bold text-slate-600"
                              }`}
                            >
                              {game.sport === "College Football"
                                ? rankedTeamLabel(
                                    game.home,
                                    collegeFootballRankings,
                                  )
                                : game.home}
                            </div>
                            <div className="shrink-0 text-lg font-black text-[#10254a]">
                              {game.homeScore ?? "—"}
                            </div>
                          </div>


                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* THIS WEEK */}
        <section className="mb-2.5 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🗓️</span>
              <h2 className="text-base font-black uppercase">
                This Week
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveSection("Games");
                setActiveSport("All");
              }}
              className="rounded-full bg-[#f7f4ec] px-3 py-1.5 text-[9px] font-black uppercase text-[#164d9b] active:scale-95"
            >
              View All Games →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            {filteredGames
              .filter((game) => {
                if (!game.startsAt) return false;

                const startsAtMs =
                  new Date(game.startsAt).getTime();

                const nowMs =
                  currentTime ?? Date.now();

                const gameDay =
                  new Date(
                    game.startsAt,
                  ).toLocaleDateString(
                    "en-CA",
                    {
                      timeZone:
                        "America/New_York",
                    },
                  );

                const todayDay =
                  new Date(
                    nowMs,
                  ).toLocaleDateString(
                    "en-CA",
                    {
                      timeZone:
                        "America/New_York",
                    },
                  );

                const sevenDaysFromNow =
                  nowMs +
                  7 * 24 * 60 * 60 * 1000;

                return (
                  gameDay > todayDay &&
                  startsAtMs <= sevenDaysFromNow
                );
              })
              .sort(
                (a, b) =>
                  new Date(
                    a.startsAt ?? 0,
                  ).getTime() -
                  new Date(
                    b.startsAt ?? 0,
                  ).getTime(),
              )
              .slice(0, 6)
              .map((game) => (
                <article
                  key={game.id}
                  onClick={() =>
                    openGameRoom(game)
                  }
                  className="cursor-pointer rounded-xl border border-slate-200 bg-[#f9fafb] p-3 shadow-sm transition active:scale-[0.98]"
                >
                  <div className="flex h-full flex-col">
                    <div className="flex min-w-0 items-center gap-2 border-b border-slate-200 pb-2">
                      <div className="text-2xl">
                        {game.icon}
                      </div>

                      <div className="min-w-0 truncate text-[7px] font-black uppercase leading-tight text-[#765800]">
                        {game.competition}
                      </div>
                    </div>

                    <div className="mt-2 min-w-0 flex-1">
                      <div className="text-[12px] font-black leading-tight text-[#10254a]">
                        {game.sport ===
                        "College Football"
                          ? rankedTeamLabel(
                              game.away,
                              collegeFootballRankings,
                            )
                          : game.away}
                        {" vs "}
                        {game.sport ===
                        "College Football"
                          ? rankedTeamLabel(
                              game.home,
                              collegeFootballRankings,
                            )
                          : game.home}
                      </div>

                      <div className="mt-1 text-[9px] font-semibold text-slate-500">
                        {formatGameDate(
                          game.startsAt,
                        )}
                        {" · "}
                        {formatGameTime(
                          game.startsAt,
                          game.startTimeTbd,
                        )}
                      </div>

                    </div>
                  </div>
                </article>
              ))}

            {filteredGames.filter((game) => {
              if (!game.startsAt) return false;

              const startsAtMs =
                new Date(game.startsAt).getTime();

              const nowMs =
                currentTime ?? Date.now();

              const gameDay =
                new Date(
                  game.startsAt,
                ).toLocaleDateString(
                  "en-CA",
                  {
                    timeZone:
                      "America/New_York",
                  },
                );

              const todayDay =
                new Date(
                  nowMs,
                ).toLocaleDateString(
                  "en-CA",
                  {
                    timeZone:
                      "America/New_York",
                  },
                );

              return (
                gameDay > todayDay &&
                startsAtMs <=
                  nowMs +
                    7 *
                      24 *
                      60 *
                      60 *
                      1000
              );
            }).length === 0 && (
              <div className="col-span-2 py-5 text-center text-xs font-bold text-slate-500">
                No games on your radar this week.
              </div>
            )}
          </div>
        </section>


      </div>

      )}

      {activeSection === "Games" && signedInPlayer && (
        <section
          className="mx-auto max-w-5xl px-3 py-4"
          style={{
            paddingBottom:
              "calc(env(safe-area-inset-bottom, 0px) + 90px)",
          }}
        >
          <div className="mb-3">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#b28a2e]">
              FamBam Radar
            </div>
            <h1 className="mt-1 text-2xl font-black text-[#10254a]">
              Games to Watch 👀
            </h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Tap any game for scores, context, picks and everything you need to know.
            </p>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {[
              "All",
              "Soccer",
              "College Football",
              "College Basketball",
              "Volleyball",
              "Hockey",
              "Baseball",
            ].map((sport) => (
              <button
                key={sport}
                onClick={() => setActiveSport(sport as Sport)}
                className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black ${
                  activeSport === sport
                    ? "bg-[#06284a] text-white"
                    : "bg-white text-[#10254a] shadow-sm"
                }`}
              >
                {sport}
              </button>
            ))}
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["All", "All"],
                ["Must Watch", "🔥 Must Watch"],
                ["Big Game", "⭐ Big Game"],
                ["FamBam", "💙 FamBam"],
                ["Worth Watching", "👀 Worth Watching"],
              ] as const
            ).map(([filter, label]) => (
              <button
                key={filter}
                onClick={() => setActiveWatchFilter(filter)}
                className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black transition ${
                  activeWatchFilter === filter
                    ? "bg-[#f3c64f] text-[#06284a] shadow-sm"
                    : "bg-white text-[#10254a] shadow-sm"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(() => {
            const sortedGames = [...filteredGames].sort((a, b) => {
              const aTime = a.startsAt
                ? new Date(a.startsAt).getTime()
                : Number.MAX_SAFE_INTEGER;

              const bTime = b.startsAt
                ? new Date(b.startsAt).getTime()
                : Number.MAX_SAFE_INTEGER;

              return aTime - bTime;
            });

            const groupedGames = sortedGames.reduce<
              Record<string, typeof sortedGames>
            >((groups, game) => {
              const key = game.startsAt
                ? (() => {
                    const gameDate = new Date(game.startsAt);

                    return `${gameDate.getFullYear()}-${String(
                      gameDate.getMonth() + 1,
                    ).padStart(2, "0")}-${String(
                      gameDate.getDate(),
                    ).padStart(2, "0")}`;
                  })()
                : "TBD";

              if (!groups[key]) groups[key] = [];
              groups[key].push(game);
              return groups;
            }, {});

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const getDateHeading = (dateKey: string) => {
              if (dateKey === "TBD") {
                return {
                  eyebrow: "DATE TBD",
                  title: "Start time to be announced",
                };
              }

              const [year, month, day] = dateKey.split("-").map(Number);
              const date = new Date(year, month - 1, day);

              if (date.getTime() === today.getTime()) {
                return {
                  eyebrow: "TODAY",
                  title: date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  }),
                };
              }

              if (date.getTime() === tomorrow.getTime()) {
                return {
                  eyebrow: "TOMORROW",
                  title: date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  }),
                };
              }

              return {
                eyebrow: date.toLocaleDateString("en-US", {
                  weekday: "long",
                }).toUpperCase(),
                title: date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                }),
              };
            };

            return (
              <div className="space-y-5">
                {Object.entries(groupedGames).map(
                  ([dateKey, gamesForDate]) => {
                    const heading = getDateHeading(dateKey);

                    return (
                      <section key={dateKey}>
                        <div className="mb-2 flex items-end gap-2 px-1">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b28a2e]">
                            {heading.eyebrow}
                          </div>
                          <div className="pb-px text-[11px] font-bold text-slate-400">
                            {heading.title}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                            {gamesForDate.map((game) => {
                              const watchInfo = getWatchInfo(
                                game,
                                collegeFootballRankings,
                              );

                              const famBamGame =
                                isFamBamGame(game);

                              const watchMarkers: Array<{
                                emoji: string;
                                label: string;
                              }> = [];

                              if (watchInfo.score >= 95) {
                                watchMarkers.push({
                                  emoji: "🔥",
                                  label: "Must Watch",
                                });
                              } else if (watchInfo.score >= 90) {
                                watchMarkers.push({
                                  emoji: "⭐",
                                  label: "Big Game",
                                });
                              } else {
                                watchMarkers.push({
                                  emoji: "👀",
                                  label: "Worth Watching",
                                });
                              }

                              if (famBamGame) {
                                watchMarkers.push({
                                  emoji: "💙",
                                  label: "FamBam Game",
                                });
                              }

                              const normalizedStatus = (
                                game.status ?? ""
                              ).toLowerCase();

                              const isFinal = [
                                "final",
                                "finished",
                                "complete",
                                "completed",
                                "closed",
                              ].some((status) =>
                                normalizedStatus.includes(status),
                              );

                              const hasScore =
                                game.homeScore != null &&
                                game.awayScore != null;

                              const startMs = game.startsAt
                                ? new Date(game.startsAt).getTime()
                                : Number.MAX_SAFE_INTEGER;

                              const nowMs = Date.now();

                              const hasStarted =
                                nowMs >= startMs;

                              const isLive =
                                !isFinal &&
                                hasStarted &&
                                (normalizedStatus.includes("live") ||
                                  normalizedStatus.includes(
                                    "in_progress",
                                  ) ||
                                  normalizedStatus.includes(
                                    "in progress",
                                  ) ||
                                  (hasScore &&
                                    nowMs <=
                                      startMs +
                                        6 * 60 * 60 * 1000));

                              return (
                                <article
                                  key={game.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openGameRoom(game)}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      openGameRoom(game);
                                    }
                                  }}
                                  className="cursor-pointer rounded-xl bg-white px-3 py-3 shadow-sm transition active:bg-slate-50"
                                >
                                  <div className="flex gap-3">
                                    <div className="flex w-12 shrink-0 flex-col items-center justify-start text-center">
                                      <div className="text-2xl">
                                        {game.icon}
                                      </div>

                                      <div className="mt-1 text-[7px] font-black uppercase leading-tight text-[#10254a]">
                                        {game.competition}
                                      </div>

                                      <div className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
                                        {watchMarkers.map((marker) => (
                                          <span
                                            key={`${game.id}-${marker.label}`}
                                            title={marker.label}
                                            aria-label={marker.label}
                                            className="text-[11px] leading-none"
                                          >
                                            {marker.emoji}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="mb-2 flex items-center justify-end">
                                        <span
                                          className={`shrink-0 text-[10px] font-black ${
                                            isLive
                                              ? "text-red-600"
                                              : isFinal
                                                ? "text-slate-500"
                                                : "text-[#10254a]"
                                          }`}
                                        >
                                          {isLive
                                            ? "● LIVE"
                                            : isFinal
                                              ? "FINAL"
                                              : formatGameTime(
                                                  game.startsAt,
                                                  game.startTimeTbd,
                                                )}
                                        </span>
                                      </div>

                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="min-w-0 truncate text-[14px] font-black text-[#10254a]">
                                            {game.sport ===
                                            "College Football"
                                              ? rankedTeamLabel(
                                                  game.away,
                                                  collegeFootballRankings,
                                                )
                                              : game.away}
                                          </div>

                                          {hasScore &&
                                            (isLive || isFinal) && (
                                              <div className="shrink-0 text-lg font-black tabular-nums text-[#10254a]">
                                                {game.awayScore}
                                              </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                          <div className="min-w-0 truncate text-[14px] font-black text-[#10254a]">
                                            {game.sport ===
                                            "College Football"
                                              ? rankedTeamLabel(
                                                  game.home,
                                                  collegeFootballRankings,
                                                )
                                              : game.home}
                                          </div>

                                          {hasScore &&
                                            (isLive || isFinal) && (
                                              <div className="shrink-0 text-lg font-black tabular-nums text-[#10254a]">
                                                {game.homeScore}
                                              </div>
                                            )}
                                        </div>
                                      </div>

                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                        </div>
                      </section>
                    );
                  },
                )}

                {!gamesLoading && filteredGames.length === 0 && (
                  <div className="rounded-2xl bg-white py-8 text-center shadow-sm">
                    <div className="text-2xl">👀</div>
                    <div className="mt-2 text-sm font-black text-[#10254a]">
                      Nothing major on the radar.
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      Try another sport.
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {passportPhotoViewer && (
        <div className="fixed inset-0 z-[155] flex items-center justify-center bg-slate-950/85 p-3">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0 truncate text-sm font-black text-[#10254a]">
                {passportPhotoViewer.title}
              </div>
              <button type="button" onClick={()=>setPassportPhotoViewer(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-100 font-black text-[#10254a]">✕</button>
            </div>
            <div className="bg-slate-950 p-2 sm:p-4">
              <img src={passportPhotoViewer.url} alt={passportPhotoViewer.title} className="max-h-[68vh] w-full rounded-xl object-contain" />
            </div>
            <div className="flex justify-end gap-2 p-4">
              <button type="button" onClick={()=>setPassportPhotoViewer(null)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-xs font-black text-[#10254a]">Close</button>
              {passportPhotoViewer.canDelete && (
                <button
                  type="button"
                  disabled={passportPhotoUploadingId===passportPhotoViewer.eventId}
                  onClick={async()=>{
                    const deleted = await deletePassportPhoto(passportPhotoViewer.eventId, passportPhotoViewer.url);
                    if (deleted) setPassportPhotoViewer(null);
                  }}
                  className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700 disabled:opacity-50"
                >
                  {passportPhotoUploadingId===passportPhotoViewer.eventId ? "Deleting…" : "Delete Photo"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {photoCrop && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 text-[#10254a] shadow-2xl sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#b68718]">Adjust Picture</div>
                <div className="text-xl font-black">Crop it how you want</div>
              </div>
              <button type="button" onClick={closePhotoCrop} disabled={photoCropSaving} className="min-h-11 min-w-11 rounded-full bg-slate-100 font-black">✕</button>
            </div>

            <div className={`relative mx-auto mt-4 overflow-hidden bg-slate-900 ${photoCrop.purpose === "profile" ? "aspect-square max-w-[330px] rounded-full" : "aspect-[4/3] w-full rounded-xl"}`}>
              <img
                src={photoCrop.previewUrl}
                alt="Picture crop preview"
                className="absolute inset-0 h-full w-full select-none object-cover"
                style={{
                  transform: `translate(${-photoCropX * 0.35}%, ${-photoCropY * 0.35}%) scale(${photoCropZoom})`,
                  transformOrigin: "center",
                }}
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/80" />
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-[9px] font-black uppercase tracking-wide">Zoom
                <input type="range" min="1" max="3" step="0.05" value={photoCropZoom} onChange={(event)=>setPhotoCropZoom(Number(event.target.value))} className="mt-2 w-full accent-[#06284a]" />
              </label>
              <label className="block text-[9px] font-black uppercase tracking-wide">Move Left / Right
                <input type="range" min="-100" max="100" step="1" value={photoCropX} onChange={(event)=>setPhotoCropX(Number(event.target.value))} className="mt-2 w-full accent-[#06284a]" />
              </label>
              <label className="block text-[9px] font-black uppercase tracking-wide">Move Up / Down
                <input type="range" min="-100" max="100" step="1" value={photoCropY} onChange={(event)=>setPhotoCropY(Number(event.target.value))} className="mt-2 w-full accent-[#06284a]" />
              </label>
            </div>

            {photoCropError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                {photoCropError}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={closePhotoCrop} disabled={photoCropSaving} className="min-h-12 rounded-xl border border-slate-300 bg-white text-sm font-black">Cancel</button>
              <button type="button" onClick={()=>void saveCroppedPhoto()} disabled={photoCropSaving} className="min-h-12 rounded-xl bg-[#f3c64f] text-sm font-black text-[#06284a] disabled:opacity-60">{photoCropSaving ? "Saving…" : "Use This Crop"}</button>
            </div>
          </div>
        </div>
      )}

      {profileOpen && signedInPlayer && (
        <div className="fixed inset-0 z-[140] flex h-[100dvh] flex-col overflow-hidden bg-[#eef1f4]">
          <div className="shrink-0 border-b border-white/10 bg-[#06284a] text-white shadow-sm">
            <div
              className="mx-auto flex max-w-5xl items-center justify-between px-4 pb-3"
              style={{
                paddingTop:
                  "calc(env(safe-area-inset-top, 0px) + 12px)",
              }}
            >
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f3c64f]">
                  FamBam Profile
                </div>
                <div className="text-xl font-black">
                  {profileDisplayName ||
                    signedInPlayer.display_name}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={profileLoading || profileSaving}
                className="min-h-11 rounded-xl bg-[#f3c64f] px-3 py-2 text-sm font-black text-[#06284a] disabled:opacity-60"
              >
                {profileSaving ? "Saving…" : "Save ✓"}
              </button>
              <button
                onClick={() =>
                  setProfileOpen(false)
                }
                className="min-h-11 rounded-xl bg-white/10 px-3 py-2 text-sm font-black active:bg-white/20"
              >
                ← Back
              </button>
              </div>
            </div>
          </div>

          <div
            className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-3 py-4"
            style={{
              paddingBottom:
                "calc(env(safe-area-inset-bottom, 0px) + 100px)",
            }}
          >
            {profileLoading ? (
              <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">
                Opening your profile…
              </div>
            ) : (
              <>
                {profileError && (
                  <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
                    {profileError}
                  </div>
                )}

                <section className="rounded-2xl bg-[#06284a] p-4 text-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-[#f3c64f] text-sm font-black text-[#06284a]">
                      {profileAvatarUrl ? (
                        <img src={profileAvatarUrl} alt={`${profileDisplayName || signedInPlayer.display_name} profile`} className="h-full w-full object-cover" />
                      ) : (
                        profileInitials || signedInPlayer.initials || "FB"
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-black/65 py-1 text-center text-[7px] font-black uppercase text-white">
                        {profilePhotoUploading ? "Uploading…" : "Photo"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        className="sr-only"
                        disabled={profilePhotoUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) beginPhotoCrop(file, "profile");
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>

                    {profileAvatarUrl && (
                      <button
                        type="button"
                        disabled={profilePhotoUploading}
                        onClick={() => void deleteProfilePhoto()}
                        className="min-h-10 rounded-xl border border-white/25 bg-white/10 px-3 text-[8px] font-black uppercase text-white disabled:opacity-50"
                      >
                        Delete Photo
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <label className="text-[9px] font-black uppercase tracking-[0.16em] text-[#f3c64f]">
                        Display Name
                      </label>
                      <input
                        value={
                          profileDisplayName
                        }
                        onChange={(event) =>
                          setProfileDisplayName(
                            event.target.value,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-base font-black text-white outline-none"
                      />
                    </div>

                    <div className="w-20">
                      <label className="text-[9px] font-black uppercase tracking-[0.16em] text-[#f3c64f]">
                        Initials
                      </label>
                      <input
                        value={
                          profileInitials
                        }
                        maxLength={4}
                        onChange={(event) =>
                          setProfileInitials(
                            event.target.value.toUpperCase(),
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-2 py-2 text-center text-base font-black uppercase text-white outline-none"
                      />
                    </div>
                  </div>
                </section>

                <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b68718]">
                        🔔 Notifications
                      </div>
                      <h2 className="mt-1 text-xl font-black text-[#10254a]">
                        Stay in the game
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Get helpful FamBam reminders right on this phone.
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${notificationEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {notificationEnabled ? "On ✓" : "Off"}
                    </span>
                  </div>

                  {!notificationSupported ? (
                    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">
                      On iPhone, open FamBam from its Home Screen icon and use iOS 16.4 or newer to turn on notifications.
                    </div>
                  ) : !notificationEnabled ? (
                    <button
                      type="button"
                      onClick={() => void enableNotifications()}
                      disabled={notificationSaving}
                      className="mt-4 min-h-12 w-full rounded-xl bg-[#06284a] px-4 text-sm font-black text-white disabled:opacity-60"
                    >
                      {notificationSaving ? "Turning On…" : "Turn On Notifications"}
                    </button>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {([
                        ["pickReminders", "🎯 Pick Reminders", "A nudge when your Challenge card is unfinished"],
                        ["bigGameAlerts", "🏟️ Big Games", "Upcoming games for your favorite teams"],
                        ["trophyAlerts", "🏆 Trophy Celebrations", "Celebrate the weekly FamBam champion"],
                      ] as const).map(([key, title, detail]) => (
                        <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-black text-[#10254a]">{title}</span>
                            <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-slate-500">{detail}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={notificationPreferences[key]}
                            onChange={(event) => void updateNotificationPreference(key, event.target.checked)}
                            className="h-6 w-6 shrink-0 accent-[#06284a]"
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => void disableNotifications()}
                        disabled={notificationSaving}
                        className="w-full py-2 text-[10px] font-black text-slate-400 disabled:opacity-50"
                      >
                        Turn off on this phone
                      </button>
                    </div>
                  )}

                  {notificationMessage && (
                    <div className="mt-3 rounded-xl bg-[#fff7da] px-3 py-2.5 text-xs font-bold text-[#5c4512]">
                      {notificationMessage}
                    </div>
                  )}
                </section>

                <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b68718]">
                    ❤️ My Sports
                  </div>
                  <h2 className="mt-1 text-xl font-black text-[#10254a]">
                    What do you care about?
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    This helps FamBam show you the games and teams you actually want to see.
                  </p>

                  <div className="mt-4 space-y-2">
                    {profileSports.map(
                      (sport) => {
                        const choice =
                          profileSportChoices.find(
                            (item) =>
                              item.sportId ===
                              sport.id,
                          );

                        return (
                          <div
                            key={sport.id}
                            className="rounded-xl border border-slate-200 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="text-xl">
                                  {sport.emoji ||
                                    "🏅"}
                                </span>
                                <span className="truncate text-sm font-black text-[#10254a]">
                                  {sport.name}
                                </span>
                              </div>

                              <div className="flex shrink-0 gap-1">
                                <button
                                  onClick={() =>
                                    setProfileSport(
                                      sport.id,
                                      choice
                                        ? null
                                        : "follow",
                                    )
                                  }
                                  className={`rounded-lg px-2.5 py-2 text-[10px] font-black ${
                                    !choice
                                      ? "bg-slate-100 text-slate-500"
                                      : "bg-[#e8f0fb] text-[#06284a]"
                                  }`}
                                >
                                  {!choice
                                    ? "Not Following"
                                    : "Following ✓"}
                                </button>
                              </div>
                            </div>

                          </div>
                        );
                      },
                    )}
                  </div>
                </section>

                <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b68718]">
                    ⭐ Favorite Teams
                  </div>
                  <h2 className="mt-1 text-xl font-black text-[#10254a]">
                    Your teams
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Keep your teams here and choose one favorite for each sport.
                  </p>

                  <div className="mt-3 space-y-2">
                    {profileFavoriteTeamIds.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                        <div className="text-sm font-black text-[#10254a]">
                          No favorite teams yet
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          Add the teams you want FamBam to follow for you.
                        </div>
                      </div>
                    ) : (
                      profileFavoriteTeamIds
                        .map((teamId) =>
                          profileTeams.find(
                            (team) => team.id === teamId,
                          ),
                        )
                        .filter(
                          (team): team is ProfileTeam =>
                            Boolean(team),
                        )
                        .map((team) => {
                          const primary =
                            profilePrimaryTeamIdsBySport[
                              team.sport_id
                            ] === team.id;
                          const lockerIndex = profileFavoriteTeamIds.indexOf(team.id);

                          return (
                            <div
                              key={team.id}
                              className="rounded-xl border border-[#f3c64f] bg-[#fffaf0] p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg">
                                    ❤️
                                  </div>

                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-black text-[#10254a]">
                                      {team.name}
                                    </div>
                                    <div className="text-[9px] font-bold text-slate-400">
                                      {profileSports.find(
                                        (sport) =>
                                          sport.id === team.sport_id,
                                      )?.name ?? "Team"}
                                      {team.abbreviation
                                        ? ` • ${team.abbreviation}`
                                        : ""}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex max-w-[180px] shrink-0 flex-wrap items-center justify-end gap-1.5">
                                  <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <button
                                      type="button"
                                      aria-label={`Move ${team.name} earlier`}
                                      title="Move earlier"
                                      disabled={lockerIndex <= 0}
                                      onClick={() => moveFavoriteTeam(team.id, -1)}
                                      className="min-h-9 min-w-9 border-r border-slate-200 text-sm font-black text-[#10254a] disabled:text-slate-200"
                                    >
                                      ←
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Move ${team.name} later`}
                                      title="Move later"
                                      disabled={lockerIndex >= profileFavoriteTeamIds.length - 1}
                                      onClick={() => moveFavoriteTeam(team.id, 1)}
                                      className="min-h-9 min-w-9 text-sm font-black text-[#10254a] disabled:text-slate-200"
                                    >
                                      →
                                    </button>
                                  </div>
                                  <button
                                    onClick={() =>
                                      setProfilePrimaryTeamIdsBySport(
                                        (current) => {
                                          const next = {
                                            ...current,
                                          };

                                          if (primary) {
                                            delete next[
                                              team.sport_id
                                            ];
                                          } else {
                                            next[
                                              team.sport_id
                                            ] = team.id;
                                          }

                                          return next;
                                        },
                                      )
                                    }
                                    className={`rounded-lg px-3 py-2 text-[10px] font-black ${
                                      primary
                                        ? "bg-[#f3c64f] text-[#06284a]"
                                        : "bg-white text-slate-500"
                                    }`}
                                  >
                                    {primary
                                      ? "⭐ Favorite"
                                      : "Make Favorite"}
                                  </button>

                                  <button
                                    onClick={() =>
                                      toggleFavoriteTeam(team.id)
                                    }
                                    className="rounded-lg bg-white px-3 py-2 text-[10px] font-black text-slate-400"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>

                  {!profileAddingTeam ? (
                    <button
                      onClick={() => {
                        setProfileAddingTeam(true);
                        setProfileTeamSearch("");
                      }}
                      className="mt-3 w-full rounded-xl border-2 border-dashed border-[#f3c64f] bg-[#fffaf0] px-4 py-3 text-sm font-black text-[#06284a]"
                    >
                      + Add Favorite Team
                    </button>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-[#10254a]">
                          Add a team
                        </div>

                        <button
                          onClick={() => {
                            setProfileAddingTeam(false);
                            setProfileTeamSearch("");
                          }}
                          className="rounded-lg bg-white px-3 py-2 text-[10px] font-black text-slate-500"
                        >
                          Done
                        </button>
                      </div>

                      <input
                        value={profileTeamSearch}
                        onChange={(event) =>
                          setProfileTeamSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Search teams…"
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-semibold text-[#10254a] outline-none focus:border-[#06284a]"
                      />

                      <div className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
                        {profileTeams
                          .filter((team) => {
                            if (
                              profileFavoriteTeamIds.includes(
                                team.id,
                              )
                            ) {
                              return false;
                            }

                            const followedSportIds =
                              profileSportChoices.map(
                                (item) => item.sportId,
                              );

                            const sportMatches =
                              followedSportIds.length === 0 ||
                              followedSportIds.includes(
                                team.sport_id,
                              );

                            const query =
                              profileTeamSearch
                                .trim()
                                .toLowerCase();

                            const searchMatches =
                              !query ||
                              team.name
                                .toLowerCase()
                                .includes(query) ||
                              (team.short_name ?? "")
                                .toLowerCase()
                                .includes(query) ||
                              (team.abbreviation ?? "")
                                .toLowerCase()
                                .includes(query);

                            return (
                              sportMatches &&
                              searchMatches
                            );
                          })
                          .map((team) => (
                            <button
                              key={team.id}
                              onClick={() => {
                                toggleFavoriteTeam(team.id);

                                if (
                                  !profilePrimaryTeamIdsBySport[
                                    team.sport_id
                                  ]
                                ) {
                                  setProfilePrimaryTeamIdsBySport(
                                    (current) => ({
                                      ...current,
                                      [team.sport_id]:
                                        team.id,
                                    }),
                                  );
                                }
                              }}
                              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                                ☆
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-[#10254a]">
                                  {team.name}
                                </div>
                                {team.abbreviation && (
                                  <div className="text-[9px] font-bold text-slate-400">
                                    {team.abbreviation}
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </section>

                <button
                  onClick={() => {
                    setProfileOpen(false);
                    switchPlayer();
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-black text-[#10254a]"
                >
                  👥 Switch Player
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeSection === "Locker Room" && (
        <section className="min-h-[calc(100vh-64px)] bg-[#eef1f4]">
          <div className="mx-auto max-w-[1500px] px-2 sm:px-5 sm:py-3">
            <div className="relative overflow-hidden border-x border-[#7b542e] bg-[#1b110b] shadow-2xl sm:rounded-[1.75rem] sm:border">
              <div className="bg-gradient-to-b from-[#15110f] via-[#2a1b12] to-[#100c0a] p-2 sm:p-5">
                <div
                  className="relative flex min-h-[610px] snap-x snap-mandatory gap-0 overflow-x-auto rounded-xl border border-[#8b6235] bg-[#17110d] pb-3 pr-[12vw] pt-2 shadow-[inset_0_0_55px_rgba(0,0,0,.55)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:pr-[6vw]"
                >
                  {(lockerPlayers
                    .find((player) => player.id === signedInPlayer?.id)
                    ?.teams.filter(
                      (team) =>
                        lockerSportFilter === "All" ||
                        team.sport === lockerSportFilter,
                    ) ?? [])
                    .map((team) => {
                      const logoUrl = lockerTeamLogo(team);
                      const nextGame = nextLockerGame(team, realGames);
                      const opponent = nextGame ? lockerOpponent(team, nextGame) : null;
                      const teamIsHome = nextGame
                        ? [team.name, team.short_name ?? ""]
                            .map(normalizeLockerTeamName)
                            .filter((name) => name.length >= 3)
                            .includes(normalizeLockerTeamName(nextGame.home))
                        : false;

                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => {
                            if (nextGame) {
                              void openGameRoom(nextGame);
                            } else {
                              setActiveSection("Games");
                            }
                          }}
                          className="group w-[46vw] min-w-[145px] max-w-[190px] shrink-0 snap-start overflow-hidden border-r border-[#714b2b] bg-[#28180e] bg-cover bg-top text-left transition sm:w-[29vw] sm:min-w-[190px] sm:max-w-[225px] lg:w-[17vw] lg:max-w-[240px]"
                          style={{
                            backgroundImage:
                              "linear-gradient(180deg,rgba(8,5,3,.06),rgba(6,4,3,.42)),url('/locker-bay-realistic.webp')",
                          }}
                        >
                          <div className="relative mx-3 mt-2 flex h-12 items-center justify-center rounded-sm border border-[#b8874f] bg-[linear-gradient(180deg,rgba(92,55,29,.96),rgba(40,23,13,.96))] px-2 text-center shadow-[0_5px_12px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.13)]">
                            <div className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#a77843] shadow-inner" />
                            <div className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#a77843] shadow-inner" />
                            <div className="truncate text-xs font-black uppercase tracking-[0.08em] text-[#f3c64f]">
                              {team.short_name ?? team.name}
                            </div>
                          </div>

                          <div className="relative flex min-h-[550px] flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-4">
                            <div className="absolute inset-x-3 bottom-3 h-[164px] rounded-lg border border-white/10 bg-[linear-gradient(180deg,rgba(20,13,9,.84),rgba(11,8,6,.95))] shadow-[0_10px_24px_rgba(0,0,0,.55)] backdrop-blur-sm" />
                            <div className="absolute left-1/2 top-0 h-8 w-px bg-[#a87845]" />
                            <div className="absolute left-1/2 top-7 h-2 w-7 -translate-x-1/2 rounded-full border border-[#a87845] bg-[#352012]" />

                            <div className="relative mx-auto flex h-20 w-20 shrink-0 items-center justify-center p-2 drop-shadow-[0_8px_12px_rgba(0,0,0,.75)] sm:h-24 sm:w-24">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt={team.name}
                                  className="h-full w-full object-contain drop-shadow-xl"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center rounded-md border border-[#c18a45]/30 bg-[#1d120c] text-3xl font-black text-[#f8efe0] sm:text-5xl">
                                  {(team.short_name ?? team.name).slice(0, 1)}
                                </div>
                              )}
                            </div>

                            <div className="relative mt-1 flex h-10 shrink-0 items-center justify-center text-center text-sm font-black leading-tight text-white drop-shadow-[0_2px_4px_#000] sm:text-base">
                              <span className="line-clamp-2">
                              {team.name}
                              </span>
                            </div>
                            <div className="relative mt-1 h-5 shrink-0 text-center text-xs font-semibold text-[#d7c2a7]">
                              {team.sport}
                              {team.is_primary ? " · ⭐ Favorite" : ""}
                            </div>

                            <div className="relative mt-1 h-[238px] shrink-0 overflow-visible">
                              {(() => {
                                const colors = lockerTeamColors(team);
                                const label = (team.short_name ?? team.name).replace(/\s+(FC|Football|Cheerleading)$/i, "");
                                const ball = team.sport === "College Football" ? "🏈" : team.sport === "College Basketball" ? "🏀" : team.sport === "Volleyball" ? "🏐" : team.sport === "Baseball" ? "⚾" : "";
                                const uniformAsset = lockerUniformAsset(team);

                                if (uniformAsset) {
                                  return (
                                    <div className="absolute inset-0 flex items-start justify-center">
                                      <div className="relative h-full w-full">
                                        <img
                                          src={uniformAsset}
                                          alt={`${team.name} uniform hanging in the locker`}
                                          className="absolute left-1/2 top-0 z-10 h-[228px] w-[94%] -translate-x-1/2 object-contain object-top drop-shadow-[0_18px_14px_rgba(0,0,0,.8)]"
                                          onError={(event) => {
                                            event.currentTarget.style.display = "none";
                                            event.currentTarget.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                        <div
                                          aria-hidden="true"
                                          className="absolute inset-0 hidden"
                                        >
                                          <div className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-[#c89b67]" />
                                          <div className="absolute left-1/2 top-3 h-5 w-14 -translate-x-1/2 rounded-t-full border-2 border-[#9f744b] border-b-0" />
                                          <div
                                            className="absolute left-1/2 top-8 h-[160px] w-[142px] -translate-x-1/2 overflow-hidden rounded-b-[22px] border drop-shadow-[0_16px_12px_rgba(0,0,0,.75)]"
                                            style={{
                                              background: `linear-gradient(100deg,${colors.primary} 0%,${colors.primary} 35%,rgba(255,255,255,.2) 43%,${colors.primary} 52%,rgba(0,0,0,.22) 69%,${colors.primary} 100%)`,
                                              borderColor: `${colors.secondary}bb`,
                                              clipPath: "polygon(18% 0,34% 8%,50% 12%,66% 8%,82% 0,100% 11%,92% 100%,8% 100%,0 11%)",
                                            }}
                                          >
                                            <div
                                              className="absolute inset-x-0 top-0 h-4 opacity-50"
                                              style={{ backgroundColor: colors.secondary }}
                                            />
                                            <div
                                              className="mt-7 truncate px-2 text-center text-[8px] font-black uppercase tracking-wide"
                                              style={{ color: colors.secondary }}
                                            >
                                              {label}
                                            </div>
                                            {logoUrl && (
                                              <img
                                                src={logoUrl}
                                                alt=""
                                                className="mx-auto mt-3 h-12 w-12 object-contain drop-shadow-md"
                                              />
                                            )}
                                          </div>
                                          <div className="absolute bottom-3 left-[36%] h-[5px] w-28 -rotate-[65deg] rounded-full bg-[linear-gradient(90deg,#d6b078,#80552d)] shadow-md" />
                                          <div className="absolute bottom-0 right-[24%] h-3 w-7 rounded-[50%] bg-[#090909] shadow-md" />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="absolute inset-0">
                                    <div className="absolute left-3 right-3 top-4 h-[3px] rounded-full bg-[linear-gradient(180deg,#d9b17c,#6c4527)] shadow-[0_3px_5px_rgba(0,0,0,.65)]" />
                                    <div className="absolute left-1/2 top-4 h-5 w-px -translate-x-1/2 bg-[#c89b67]" />
                                    <div className="absolute left-1/2 top-7 h-5 w-14 -translate-x-1/2 rounded-t-full border-2 border-[#9f744b] border-b-0" />

                                    <div className="absolute left-1/2 top-9 h-[160px] w-[142px] -translate-x-1/2 drop-shadow-[0_16px_12px_rgba(0,0,0,.75)]">
                                      <div className="absolute left-0 top-5 h-14 w-12 -rotate-[9deg] rounded-l-xl border" style={{ background: `linear-gradient(125deg,${colors.primary},${colors.primary} 48%,${colors.secondary} 52%,${colors.primary} 66%)`, borderColor: `${colors.secondary}aa`, clipPath: "polygon(30% 0,100% 23%,84% 100%,0 83%,7% 20%)" }} />
                                      <div className="absolute right-0 top-5 h-14 w-12 rotate-[9deg] rounded-r-xl border" style={{ background: `linear-gradient(235deg,${colors.primary},${colors.primary} 48%,${colors.secondary} 52%,${colors.primary} 66%)`, borderColor: `${colors.secondary}aa`, clipPath: "polygon(0 23%,70% 0,93% 20%,100% 83%,16% 100%)" }} />
                                      <div className="absolute left-[28px] right-[28px] top-0 bottom-0 overflow-hidden rounded-b-[22px] border" style={{ background: `linear-gradient(100deg,${colors.primary} 0%,${colors.primary} 35%,rgba(255,255,255,.20) 43%,${colors.primary} 52%,rgba(0,0,0,.22) 69%,${colors.primary} 100%)`, borderColor: `${colors.secondary}bb`, clipPath: "polygon(18% 0,34% 8%,50% 12%,66% 8%,82% 0,100% 11%,92% 100%,8% 100%,0 11%)" }}>
                                        <div className="absolute inset-x-0 top-0 h-4 opacity-50" style={{ backgroundColor: colors.secondary }} />
                                        <div className="mt-6 truncate px-1 text-center text-[7px] font-black uppercase tracking-wide" style={{ color: colors.secondary }}>{label}</div>
                                        {logoUrl && <img src={logoUrl} alt="" className="mx-auto mt-2 h-9 w-9 object-contain drop-shadow-md" />}
                                        <div className="absolute bottom-2 left-3 right-3 h-px bg-white/15" />
                                      </div>
                                    </div>

                                    <div className="hidden absolute bottom-[72px] left-3 h-11 w-[66px] -rotate-2 rounded-[12px] border border-white/10 bg-[linear-gradient(145deg,#263442,#111a23)] shadow-[0_7px_9px_rgba(0,0,0,.6)]">
                                      <div className="absolute -top-3 left-3 right-3 h-5 rounded-t-full border-[3px] border-[#202c37] border-b-0" />
                                      <div className="pt-3 text-center text-[5px] font-black uppercase tracking-wide text-white/65">{label}</div>
                                      <div className="absolute bottom-1 left-2 right-2 h-px bg-white/10" />
                                    </div>
                                    <div className="hidden absolute bottom-[72px] right-4 h-12 w-5 rotate-2 rounded-b-lg rounded-t-[9px] border border-white/25 shadow-[0_5px_7px_rgba(0,0,0,.5)]" style={{ background: `linear-gradient(90deg,${colors.primary},rgba(255,255,255,.25),${colors.primary})` }}>
                                      <div className="absolute -top-1 left-1/2 h-2 w-3 -translate-x-1/2 rounded-sm bg-[#d9d9d9]" />
                                    </div>

                                    {team.sport === "Soccer" && <><div className="absolute bottom-[8px] left-[25%] right-[18%] h-5 -rotate-3 overflow-hidden rounded-sm border border-white/25 shadow-[0_4px_5px_rgba(0,0,0,.45)]" style={{ background: `repeating-linear-gradient(90deg,${colors.secondary} 0 14px,${colors.primary} 14px 28px)` }}><div className="text-center text-[5px] font-black uppercase leading-[18px]" style={{ color: colors.accent }}>{label}</div></div></>}
                                    {team.sport === "Cheerleading" && <><div className="absolute bottom-[62px] left-[29%] h-8 w-8 rotate-[-12deg]" style={{ background: `radial-gradient(circle at 50% 50%,${colors.secondary} 0 15%,transparent 16%),conic-gradient(${colors.primary},${colors.secondary},${colors.primary},${colors.secondary},${colors.primary})`, clipPath: "polygon(50% 45%,0 0,22% 50%,0 100%,50% 58%,100% 100%,78% 50%,100% 0)" }} /><div className="absolute bottom-[64px] right-[25%] h-7 w-10" style={{ background: `repeating-linear-gradient(12deg,${colors.primary} 0 4px,${colors.secondary} 4px 8px)`, clipPath: "polygon(50% 50%,0 15%,18% 55%,0 90%,50% 62%,100% 90%,82% 55%,100% 15%)" }} /></>}
                                    {team.sport === "Hockey" && <><div className="absolute bottom-[30px] left-[37%] h-[5px] w-28 -rotate-[65deg] rounded-full bg-[linear-gradient(90deg,#d6b078,#80552d)] shadow-md" /><div className="absolute bottom-[14px] right-[25%] h-3 w-7 rounded-[50%] bg-[#090909] shadow-md" /></>}
                                    {team.sport === "Baseball" && <><div className="absolute bottom-[64px] left-[34%] h-8 w-12 rounded-t-full border-2 shadow-md" style={{ background: `linear-gradient(145deg,${colors.primary},#111)`, borderColor: colors.secondary }} /><div className="absolute bottom-[64px] right-[25%] text-xl drop-shadow-md">⚾</div></>}
                                    {ball && team.sport !== "Baseball" && <div className="absolute bottom-[61px] right-[25%] text-2xl drop-shadow-[0_4px_3px_rgba(0,0,0,.5)]">{ball}</div>}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="relative mx-3 mt-2 min-h-[112px] border-t border-[#8b6235]/80 px-3 pt-3">
                              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#f3c64f]">
                                {nextGame ? "Next Game" : "Team Locker"}
                              </div>
                              {nextGame ? (
                                <>
                                  <div className="line-clamp-2 min-h-9 text-sm font-black leading-tight text-[#f8efe0]">
                                    {teamIsHome ? "vs" : "at"} {opponent}
                                  </div>
                                  <div className="mt-1 text-[11px] font-semibold leading-tight text-[#cdb89e]">
                                    {formatGameDate(nextGame.startsAt)} · {formatGameTime(nextGame.startsAt, nextGame.startTimeTbd)}
                                  </div>
                                  <div className="mt-1 truncate text-[10px] font-semibold text-white/55">
                                    {nextGame.competition}
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs font-semibold leading-snug text-[#cdb89e]">
                                  No upcoming game loaded yet.
                                </div>
                              )}
                            </div>

                            <div className="relative mx-3 mt-auto flex items-center justify-between border-t border-[#8b6235]/60 px-3 pt-2 text-[10px] font-black uppercase tracking-wide text-[#d7c2a7]">
                              <span>{nextGame ? "Open Matchup" : "Browse Games"}</span>
                              <span className="text-[#f3c64f] transition group-hover:translate-x-1">→</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}

                  {!lockerLoading &&
                    (lockerPlayers
                      .find((player) => player.id === signedInPlayer?.id)
                      ?.teams.filter(
                        (team) =>
                          lockerSportFilter === "All" ||
                          team.sport === lockerSportFilter,
                      ).length ?? 0) === 0 && (
                      <div className="w-full rounded-xl border border-dashed border-[#9a7047] bg-black/20 p-8 text-center">
                        <div className="text-3xl">🏟️</div>
                        <div className="mt-2 text-sm font-black text-white">
                          No teams here yet
                        </div>
                        <button
                          type="button"
                          onClick={() => void openProfile()}
                          className="mt-3 rounded-xl bg-[#f3c64f] px-4 py-2.5 text-xs font-black text-[#33200f]"
                        >
                          Add a Team
                        </button>
                      </div>
                    )}
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {[
                    "All",
                    ...Array.from(
                      new Set(
                        lockerPlayers
                          .find((player) => player.id === signedInPlayer?.id)
                          ?.teams.map((team) => team.sport) ?? [],
                      ),
                    ),
                  ].map((sport) => (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setLockerSportFilter(sport)}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${
                        lockerSportFilter === sport
                          ? "border-[#f3c64f] bg-[#f3c64f] text-[#33200f]"
                          : "border-[#9a7047] bg-black/20 text-[#f4e6d2]"
                      }`}
                    >
                      {sport}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 border-y border-[#7b542e] py-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f3c64f]">
                      My Teams
                    </div>
                    <div className="mt-0.5 text-xs font-bold text-[#d7c2a7]">
                      {lockerSportFilter === "All"
                        ? "Everything I follow"
                        : lockerSportFilter}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openProfile()}
                    className="rounded-xl border border-[#f3c64f] bg-black/20 px-3 py-2 text-xs font-black text-[#f3c64f]"
                  >
                    + Edit Teams
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-[#7b542e] bg-[#1a100a] px-4 py-4 text-center">
                  <div className="text-sm font-black text-[#f4e6d2]">
                    Good teams make great memories. 💛
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeSection === "Trophy Room" && (
        <section className={`min-h-[calc(100vh-96px)] pb-28 text-[#10254a] ${trophyRoomPanel === null ? "bg-[#1b110b]" : "bg-[#eef1f4]"}`}>
          <div className={`mx-auto min-h-[calc(100vh-96px)] max-w-[1500px] ${trophyRoomPanel === null ? "bg-[#1b110b]" : "bg-[#eef1f4]"}`}>
            <div className="sticky top-[72px] z-40 border-b border-[#8b5c2d] bg-[linear-gradient(180deg,#302016_0%,#1d120c_100%)] px-3 py-3 shadow-lg sm:px-6">
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {[
                  [null, "🏆", "Trophies"],
                  ["records", "📖", "Records"],
                  ["passport", "🛂", "Passport"],
                  ["memories", "📸", "Memories"],
                ].map(([panel, icon, label]) => {
                  const selected = trophyRoomPanel === panel;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTrophyRoomPanel(panel as null | "records" | "passport" | "memories")}
                      className={`min-w-0 rounded-xl border px-1 py-2.5 text-[9px] font-black uppercase tracking-tight transition sm:px-3 sm:text-[10px] sm:tracking-wide ${
                        selected
                          ? "border-[#f3c64f] bg-[#f3c64f] text-[#33200f]"
                          : "border-[#9a6a38] bg-[#321e12] text-[#f7ead8] hover:border-[#d5a43d]"
                      }`}
                    >
                      <span className="mr-0.5 sm:mr-1.5">{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {trophyRoomPanel === null && (
              <div className="bg-[radial-gradient(circle_at_50%_0%,#694522_0%,#342116_46%,#1d120c_100%)] px-3 py-5 sm:px-6 sm:py-7">
                <div>
                  <div>
                    <div className="space-y-4">
                      {[
                        {
                          label: "Challenge Trophies",
                          trophies: [
                          { icon: "🏆", title: "Weekly Champ", note: "Finish a weekly FamBam Challenge in first place", repeatable: true, earned: (myRecordAchievements?.weeklyWins ?? 0) > 0, progress: `${myRecordAchievements?.weeklyWins ?? 0} weekly win${(myRecordAchievements?.weeklyWins ?? 0)===1?'':'s'}`, milestone: "5 wins unlocks Challenge Champion" },
                          { icon: "🎯", title: "Pick Master", note: "Complete every pick on a full challenge card", repeatable: true, earned: (myRecordAchievements?.fullCards ?? 0) > 0, progress: `${myRecordAchievements?.fullCards ?? 0} full card${(myRecordAchievements?.fullCards ?? 0)===1?'':'s'}`, milestone: "Complete 5 full cards for the next tier" },
                          {
                            icon: "🔥",
                            title: "Hot Streak",
                            note: "Build a streak of correct picks",
                            earned: currentChallengeProgress >= 5,
                            progress: `${currentChallengeProgress}/${currentChallengeProgress < 5 ? 5 : 10}`,
                            milestone:
                              currentChallengeProgress < 5
                                ? "Reach 5 correct picks"
                                : currentChallengeProgress < 10
                                  ? "Reach 10 correct picks"
                                  : "25 correct picks is the next streak tier",
                          },
                          { icon: "💯", title: "Perfect 10", note: "Go 10-for-10 without a miss in one challenge", earned: (myRecordAchievements?.perfectTens ?? 0) > 0, progress: (myRecordAchievements?.perfectTens ?? 0)>0?`${myRecordAchievements?.perfectTens} perfect card${myRecordAchievements?.perfectTens===1?'':'s'}`:`${perfectTenProgress}/10`, milestone: "Repeat it and the trophy count increases" },
                          { icon: "🏆🏆", title: "Back-to-Back", note: "Win two weekly FamBam Challenges in a row", earned: myRecordAchievements?.backToBack === true, progress: myRecordAchievements?.backToBack?"Earned ✓":"Win 2 in a row", milestone: "Two consecutive Challenge wins" },
                          { icon: "🧹", title: "Family Sweep", note: "Have the whole family make the same winning pick", progress: "Complete a family sweep", milestone: "Everyone agrees and everyone is correct" },
                          ],
                        },
                        {
                          label: "Event Trophies",
                          trophies: [
                            {
                              icon: "🎟️",
                              title: "Event Explorer",
                              note: "Make your first optional special-event pick",
                              earned: Object.values(eventProgress).some((progress) => progress.trophies.firstEventPick),
                              progress: Object.values(eventProgress).some((progress) => progress.trophies.firstEventPick) ? "Earned ✓" : "Make your first event pick",
                              milestone: "Special events are optional and never affect weekly records",
                            },
                            {
                              icon: "🎓",
                              title: "Cup Expert",
                              note: "Correctly pick three results in one special event",
                              earned: Object.values(eventProgress).some((progress) => progress.trophies.cupExpert),
                              progress: `${Math.max(0, ...Object.values(eventProgress).map((progress) => progress.correct))}/3 correct`,
                              milestone: "Three correct picks in the same event",
                            },
                            {
                              icon: "✨",
                              title: "Perfect Round",
                              note: "Get every pick right in an event round with at least three games",
                              earned: Object.values(eventProgress).some((progress) => progress.trophies.perfectRound),
                              progress: Object.values(eventProgress).some((progress) => progress.trophies.perfectRound) ? "Earned ✓" : "Complete a perfect event round",
                              milestone: "At least three correct with no misses",
                            },
                            {
                              icon: "🪄",
                              title: "Giant Killer",
                              note: "Correctly call a major cup upset",
                              progress: "Upset tracking begins with graded cup games",
                              milestone: "Pick a lower-level club to eliminate a favorite",
                            },
                            {
                              icon: "🥇",
                              title: "Round Champion",
                              note: "Post the best score in one special-event round",
                              progress: "Awarded after a round is complete",
                              milestone: "Highest round score; ties share the honor",
                            },
                            {
                              icon: "👑",
                              title: "Event Champion",
                              note: "Finish first when a full special event ends",
                              progress: "Awarded at the event final",
                              milestone: "FA Cup, Carabao Cup, March Madness and more",
                            },
                          ],
                        },
                        {
                          label: "Fan Trophies",
                          trophies: [
                          { icon: "⚽", title: "Soccer Supporter", note: "Follow your first soccer club", earned: hasTrophyTeam("soccer"), progress: hasTrophyTeam("soccer") ? "Earned ✓" : "Choose a soccer team", milestone: "Your first followed soccer club" },
                          { icon: "🏈", title: "CFB Fan", note: "Follow your first college football team", earned: hasTrophyTeam("college-football"), progress: hasTrophyTeam("college-football") ? "Earned ✓" : "Choose a CFB team", milestone: "Your first followed college football team" },
                          { icon: "🏒", title: "Hockey Fan", note: "Follow your first hockey team", earned: hasTrophyTeam("hockey"), progress: hasTrophyTeam("hockey") ? "Earned ✓" : "Choose a hockey team", milestone: "Your first followed hockey team" },
                          { icon: "⚾", title: "Baseball Fan", note: "Follow your first baseball team", earned: hasTrophyTeam("baseball"), progress: hasTrophyTeam("baseball") ? "Earned ✓" : "Choose a baseball team", milestone: "Your first followed baseball team" },
                          { icon: "🏀", title: "Basketball Fan", note: "Follow your first college basketball team", earned: hasTrophyTeam("college-basketball"), progress: hasTrophyTeam("college-basketball") ? "Earned ✓" : "Choose a basketball team", milestone: "Your first followed college basketball team" },
                          { icon: "🏐", title: "Volleyball Fan", note: "Follow your first volleyball team", earned: hasTrophyTeam("volleyball"), progress: hasTrophyTeam("volleyball") ? "Earned ✓" : "Choose a volleyball team", milestone: "Your first followed volleyball team" },
                          ],
                        },
                        {
                          label: null,
                          trophies: [
                            { icon: "🌟", title: "All-Sport Fan", note: "Follow teams in four different sports", earned: followedTrophySportsCount >= 4, progress: `${followedTrophySportsCount}/4 sports`, milestone: "Build a four-sport Locker Room" },
                            { icon: "💙", title: "Big Blue Nation", note: "Follow Kentucky teams in multiple sports", earned: kentuckyTrophySports.size >= 2, progress: `${kentuckyTrophySports.size}/2 UK sports`, milestone: "Follow Kentucky in two sports" },
                            { icon: "🛡️", title: "Club Loyalist", note: "Choose a primary favorite team in your Locker Room", earned: hasPrimaryFavorite, progress: hasPrimaryFavorite ? "Earned ✓" : "Choose a primary team", milestone: "Make one followed team your primary favorite" },
                            { icon: "⚔️", title: "Rivalry Ready", note: "Make a pick in a recognized rivalry game", progress: "Make a rivalry pick", milestone: "Rivalry picks will be tracked from graded Challenges" },
                            { icon: "🎟️", title: "Team Collector", note: "Follow five teams across your Locker Room", earned: signedInLockerTeams.length >= 5, progress: `${signedInLockerTeams.length}/5 teams`, milestone: "Follow five favorite teams" },
                            { icon: "🏅", title: "Multi-Sport MVP", note: "Follow teams in six different sports", earned: followedTrophySportsCount >= 6, progress: `${followedTrophySportsCount}/6 sports`, milestone: "Build a six-sport Locker Room" },
                          ],
                        },
                        {
                          label: null,
                          trophies: [
                            { icon: "🪄", title: "Cup Magic", note: "Correctly pick a cup or tournament match", progress: "0/1 tracked", milestone: "Win a graded cup or tournament pick" },
                            { icon: "⚽", title: "Goal Getter", note: "Correctly predict five soccer winners", progress: "0/5 tracked", milestone: "Five graded soccer picks" },
                            { icon: "🏈", title: "Gridiron Guru", note: "Correctly predict five college football winners", progress: "0/5 tracked", milestone: "Five graded college football picks" },
                            { icon: "🏒", title: "Ice Expert", note: "Correctly predict five hockey winners", progress: "0/5 tracked", milestone: "Five graded hockey picks" },
                            { icon: "⚾", title: "Diamond Expert", note: "Correctly predict five baseball winners", progress: "0/5 tracked", milestone: "Five graded baseball picks" },
                            { icon: "🏐", title: "Volley Vision", note: "Correctly predict five volleyball winners", progress: "0/5 tracked", milestone: "Five graded volleyball picks" },
                          ],
                        },
                        {
                          label: "Passport & Memory Trophies",
                          trophies: [
                          { icon: "🌎", title: "Traveler", note: "Visit your first state and keep exploring", earned: new Set([...visitedStates, ...passportVisitEntries.map(e=>e.state).filter(Boolean)]).size > 0, progress: new Set([...visitedStates, ...passportVisitEntries.map(e=>e.state).filter(Boolean)]).size > 0 ? `${new Set([...visitedStates, ...passportVisitEntries.map(e=>e.state).filter(Boolean)]).size} state${new Set([...visitedStates, ...passportVisitEntries.map(e=>e.state).filter(Boolean)]).size===1?"":"s"} · Earned ✓` : "0/1 states", milestone: "1 → 5 → 10 → 25 → 50 states" },
                          { icon: "🏟️", title: "Stadium Hopper", note: "Attend a game at your first sports venue", earned: new Set(passportVisitEntries.map(e=>e.venue).filter(Boolean)).size > 0, repeatable: true, progress: `${new Set(passportVisitEntries.map(e=>e.venue).filter(Boolean)).size} venue${new Set(passportVisitEntries.map(e=>e.venue).filter(Boolean)).size===1?"":"s"}`, milestone: "1 → 5 → 10 → 25 stadiums" },
                          { icon: "👑", title: "FamBam Legend", note: "Reach major FamBam milestones across Challenges, Passport and Memories", progress: "Multi-category", milestone: "Built from real accomplishments across the app" },
                          { icon: "❤️", title: "FamBam Forever", note: "Build shared family sports memories together", repeatable: true, earned: savedMemoryCount > 0, progress: `${savedMemoryCount} memor${savedMemoryCount === 1 ? "y" : "ies"}`, milestone: "5 → 10 → 25 shared memories" },
                          { icon: "🛂", title: "First Stamp", note: "Record your first attended game in the Sports Passport", earned: passportVisitEntries.length > 0, progress: passportVisitEntries.length > 0 ? "Earned ✓" : "Add your first game", milestone: "Your first Sports Passport entry" },
                          { icon: "📸", title: "Memory Maker", note: "Save five stories from FamBam sports moments", earned: savedMemoryCount >= 5, progress: `${savedMemoryCount}/5 memories`, milestone: "Five saved sports memories" },
                          ],
                        },
                      ].map((shelf, shelfIndex) => (
                        <div key={shelfIndex}>
                          {shelf.label && (
                            <div className="mb-2 mt-6 flex items-center gap-3 first:mt-0">
                              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f3c64f] sm:text-xs">{shelf.label}</div>
                              <div className="h-px flex-1 bg-[#8f6336]" />
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                            {shelf.trophies.map((trophy) => (
                              <button
                                key={trophy.title}
                                type="button"
                                title={`${trophy.title}: ${trophy.note}`}
                                onClick={() => setSelectedTrophy(trophy)}
                                className="group relative aspect-square min-w-0 overflow-hidden rounded-t-lg border border-[#9b6a3b] border-b-0 bg-[#21140c] text-center shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_8px_16px_rgba(0,0,0,.35)]"
                              >
                                <img
                                  src="/trophy-bay-realistic.webp"
                                  alt=""
                                  aria-hidden="true"
                                  className={`absolute inset-0 h-full w-full object-cover object-top transition ${"earned" in trophy && trophy.earned ? "brightness-110 saturate-110" : "brightness-[.28] saturate-[.35]"}`}
                                />
                                {"earned" in trophy && trophy.earned ? (
                                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,rgba(255,218,137,.20)_0%,rgba(255,190,82,.08)_34%,transparent_60%),linear-gradient(180deg,rgba(8,5,3,0)_0%,rgba(8,5,3,.02)_52%,rgba(8,5,3,.82)_100%)]" />
                                ) : (
                                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,3,2,.68)_0%,rgba(7,4,3,.52)_52%,rgba(8,5,3,.88)_100%)]" />
                                )}
                                <div className={`absolute right-1.5 top-1.5 z-20 rounded-full px-1.5 py-0.5 text-[10px] font-black ${"earned" in trophy && trophy.earned ? "bg-[#f3c64f] text-[#33200f]" : "bg-black/55 text-white"}`}>{"earned" in trophy && trophy.earned ? "✓" : "🔒"}</div>
                                {"repeatable" in trophy && trophy.repeatable && (
                                  <div className="absolute left-1.5 top-1.5 z-20 rounded-full border border-[#a47a42] bg-[#21150d]/90 px-1.5 py-0.5 text-[8px] font-black uppercase text-[#f3c64f]">Repeat</div>
                                )}
                                <div className={`absolute inset-x-0 top-[24%] z-10 flex justify-center text-3xl transition sm:text-4xl ${"earned" in trophy && trophy.earned ? "drop-shadow-[0_8px_12px_rgba(0,0,0,.75)]" : "grayscale opacity-30 group-hover:opacity-45"}`}>
                                  {trophy.icon}
                                </div>
                                <div className="absolute inset-x-1 bottom-9 z-10 line-clamp-2 text-[9px] font-black uppercase leading-tight tracking-wide text-[#fff2dc] sm:bottom-10 sm:text-[10px]">
                                  {trophy.title}
                                </div>
                                <div className="absolute inset-x-1.5 bottom-1.5 z-10 truncate rounded-full border border-[#8a6035]/70 bg-black/65 px-1 py-1.5 text-[8px] font-black text-[#f2cf70] sm:inset-x-2 sm:text-[9px]">
                                  {trophy.progress}
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="h-3 rounded-sm border border-[#9a6a3b] bg-[linear-gradient(180deg,#8b5a31_0%,#5a361e_55%,#3b2214_100%)] shadow-[0_8px_10px_rgba(0,0,0,.45)]" />
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </div>
            )}

            {trophyRoomPanel === "records" && (
              <div className="bg-[#eef1f4] px-3 py-5 sm:px-6 sm:py-7">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[#102b49] shadow-lg sm:p-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#06284a]">⭐ Personal Records</div>
                    <div className="mt-1 text-2xl font-black text-[#10254a]">{signedInPlayer?.display_name ?? "My"}'s Record Book</div>
                    {signedInPlayer && recordBookRows.length > 0 && (() => {
                      const me = recordBookRows.find((row) => row.player_id === signedInPlayer.id);
                      if (!me) return <div className="mt-3 text-xs font-semibold text-[#c3ad90]">No scored Challenge records yet.</div>;
                      return (
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          {[
                            [me.points, "All-Time Points"],
                            [me.correct, "Correct"],
                            [me.completed_picks > 0 ? `${Math.round(me.accuracy)}%` : "—", "Accuracy"],
                          ].map(([value, label]) => (
                            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                              <div className="text-2xl font-black text-[#06284a]">{value}</div>
                              <div className="mt-1 text-[9px] font-black uppercase text-[#846f59]">{label}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {signedInPlayer && (() => {
                      const me = recordBookRows.find((row) => row.player_id === signedInPlayer.id);
                      const stats = recordBookAchievements[signedInPlayer.id];
                      const records = [
                        ["Best Week", stats?.bestWeekCorrect ? `${stats.bestWeekCorrect} correct` : "Not yet"],
                        ["Longest Win Streak", stats?.maxWinStreak ? `${stats.maxWinStreak} week${stats.maxWinStreak === 1 ? "" : "s"}` : "0 weeks"],
                        ["Best Accuracy", stats?.bestWeekAccuracy ? `${Math.round(stats.bestWeekAccuracy)}%` : "Not yet"],
                        ["Biggest Upset Pick", "Not tracked yet"],
                        ["Most Correct Picks", me ? String(me.correct) : "0"],
                        ["Challenge Wins", String(stats?.weeklyWins ?? 0)],
                      ];

                      return (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {records.map(([record, value]) => (
                            <div key={record} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-600">
                              <span>{record}</span>
                              <span className="shrink-0 text-right font-black text-[#846f59]">{value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[#102b49] shadow-lg sm:p-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#06284a]">👑 FamBam Records</div>
                    <div className="mt-1 text-2xl font-black text-[#10254a]">Family Record Book</div>
                    {recordBookRows.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {[...recordBookRows]
                          .sort((a, b) => b.points !== a.points ? b.points - a.points : b.correct - a.correct)
                          .map((row, index) => (
                            <div key={row.player_id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${index === 0 ? "border-[#f3c64f] bg-[#fffaf0]" : "border-slate-200 bg-slate-50"}`}>
                              <div className="w-7 text-center text-lg">{index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-sm font-black text-[#10254a]"><span className="truncate">{row.display_name}</span>{(recordBookAchievements[row.player_id]?.weeklyWins??0)>0&&<span className="shrink-0 text-[10px] text-[#9c6c16]">🏆 ×{recordBookAchievements[row.player_id].weeklyWins}</span>}</div>
                                <div className="text-[10px] font-semibold text-slate-500">{row.correct} correct · {row.completed_picks}/{row.total_picks} scored</div>
                              </div>
                              <div className="text-lg font-black text-[#06284a]">{row.points}</div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs font-semibold text-[#c3ad90]">The record book will fill as Challenges are scored.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {trophyRoomPanel === "passport" && (
              <div className="bg-[#eef1f4] px-3 py-5 sm:px-6 sm:py-7">
                <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-[#10254a] shadow-sm">
                  <div className="bg-[#06284a] p-5 text-white sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div><div className="text-[9px] font-black uppercase tracking-[0.28em] text-[#f3c64f]">FamBam United States of Sports</div><div className="mt-1 text-2xl font-black">{signedInPlayer?.display_name ?? "My"}'s Passport</div><div className="mt-1 text-[10px] font-semibold text-[#c9d5df]">Games · Tours · Stadiums · States · Memories</div></div>
                      <button type="button" onClick={openPassportAdd} className="rounded-full bg-[#f3c64f] px-5 py-2.5 text-[9px] font-black uppercase tracking-wide text-[#06284a] shadow">+ Add Visit</button>
                    </div>
                  </div>
                  <div className="border-b border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {([['year','📅 By Year'],['venue','🏟️ Stadiums'],['states','🗺️ States Map']] as const).map(([key,label]) => <button key={key} type="button" onClick={() => setPassportView(key)} className={`rounded-full px-4 py-2 text-[8px] font-black uppercase ${passportView===key?'bg-[#06284a] text-white':'border border-slate-200 bg-slate-50 text-[#06284a]'}`}>{label}</button>)}
                    </div>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="mb-5 grid grid-cols-3 gap-2">
                      {[[passportVisitEntries.length,'Visits'],[new Set(passportVisitEntries.map(x=>x.venue)).size,'Stadiums'],[new Set([...visitedStates,...passportVisitEntries.map(x=>x.state).filter(Boolean)]).size,'States']].map(([v,l])=><div key={String(l)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center"><div className="text-2xl font-black">{v}</div><div className="text-[8px] font-black uppercase text-slate-500">{l}</div></div>)}
                    </div>
                    {passportView === 'year' && (
                      <div className="space-y-5">
                        {passportVisitEntries.length === 0 ? (
                          <div className="rounded-xl border-2 border-dashed border-[#b99d68] p-8 text-center">
                            <div className="text-5xl">🛂</div>
                            <div className="mt-3 font-black">Your first stamp is waiting.</div>
                            <button onClick={openPassportAdd} className="mt-4 rounded-full bg-[#77511f] px-4 py-2 text-[9px] font-black uppercase text-white">+ Add Visit</button>
                          </div>
                        ) : Object.entries(passportVisitEntries.reduce<Record<string,PassportEntry[]>>((grouped, entry) => {
                          const year = entry.date.slice(0, 4) || 'Undated';
                          (grouped[year] ??= []).push(entry);
                          return grouped;
                        }, {})).sort(([a], [b]) => b.localeCompare(a)).map(([year, entries]) => (
                          <div key={year}>
                            <div className="mb-3 text-xl font-black">{year}</div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {entries.map((entry) => {
                                const canAddPhoto = Boolean(signedInPlayer && entry.attendeeIds.includes(signedInPlayer.id));
                                const canEdit = Boolean(signedInPlayer && (entry.createdByPlayerId === signedInPlayer.id || signedInPlayer.is_admin));
                                return (
                                  <div key={entry.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="absolute right-3 top-3 rotate-[-10deg] rounded-full border-4 border-double border-[#a35b48] px-3 py-2 text-[8px] font-black uppercase text-[#a35b48] opacity-75">{entry.sport==='Tour'?'🎟️':entry.sport==='MLB'?'⚾':'🏈'}<br/>VISITED</div>
                                    <div className="text-[8px] font-black uppercase tracking-widest text-[#06284a]">{entry.date} · {entry.sport==='Tour'?'Tour':entry.result||'Attended'}</div>
                                    <div className="mt-2 pr-20 text-base font-black">{passportEntryTitle(entry)}</div>
                                    <div className="mt-1 text-xs font-bold">{entry.awayScore||entry.homeScore?`${entry.awayScore||'–'} – ${entry.homeScore||'–'}`:''}</div>
                                    <div className="mt-3 text-[10px] font-semibold">🏟️ {entry.venue}{entry.city?` · ${entry.city}, ${entry.state}`:` · ${entry.state}`}</div>
                                    {entry.attendeeNames.length>0&&<div className="mt-1 text-[10px]">👨‍👩‍👧‍👦 {entry.attendeeNames.join(" · ")}</div>}
                                    {entry.memories.length>0&&<div className="mt-2 space-y-1 border-t border-[#d7c39b] pt-2">{entry.memories.map(memory=><div key={memory.playerId} className="text-[10px] italic"><span className="font-black not-italic">{memory.playerName}:</span> “{memory.note}”</div>)}</div>}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {canAddPhoto && <label className="flex min-h-10 cursor-pointer items-center rounded-full bg-[#f3c64f] px-3 text-[8px] font-black uppercase text-[#33200f]">{passportPhotoUploadingId===entry.id?'Uploading…':'+ Add Picture'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={passportPhotoUploadingId===entry.id} className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)beginPhotoCrop(file,"passport",entry.id);event.currentTarget.value=''}}/></label>}
                                      {canEdit && <button type="button" onClick={()=>openPassportEdit(entry)} className="min-h-10 rounded-full border border-[#77511f] bg-[#fff7e6] px-3 text-[8px] font-black uppercase text-[#77511f]">✏️ Edit Entry</button>}
                                      {canAddPhoto && <button type="button" onClick={()=>{setPassportMemoryEvent(entry);setPassportMemoryNote(entry.memories.find(memory=>memory.playerId===signedInPlayer?.id)?.note||"")}} className="min-h-10 rounded-full border border-[#b99d68] bg-white px-3 text-[8px] font-black uppercase text-[#77511f]">{entry.memories.some(memory=>memory.playerId===signedInPlayer?.id)?"Edit Memory":"+ Memory"}</button>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {passportView === 'venue' && <div><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-widest text-[#06284a]">Stadium Collection</div><div className="text-xl font-black">All Your Stadiums</div></div><div className="flex flex-wrap gap-2">{(["All","Football","MLB"] as const).map(f=><button key={f} type="button" onClick={()=>setStadiumSportFilter(f)} className={`rounded-full px-3 py-2 text-[8px] font-black uppercase ${stadiumSportFilter===f?'bg-[#77511f] text-white':'border border-[#b99d68] bg-[#f7ebcd] text-[#77511f]'}`}>{f==='Football'?'🏈 Football':f==='MLB'?'⚾ MLB':'All'}</button>)}</div></div>{passportVisitEntries.length===0?<div className="rounded-xl border-2 border-dashed border-[#b99d68] p-8 text-center text-sm font-bold">Add a game/match to start your stadium collection.</div>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(passportVisitEntries.filter(e=>stadiumSportFilter==='All'||e.sport===stadiumSportFilter).reduce<Record<string,PassportEntry[]>>((a,e)=>{(a[e.venue]??=[]).push(e);return a;},{})).map(([venue,entries])=><div key={venue} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-4xl">🏟️</div><div className="mt-2 text-lg font-black">{venue}</div><div className="text-[9px] font-bold text-slate-500">{entries[0].city}{entries[0].city?', ':''}{entries[0].state}</div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#77511f] px-2 py-1 text-[8px] font-black text-white">{entries.length} VISIT{entries.length===1?'':'S'}</span><span className="rounded-full border border-[#b99d68] px-2 py-1 text-[8px] font-black">{[...new Set(entries.map(e=>e.sport))].join(' · ')}</span></div><div className="mt-3 space-y-1 border-t border-[#d7c39b] pt-2">{entries.sort((a,b)=>b.date.localeCompare(a.date)).map(e=><div key={e.id} className="text-[9px] font-semibold">{e.date} · {e.away} at {e.home}</div>)}</div></div>)}</div>}</div>}
                    {passportView === 'states' && <div><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-widest text-[#06284a]">States I've Been To</div><div className="text-xl font-black">Tap any state you've visited</div></div><div className="text-[9px] font-bold text-slate-500">★ = sports visit</div></div><div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10">{US_STATES.map(code=>{const sports=passportVisitEntries.some(e=>e.state===code);const visited=visitedStates.includes(code);return <button key={code} title={STATE_NAMES[code]} onClick={()=>toggleVisitedState(code)} className={`relative aspect-[1.15] rounded-lg border text-[9px] font-black transition ${sports?'border-[#9c6c16] bg-[#e4c36b] text-[#33220d]':visited?'border-[#557492] bg-[#b9cbd9] text-[#102b49]':'border-[#cbb98f] bg-[#f7edda] text-[#9b8a68]'}`}>{code}{sports&&<span className="absolute right-0.5 top-0 text-[7px]">★</span>}</button>})}</div><div className="mt-4 rounded-lg border border-[#ccb582] bg-[#f8eccd] p-3 text-[9px] font-semibold">Regular travel counts too. Sports entries automatically mark their state, while you can tap any other state you've visited in general.</div></div>}
                  </div>
                </div>
                {passportAddOpen && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-3"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[1.5rem] bg-[#f6e8c8] p-4 text-[#3d2b17] shadow-2xl sm:p-5"><div className="flex items-center justify-between gap-3"><div><div className="text-[8px] font-black uppercase tracking-widest text-[#06284a]">New Passport Stamp</div><div className="text-xl font-black">Add Game/Match</div></div><button type="button" onClick={()=>setPassportAddOpen(false)} className="min-h-11 min-w-11 rounded-full bg-[#e4d3ad] px-3 font-black">✕</button></div>
                  <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setPassportAddMode('search')} className={`min-h-11 rounded-xl text-xs font-black ${passportAddMode==='search'?'bg-[#102b49] text-white':'border border-[#c7aa70] bg-[#fff7e6]'}`}>🔎 Find a Game</button><button type="button" onClick={()=>setPassportAddMode('manual')} className={`min-h-11 rounded-xl text-xs font-black ${passportAddMode==='manual'?'bg-[#102b49] text-white':'border border-[#c7aa70] bg-[#fff7e6]'}`}>✏️ Enter Manually</button></div>
                  <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setPassportDraft({...passportDraft,visitType:'game',sport:passportDraft.sport==='Tour'?'Football':passportDraft.sport})} className={`min-h-11 rounded-xl text-xs font-black ${passportDraft.visitType!=='tour'?'bg-[#77511f] text-white':'border border-[#c7aa70] bg-[#fff7e6]'}`}>🏟️ Game / Match</button><button type="button" onClick={()=>{setPassportDraft({...passportDraft,visitType:'tour',sport:'Tour',away:'',home:'',awayScore:'',homeScore:'',result:''});setPassportAddMode('manual');setPassportGameSearch('')}} className={`min-h-11 rounded-xl text-xs font-black ${passportDraft.visitType==='tour'?'bg-[#77511f] text-white':'border border-[#c7aa70] bg-[#fff7e6]'}`}>🎟️ Stadium Tour</button></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">{passportDraft.visitType!=='tour'&&<label className="text-[9px] font-black">SPORT<select value={passportDraft.sport} onChange={e=>{setPassportDraft({...passportDraft,sport:e.target.value as 'Football'|'MLB',gameId:undefined});setPassportGameSearch('')}} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"><option>Football</option><option>MLB</option></select></label>}<label className="text-[9px] font-black">DATE<input type="date" value={passportDraft.date} onChange={e=>setPassportDraft({...passportDraft,date:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"/></label></div>
                  {passportDraft.visitType!=='tour'&&passportAddMode==='search'&&<div className="mt-3"><label className="text-[9px] font-black">SEARCH TEAM / GAME<input value={passportGameSearch} onChange={e=>setPassportGameSearch(e.target.value)} placeholder={passportDraft.sport==='MLB'?'Braves, Dodgers...':'Kentucky, Georgia...'} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"/></label>{passportGameSearch.trim()&&<div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[#c7aa70] bg-white p-2">{passportSearchResults.length?passportSearchResults.map(g=><button key={g.id} type="button" onClick={()=>choosePassportGame(g)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-[#f7edda]"><div className="text-xs font-black">{g.away} at {g.home}</div><div className="text-[9px] text-slate-500">{formatGameDate(g.startsAt)} · {g.competition}{g.homeScore!=null||g.awayScore!=null?` · ${g.awayScore??'–'}-${g.homeScore??'–'}`:''}</div></button>):<div className="p-3 text-xs font-bold text-slate-500">No matching FamBam game loaded. Use Enter Manually for older games.</div>}</div>}</div>}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">{(passportDraft.visitType==='tour'?[['venue','Stadium / venue'],['city','City']]:[['away','Away team'],['home','Home team'],['venue','Stadium / venue'],['city','City']]).map(([k,l])=><label key={k} className="text-[9px] font-black uppercase">{l}<input value={(passportDraft as any)[k]} onChange={e=>setPassportDraft({...passportDraft,[k]:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base normal-case sm:text-sm"/></label>)}<label className="text-[9px] font-black">STATE<select value={passportDraft.state} onChange={e=>setPassportDraft({...passportDraft,state:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"><option value="">Choose state</option>{US_STATES.map(c=><option key={c} value={c}>{STATE_NAMES[c]}</option>)}</select></label>{passportDraft.visitType!=='tour'&&<><label className="text-[9px] font-black">RESULT<select value={passportDraft.result} onChange={e=>setPassportDraft({...passportDraft,result:e.target.value as any})} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"><option value="" disabled>Choose result</option><option value="W">Win</option><option value="L">Loss</option><option value="T">Tie</option></select></label><label className="text-[9px] font-black">AWAY SCORE<input inputMode="numeric" value={passportDraft.awayScore} onChange={e=>setPassportDraft({...passportDraft,awayScore:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"/></label><label className="text-[9px] font-black">HOME SCORE<input inputMode="numeric" value={passportDraft.homeScore} onChange={e=>setPassportDraft({...passportDraft,homeScore:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base sm:text-sm"/></label></>}</div>
                  <div className="mt-4"><div className="text-[9px] font-black uppercase">Who Went?</div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{players.map(p=><label key={p.id} className={`flex min-h-11 items-center gap-2 rounded-xl border p-2 text-xs font-black ${passportAttendeeIds.includes(p.id)?'border-[#77511f] bg-[#f0d99f]':'border-[#c7aa70] bg-[#fff7e6]'}`}><input type="checkbox" checked={passportAttendeeIds.includes(p.id)} onChange={()=>setPassportAttendeeIds(ids=>ids.includes(p.id)?ids.filter(id=>id!==p.id):[...ids,p.id])} disabled={p.id===signedInPlayer?.id}/>{p.display_name}</label>)}</div></div>
                  <label className="mt-4 block text-[9px] font-black">MY MEMORY / NOTE<textarea value={passportMyNote} onChange={e=>setPassportMyNote(e.target.value)} placeholder="What do you remember about this one?" className="mt-1 min-h-24 w-full rounded-lg border border-[#c7aa70] bg-white p-3 text-base sm:text-sm"/></label>{passportError&&<div className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">{passportError}</div>}<button type="button" disabled={passportSaving} onClick={savePassportEntry} className="mt-5 min-h-12 w-full rounded-xl bg-[#102b49] py-3 text-sm font-black text-white disabled:opacity-50">{passportSaving?'Saving…':'Save Shared Stamp 🛂'}</button></div></div>}
                {passportMemoryEvent&&<div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/70 p-3"><div className="w-full max-w-md rounded-[1.5rem] bg-[#f6e8c8] p-5 text-[#3d2b17] shadow-2xl"><div className="flex items-start justify-between gap-3"><div><div className="text-[8px] font-black uppercase tracking-widest text-[#06284a]">{passportEntryTitle(passportMemoryEvent)}</div><div className="text-xl font-black">{passportMemoryEvent.memories.some(m=>m.playerId===signedInPlayer?.id)?'Edit My Memory':'Add My Memory'}</div></div><button type="button" onClick={()=>setPassportMemoryEvent(null)} className="min-h-11 min-w-11 rounded-full bg-[#e4d3ad] font-black">✕</button></div><textarea value={passportMemoryNote} onChange={e=>setPassportMemoryNote(e.target.value)} placeholder="Your own memory from this visit..." className="mt-4 min-h-32 w-full rounded-xl border border-[#c7aa70] bg-white p-3 text-base"/><button type="button" disabled={passportSaving} onClick={savePassportMemory} className="mt-4 min-h-12 w-full rounded-xl bg-[#102b49] text-sm font-black text-white disabled:opacity-50">{passportSaving?'Saving…':'Save My Memory'}</button></div></div>}
              </div>
            )}

            {trophyRoomPanel === "memories" && (
              <div className="bg-[#eef1f4] px-3 py-5 sm:px-6 sm:py-7">
                <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 text-[#102b49] shadow-xl sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><div className="flex items-center gap-3"><div className="text-4xl">📸</div><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#06284a]">FamBam Memory Book</div><div className="text-xl font-black text-[#10254a]">{signedInPlayer?.display_name ?? 'My'}'s family memories</div></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={openFamilyEventAdd} className="min-h-11 rounded-full bg-[#f3c64f] px-4 py-2 text-[9px] font-black uppercase tracking-wide text-[#33200f]">+ Family Event</button><button type="button" onClick={openPassportAddFromMemories} className="min-h-11 rounded-full border border-[#b99d68] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-wide text-[#77511f]">+ Sports Visit</button></div></div>
                  <div className="mt-5 space-y-3">
                    {passportEntries.length===0 ? (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">Your first shared sports memory is waiting.</div>
                    ) : passportEntries.map((e) => {
                      return (
                        <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start gap-3">
                            <div className="text-3xl">{e.entryType==='family'?familyEventIcon(e.familyCategory):e.sport==='Tour'?'🎟️':e.sport==='MLB'?'⚾':'🏈'}</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[#06284a]">{e.date} · {e.entryType==='family'?e.familyCategory:e.venue}{e.entryType==='family'&&e.familyMilestone?` · ${e.familyMilestone}`:''}</div>
                              <div className="mt-1 text-base font-black text-[#10254a]">{passportEntryTitle(e)}</div>
                              {e.entryType==='family'&&e.venue!=='Family Event'&&<div className="mt-1 text-[9px] font-semibold text-slate-500">📍 {e.venue}</div>}
                              <div className="mt-1 text-[9px] font-semibold text-slate-500">With {e.attendeeNames.join(' · ')}</div>
                              {e.memories.length>0&&<div className="mt-3 space-y-2">{e.memories.map(m=><div key={m.playerId} className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] text-slate-600"><span className="font-black text-[#06284a]">{m.playerName}:</span> {m.note}</div>)}</div>}
                            </div>
                          </div>
                          {e.photos.length > 0 && (
                            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4 sm:grid-cols-3">
                              {e.photos.map((photo, index) => {
                                const fileName = decodeURIComponent(photo.split("?")[0].split("/").pop() ?? "");
                                const canDeletePhoto = Boolean(signedInPlayer && (signedInPlayer.is_admin || fileName.startsWith(`${signedInPlayer.id}-`)));
                                return (
                                  <button
                                    key={photo}
                                    type="button"
                                    onClick={()=>setPassportPhotoViewer({eventId:e.id,url:photo,title:`${passportEntryTitle(e)} photo ${index+1}`,canDelete:canDeletePhoto})}
                                    className="block overflow-hidden rounded-xl bg-slate-100 transition active:scale-[0.98]"
                                    aria-label={`Open ${passportEntryTitle(e)} photo ${index+1}`}
                                  >
                                    <img src={photo} alt={`${passportEntryTitle(e)} photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {familyEventOpen && (
                  <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/75 p-3">
                    <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#f6e8c8] p-5 text-[#3d2b17] shadow-2xl">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="text-[8px] font-black uppercase tracking-widest text-[#06284a]">FamBam Memory Book</div><div className="text-xl font-black">Add Family Event</div></div>
                        <button type="button" onClick={()=>setFamilyEventOpen(false)} className="min-h-11 min-w-11 rounded-full bg-[#e4d3ad] font-black">✕</button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-[9px] font-black uppercase">Date<input type="date" value={familyEventDraft.date} onChange={e=>setFamilyEventDraft(d=>({...d,date:e.target.value}))} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base" /></label>
                        <label className="text-[9px] font-black uppercase">Type<select value={familyEventDraft.category} onChange={e=>setFamilyEventDraft(d=>({...d,category:e.target.value}))} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base"><option>Volleyball</option><option>Cheer</option><option>Chorus</option><option>Theater</option><option>School</option><option>Other</option></select></label>
                        <label className="text-[9px] font-black uppercase sm:col-span-2">Event Title<input value={familyEventDraft.title} onChange={e=>setFamilyEventDraft(d=>({...d,title:e.target.value}))} placeholder="Lydia's first volleyball game" className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base" /></label>
                        <label className="text-[9px] font-black uppercase">Milestone<select value={familyEventDraft.milestone} onChange={e=>setFamilyEventDraft(d=>({...d,milestone:e.target.value}))} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base"><option value="">Regular Event</option><option>First Game</option><option>First Performance</option><option>Tournament</option><option>Championship</option><option>Final Event</option><option>Special Milestone</option></select></label>
                        <label className="text-[9px] font-black uppercase">Location (optional)<input value={familyEventDraft.location} onChange={e=>setFamilyEventDraft(d=>({...d,location:e.target.value}))} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7aa70] bg-white p-2.5 text-base" /></label>
                      </div>
                      <div className="mt-4"><div className="text-[9px] font-black uppercase">Who Was There?</div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{players.map(p=><label key={p.id} className={`flex min-h-11 items-center gap-2 rounded-xl border p-2 text-xs font-black ${familyEventDraft.attendeeIds.includes(p.id)?'border-[#77511f] bg-[#f0d99f]':'border-[#c7aa70] bg-[#fff7e6]'}`}><input type="checkbox" checked={familyEventDraft.attendeeIds.includes(p.id)} onChange={()=>setFamilyEventDraft(d=>({...d,attendeeIds:d.attendeeIds.includes(p.id)?d.attendeeIds.filter(id=>id!==p.id):[...d.attendeeIds,p.id]}))} disabled={p.id===signedInPlayer?.id}/>{p.display_name}</label>)}</div></div>
                      <label className="mt-4 block text-[9px] font-black uppercase">Memory / Note<textarea value={familyEventDraft.note} onChange={e=>setFamilyEventDraft(d=>({...d,note:e.target.value}))} placeholder="What made this day special?" className="mt-1 min-h-24 w-full rounded-lg border border-[#c7aa70] bg-white p-3 text-base" /></label>
                      <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[#b99d68] bg-[#fff7e6] px-3 text-xs font-black text-[#77511f]">{familyEventPhoto?`📷 ${familyEventPhoto.name}`:"📷 Add a Photo (optional)"}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={e=>setFamilyEventPhoto(e.target.files?.[0]??null)} /></label>
                      {passportError&&<div className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">{passportError}</div>}
                      <button type="button" disabled={familyEventSaving} onClick={()=>void saveFamilyEvent()} className="mt-5 min-h-12 w-full rounded-xl bg-[#102b49] text-sm font-black text-white disabled:opacity-50">{familyEventSaving?'Saving…':'Save Family Memory'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedTrophy && (
              <div
                className="fixed inset-0 z-[160] flex items-center justify-center bg-[#080503]/80 p-4 backdrop-blur-sm"
                onClick={() => setSelectedTrophy(null)}
                role="presentation"
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${selectedTrophy.title} trophy details`}
                  onClick={(event) => event.stopPropagation()}
                  className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#b17a35] bg-[#1a100a] p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,.7)]"
                >
                  <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(243,198,79,.2),transparent_72%)]" />
                  <button
                    type="button"
                    onClick={() => setSelectedTrophy(null)}
                    aria-label="Close trophy details"
                    className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#8f6336] bg-black/35 text-lg font-black text-[#f4e6d2]"
                  >
                    ✕
                  </button>
                  <div className="relative flex items-start gap-4 pr-11">
                    <div className={`text-5xl ${selectedTrophy.earned ? "drop-shadow-[0_0_14px_rgba(243,198,79,.5)]" : "grayscale opacity-40"}`}>{selectedTrophy.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f3c64f]">{selectedTrophy.earned ? "🏆 Earned" : "🔒 How to earn it"}</div>
                      <div className="mt-1 text-2xl font-black text-white">{selectedTrophy.title}</div>
                    </div>
                  </div>
                  <div className="relative mt-5 text-sm font-semibold leading-6 text-[#ead8bf]">{selectedTrophy.note}.</div>
                  {selectedTrophy.progress && (
                    <div className="relative mt-4 rounded-xl border border-[#6f5031] bg-black/30 px-4 py-3 text-sm font-black text-[#f3c64f]">Progress: {selectedTrophy.progress}</div>
                  )}
                  {selectedTrophy.milestone && (
                    <div className="relative mt-3 text-xs font-bold leading-5 text-[#cbb79b]">Next milestone: {selectedTrophy.milestone}</div>
                  )}
                  {selectedTrophy.repeatable && (
                    <div className="relative mt-3 inline-flex rounded-full border border-[#8f6336] bg-[#321e12] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#f6d36f]">Repeatable achievement</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* APP NAV */}
      <nav className={`fixed inset-x-0 bottom-0 ${profileOpen ? "z-[145]" : "z-50"} border-t border-white/10 bg-[#06284a] text-white shadow-[0_-4px_18px_rgba(0,0,0,0.18)]`}>
        <div
          className="mx-auto grid max-w-5xl grid-cols-5"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            paddingTop: "6px",
          }}
        >
          {[
            ["🏠", "Home"],
            ["🎯", "Challenge"],
            ["⭐", "Events"],
            ["👕", "Locker Room"],
            ["🏆", "Trophy Room"],
          ].map(([icon, label], index) => (
            <button
              key={label}
              onClick={() => {
                setProfileOpen(false);
                if (label === "Home") {
                  setActiveSection("Home");
                  setActiveSport("All");
                }

                if (label === "Challenge") {
                  openPicks();
                }

                if (label === "Events") {
                  setActiveSection("Events");
                }

                if (label === "Locker Room") {
                  setActiveSection("Locker Room");
                  void loadLockerRoom();
                }

                if (label === "Trophy Room") {
                  setActiveSection("Trophy Room");
                  void loadLockerRoom();
                  void loadPassport();
                }
              }}
              className={`relative flex min-w-0 flex-col items-center justify-center py-2 ${
                activeSection === label
                  ? "text-[#f3c64f]"
                  : "text-white"
              }`}
            >
              <span className="text-xl leading-none">
                {icon}
              </span>
              <span className="mt-1 truncate text-[9px] font-bold">
                {label}
              </span>

              {(
                activeSection === label
              ) && (
                <span className="absolute bottom-0 h-0.5 w-10 rounded-full bg-[#f3c64f]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {selectedEventGuide && (
        <div className="fixed inset-0 z-[135] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-[#f7f4ec] shadow-2xl sm:rounded-[1.75rem]">
            <div className="bg-[#06284a] p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-4xl">{selectedEventGuide.icon}</div>
                  <div className="mt-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#f3c64f]">
                    {selectedEventGuide.sport} Event
                  </div>
                  <h2 className="mt-1 text-2xl font-black">{selectedEventGuide.name}</h2>
                  <div className="mt-1 text-xs font-semibold text-blue-100">
                    {selectedEventGuide.season} · {selectedEventGuide.format}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEventGuide(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-black"
                  aria-label="Close event guide"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-wide text-[#b28a2e]">About This Event</div>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{selectedEventGuide.description}</p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-wide text-[#b28a2e]">Key Dates</div>
                <div className="mt-2 space-y-2">
                  {selectedEventGuide.dates.map((date) => (
                    <div key={date} className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                      <span className="text-[#f3c64f]">●</span>
                      <span>{date}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[9px] font-semibold italic text-slate-400">
                  Exact dates will update when each official schedule is released.
                </div>
              </div>

              <div className="rounded-2xl border border-[#e8dba8] bg-[#fff8dc] p-4">
                <div className="text-[10px] font-black uppercase tracking-wide text-[#765800]">What We’ll Learn</div>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-[#5f4b18]">{selectedEventGuide.learning}</p>
              </div>

              <div className="rounded-2xl bg-[#10254a] p-4 text-white">
                <div className="text-[10px] font-black uppercase tracking-wide text-[#f3c64f]">FamBam Plan</div>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-100">
                  When this event becomes active, it will get its own picks, standings, reminders, champion and trophies without changing the regular weekly challenge.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameRoomGame && signedInPlayer && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] bg-[#f7f4ec] shadow-2xl sm:rounded-[1.75rem]"
            style={{
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div className="shrink-0 bg-[#06284a] px-4 pb-4 pt-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f3c64f]">
                    {gameRoomGame.icon} Game Details
                  </div>

                  <h2 className="mt-1 text-xl font-black leading-tight">
                    {gameRoomGame.away} vs {gameRoomGame.home}
                  </h2>

                  <div className="mt-1 text-xs font-semibold text-slate-200">
                    {gameRoomGame.competition}
                    {" · "}
                    {formatGameDate(gameRoomGame.startsAt)}
                    {" · "}
                    {formatGameTime(
                      gameRoomGame.startsAt,
                      gameRoomGame.startTimeTbd,
                    )}
                  </div>
                </div>

                <button
                  onClick={closeGameRoom}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-black"
                  aria-label="Close Game Details"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {/* FAMBAM SPORTS DESK */}
              <div className="mb-4 overflow-hidden rounded-2xl border border-[#e8dba8] bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 bg-[#06284a] px-3 py-2 text-white">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#f3c64f]">
                      FamBam Sports Desk
                    </div>

                    <div className="mt-0.5 text-xs font-black">
                      {getStatusLabel(gameRoomGame) === "FINAL"
                        ? "🏁 Final"
                        : getStatusLabel(gameRoomGame) === "LIVE"
                          ? "🔴 Live Update"
                          : isTomorrowGame(
                                gameRoomGame,
                                currentTime,
                              )
                            ? "📅 Tomorrow in FamBam"
                            : "🏟️ Game Preview"}
                    </div>
                  </div>

                  <div className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black">
                    {getStatusLabel(gameRoomGame)}
                  </div>
                </div>

                <div className="p-3">
                  {(["LIVE", "FINAL"].includes(
                    getStatusLabel(gameRoomGame),
                  )) && (
                    <div className="rounded-xl bg-[#f7f4ec] px-3 py-3 text-center">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        {[
                          "final",
                          "finished",
                          "complete",
                          "completed",
                          "closed",
                        ].some((status) =>
                          String(
                            gameRoomGame.status ?? "",
                          )
                            .toLowerCase()
                            .includes(status),
                        )
                          ? "Final Score"
                          : "Current Score"}
                      </div>

                      <div className="mt-1 text-base font-black text-[#06284a]">
                        {gameRoomGame.away}{" "}
                        {gameRoomGame.awayScore ?? 0}
                        {" · "}
                        {gameRoomGame.home}{" "}
                        {gameRoomGame.homeScore ?? 0}
                      </div>
                    </div>
                  )}

                  {!["LIVE", "FINAL"].includes(
                    getStatusLabel(gameRoomGame),
                  ) && (
                      <div className="text-xs font-semibold leading-relaxed text-slate-600">
                        {getWatchInfo(
                          gameRoomGame,
                          collegeFootballRankings,
                        ).label}
                        {" · "}
                        {formatGameDate(
                          gameRoomGame.startsAt,
                        )}
                        {" · "}
                        {formatGameTime(
                          gameRoomGame.startsAt,
                          gameRoomGame.startTimeTbd,
                        )}
                      </div>
                    )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {challengeGameIds.includes(
                      gameRoomGame.id,
                    ) && (
                      <span className="rounded-full bg-[#fff5cf] px-2.5 py-1 text-[9px] font-black text-[#765800]">
                        🏆 FamBam Challenge
                      </span>
                    )}

                  </div>
                </div>
              </div>

              {gameRoomLoading && (
                <div className="py-10 text-center text-sm font-bold text-slate-500">
                  Loading game details…
                </div>
              )}

              {!gameRoomLoading && (
                <>
                  <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <div className="text-[11px] font-black uppercase tracking-wide text-[#06284a]">
                        📣 Game Updates
                      </div>
                    </div>

                    {gameRoomLiveEvents.length > 0 ? (
                      <div className="space-y-2 p-3">
                        {[...gameRoomLiveEvents]
                          .sort(
                            (a, b) =>
                              new Date(b.created_at).getTime() -
                              new Date(a.created_at).getTime(),
                          )
                          .map((event) => (
                            <div
                              key={event.id}
                              className="rounded-xl border border-[#f3c64f]/50 bg-[#fff8dc] px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-black text-[#06284a]">
                                  {event.message}
                                </div>

                                <div className="shrink-0 text-[9px] font-semibold text-slate-400">
                                  {new Date(
                                    event.created_at,
                                  ).toLocaleTimeString([], {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-xs font-semibold text-slate-500">
                        Live scoring updates will appear here as the game happens.
                      </div>
                    )}
                  </div>

                  <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <div className="text-[11px] font-black uppercase tracking-wide text-[#06284a]">
                        📊 About This Game
                      </div>
                    </div>

                    <div className="p-3">
                      {gameInsightsLoading ? (
                        <div className="py-3 text-center text-xs font-semibold text-slate-500">
                          Checking the matchup…
                        </div>
                      ) : gameInsights.length > 0 ? (
                        <div className="space-y-3">
                          {gameInsights.map((insight, index) => (
                            <div
                              key={`${insight.type}-${index}`}
                              className="rounded-xl bg-[#f7f4ec] px-3 py-2.5"
                            >
                              <div className="text-[10px] font-black uppercase tracking-wide text-[#06284a]">
                                {insight.title}
                              </div>

                              <div className="mt-1 whitespace-pre-line text-xs font-semibold leading-relaxed text-slate-600">
                                {insight.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : gameRoomGame.sport ===
                        "College Football" ? (
                        <div className="rounded-xl bg-[#edf5ff] px-3 py-2.5 text-xs font-semibold leading-relaxed text-[#284d7e]">
                          {getGameContext(
                            gameRoomGame,
                            collegeFootballRankings,
                          )}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold leading-relaxed text-slate-500">
                          No extra matchup insights are available yet.
                        </div>
                      )}
                    </div>
                  </div>

                </>
              )}

              {challengeGameIds.includes(
                gameRoomGame.id,
              ) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
                    <div className="text-[11px] font-black uppercase tracking-wide text-[#06284a]">
                      🏆 FamBam Picks
                    </div>

                    {!gameRoomPicksRevealed && (
                      <div className="text-[9px] font-black text-slate-400">
                        🔒 Hidden
                      </div>
                    )}
                  </div>

                  {gameRoomPicksLoading ? (
                    <div className="px-3 py-4 text-center text-xs font-bold text-slate-400">
                      Loading picks…
                    </div>
                  ) : !gameRoomPicksRevealed ? (
                    <div className="px-3 py-4 text-center">
                      <div className="text-sm font-black text-[#06284a]">
                        🔒 Picks reveal at kickoff
                      </div>

                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        ✅ {gameRoomPickedCount} of{" "}
                        {gameRoomTotalPlayers} FamBammers
                        have picked
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {gameRoomPicks.map((pick) => {
                        const pickLabel =
                          pick.pick_choice === "home"
                            ? gameRoomGame.home
                            : pick.pick_choice === "away"
                              ? gameRoomGame.away
                              : pick.pick_choice === "draw"
                                ? "Draw"
                                : "No pick";

                        return (
                          <div
                            key={pick.player_id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3c64f] text-[9px] font-black text-[#06284a]">
                                {pick.initials ?? "FB"}
                              </div>

                              <span className="truncate text-xs font-black text-[#06284a]">
                                {pick.display_name}
                              </span>
                            </div>

                            <span
                              className={`shrink-0 text-xs font-black ${
                                pick.pick_choice
                                  ? "text-slate-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {pickLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {getStatusLabel(gameRoomGame) === "FINAL" &&
                gameRoomPicksRevealed &&
                (() => {
                  const homeScore = gameRoomGame.homeScore ?? 0;
                  const awayScore = gameRoomGame.awayScore ?? 0;
                  const winningPick: PickChoice =
                    homeScore === awayScore
                      ? "draw"
                      : homeScore > awayScore
                        ? "home"
                        : "away";
                  const winners = gameRoomPicks.filter(
                    (pick) => pick.pick_choice === winningPick,
                  );

                  return (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-[#e8dba8] bg-gradient-to-br from-[#fff8dc] to-white shadow-sm">
                      <div className="border-b border-[#e8dba8] px-3 py-2.5">
                        <div className="text-[11px] font-black uppercase tracking-wide text-[#06284a]">
                          🏁 FamBam Final Whistle
                        </div>
                      </div>

                      <div className="p-3 text-center">
                        <div className="text-sm font-black text-[#06284a]">
                          {winners.length > 0
                            ? `${winners.map((pick) => pick.display_name).join(", ")} ${winners.length === 1 ? "picked it right!" : "picked it right!"}`
                            : "That result fooled the whole family!"}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {gameRoomGame.away} {awayScore} · {gameRoomGame.home} {homeScore}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
                  <div className="text-[11px] font-black uppercase tracking-wide text-[#06284a]">
                    💬 Family Sideline
                  </div>
                  <div className="text-[9px] font-bold text-slate-400">
                    Cheer together
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {["🔥", "👏", "😱", "Let’s go!", "Great pick!"].map(
                    (reaction) => (
                      <button
                        key={reaction}
                        type="button"
                        onClick={() => void sendGameRoomMessage(reaction)}
                        disabled={gameRoomSending}
                        className="shrink-0 rounded-full border border-[#e8dba8] bg-[#fffaf0] px-3 py-1.5 text-xs font-black text-[#06284a] active:scale-95 disabled:opacity-50"
                      >
                        {reaction}
                      </button>
                    ),
                  )}
                </div>

                <div className="max-h-64 space-y-2 overflow-y-auto bg-[#f7f4ec] p-3">
                  {gameRoomMessages.length === 0 ? (
                    <div className="py-4 text-center text-xs font-semibold text-slate-500">
                      Be the first to cheer, react, or talk about the game!
                    </div>
                  ) : (
                    gameRoomMessages.map((message) => {
                      const mine =
                        message.player_id === signedInPlayer.id;
                      const messagePlayer = players.find(
                        (player) => player.id === message.player_id,
                      );

                      return (
                        <div
                          key={message.id}
                          className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
                        >
                          {!mine && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#06284a] text-[8px] font-black text-white">
                              {messagePlayer?.avatar_url ? (
                                <img
                                  src={messagePlayer.avatar_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                message.player_initials || "FB"
                              )}
                            </div>
                          )}

                          <div
                            className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                              mine
                                ? "rounded-br-md bg-[#06284a] text-white"
                                : "rounded-bl-md border border-slate-200 bg-white text-[#10254a]"
                            }`}
                          >
                            {!mine && (
                              <div className="mb-0.5 text-[8px] font-black uppercase tracking-wide text-[#b28a2e]">
                                {message.player_name}
                              </div>
                            )}
                            <div className="break-words text-xs font-semibold">
                              {message.message}
                            </div>
                            <div
                              className={`mt-1 text-right text-[8px] font-semibold ${
                                mine ? "text-white/55" : "text-slate-400"
                              }`}
                            >
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {gameRoomTypingName && (
                    <div className="text-[10px] font-bold italic text-slate-400">
                      {gameRoomTypingName} is typing…
                    </div>
                  )}
                  <div ref={gameRoomBottomRef} />
                </div>

                <div className="flex items-center gap-2 border-t border-slate-100 p-3">
                  <input
                    value={gameRoomMessage}
                    onChange={(event) => {
                      setGameRoomMessage(event.target.value);
                      void signalGameRoomTyping();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void sendGameRoomMessage();
                      }
                    }}
                    maxLength={240}
                    placeholder="Say something about the game…"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-[#10254a] outline-none focus:border-[#f3c64f]"
                  />
                  <button
                    type="button"
                    onClick={() => void sendGameRoomMessage()}
                    disabled={
                      gameRoomSending ||
                      gameRoomMessage.trim().length === 0
                    }
                    className="rounded-xl bg-[#f3c64f] px-3 py-2.5 text-xs font-black text-[#06284a] disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {gameRoomSending ? "…" : "Send"}
                  </button>
                </div>
              </div>

              {gameRoomError && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  {gameRoomError}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {activeSection === "Events" && signedInPlayer && (
        <section className="min-h-[calc(100vh-64px)] bg-[#eef1f4] pb-28">
          <div className="mx-auto max-w-3xl">
            <div className="bg-[#06284a] px-4 pb-5 pt-5 text-white">
              <button
                type="button"
                onClick={() => setActiveSection("Challenge")}
                className="mb-3 text-[10px] font-black uppercase tracking-wide text-[#f3c64f]"
              >
                ← Back to Weekly Challenge
              </button>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f3c64f]">
                FamBam Special Events
              </div>
              <h2 className="mt-1 text-3xl font-black">🏆 Events Hub</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-blue-100">
                Extra challenges run alongside the regular 10-game week. Each event keeps its own picks, standings, champion and trophies.
              </p>
            </div>

            <div className="space-y-4 px-3 py-4">
              {isMama && mamasHockeyEventId && (
                <div className="overflow-hidden rounded-2xl border border-[#8eb6d8] bg-white shadow-sm">
                  <div className="bg-[linear-gradient(135deg,#06284a,#0b4a72)] px-4 py-4 text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#f3c64f]">
                          🏒 Personal Challenge
                        </div>
                        <div className="mt-1 text-xl font-black">Mama’s Weekly Hockey Challenge</div>
                        <div className="mt-1 text-[10px] font-semibold text-blue-100">
                          5 hockey games · your teams get first priority
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[9px] font-black">
                        {eventProgress[mamasHockeyEventId]?.made ?? 0}/5 picks · {eventProgress[mamasHockeyEventId]?.correct ?? 0} correct
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[9px] font-semibold leading-relaxed text-blue-50">
                      Your hockey picks are optional and completely separate from the regular 10-game FamBam Challenge, family standings and Record Book.
                    </div>
                  </div>

                  <div className="p-3">
                    {mamasHockeyGames.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {mamasHockeyGames.map((game) => {
                          const selected = eventPicks[mamasHockeyEventId]?.[game.id];
                          const saving = eventPickSavingKey === `${mamasHockeyEventId}:${game.id}`;
                          const locked = gameIsLocked(game, currentTime);

                          return (
                            <div key={game.id} className="rounded-xl border border-slate-200 bg-[#f7f4ec] p-3">
                              <button
                                type="button"
                                onClick={() => void openGameRoom(game)}
                                className="w-full text-left"
                              >
                                <div className="text-[10px] font-black text-[#10254a]">
                                  {game.away} at {game.home}
                                </div>
                                <div className="mt-0.5 text-[8px] font-semibold text-slate-500">
                                  {formatGameDate(game.startsAt)} · {formatGameTime(game.startsAt, game.startTimeTbd)}
                                </div>
                              </button>
                              <div className="mt-2 grid grid-cols-2 gap-1.5">
                                {([[
                                  "away",
                                  game.away,
                                ], [
                                  "home",
                                  game.home,
                                ]] as const).map(([choice, team]) => (
                                  <button
                                    key={choice}
                                    type="button"
                                    disabled={saving || locked}
                                    onClick={() => void saveEventPick(mamasHockeyEventId, game, choice)}
                                    aria-pressed={selected === choice}
                                    className={`min-h-11 rounded-lg px-2 py-2 text-[8px] font-black transition active:scale-[0.98] ${
                                      selected === choice
                                        ? "bg-[#06284a] text-white ring-2 ring-[#f3c64f]"
                                        : locked
                                          ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                                          : "border border-slate-200 bg-white text-[#10254a]"
                                    }`}
                                  >
                                    {selected === choice ? "✓ " : ""}{team}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-[#f7f4ec] px-4 py-4 text-center text-[10px] font-semibold text-slate-500">
                        No hockey games fall in this challenge week yet. Your five picks will appear here automatically when the schedule is available.
                      </div>
                    )}

                    {eventPickMessage && eventPickMessageEventId === mamasHockeyEventId && (
                      <div className="mt-2 rounded-lg bg-[#fff8dc] px-3 py-2 text-center text-[10px] font-black text-[#765800]">
                        {eventPickMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-[#10254a]">Your Events</div>
                    <div className="mt-0.5 text-[9px] font-semibold text-slate-500">
                      Hide events you do not want to follow. You can add them back anytime.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHiddenEvents((current) => !current)}
                    className="shrink-0 rounded-full border border-slate-200 bg-[#f7f4ec] px-3 py-2 text-[9px] font-black text-[#10254a]"
                  >
                    Hidden ({hiddenEventIds.length})
                  </button>
                </div>

                {eventVisibilityMessage && (
                  <div className="mt-2 rounded-lg bg-[#fff8dc] px-3 py-2 text-[9px] font-bold text-[#765800]">
                    {eventVisibilityMessage}
                  </div>
                )}

                {showHiddenEvents && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {hiddenEventIds.length === 0 ? (
                      <div className="text-[10px] font-semibold text-slate-500">You have not hidden any events.</div>
                    ) : (
                      <div className="space-y-2">
                        {hiddenEventIds.map((eventId) => (
                          <div key={eventId} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f4ec] px-3 py-2">
                            <div className="text-[10px] font-black text-[#10254a]">
                              {EVENT_NAMES[eventId] ?? eventId.replaceAll("-", " ")}
                            </div>
                            <button
                              type="button"
                              disabled={eventVisibilitySavingId === eventId}
                              onClick={() => void setEventHidden(eventId, false)}
                              className="rounded-full bg-[#06284a] px-3 py-1.5 text-[9px] font-black text-white disabled:opacity-50"
                            >
                              {eventVisibilitySavingId === eventId ? "Adding…" : "Add Back"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-black uppercase tracking-wide text-[#10254a]">
                    Happening Now
                  </div>
                  <div className="mt-0.5 text-[9px] font-semibold text-slate-500">
                    Ordered by what is happening next · Tap an event name for its guide · Optional with no penalty.
                  </div>
                </div>

                <div className="space-y-4 p-3">
                  {[{"id":"efl-trophy","icon":"🏆","name":"EFL Trophy","sport":"Soccer","season":"August–April","format":"Groups + Knockout","description":"A cup path especially relevant to AFC Wimbledon.","dates":["Group stage: August–November","Knockout rounds: December–March","Final at Wembley: usually April"],"learning":"Regional groups of four play three matches. A win earns 3 points. A group-stage draw goes straight to penalties: both clubs earn 1 point and the shootout winner earns a bonus point. The top two in each group advance.","matches":["efl trophy","english football league trophy","football league trophy","vertu trophy","papa john","bristol street motors trophy"]},{"id":"carabao-cup","icon":"🥤","name":"Carabao Cup","sport":"Soccer","season":"August–March","format":"Knockout","description":"England’s professional League Cup.","dates":["Early rounds: August–September","Knockout rounds: October–February","Final: usually March"],"learning":"Learn single-elimination brackets, extra time, penalties and how lower-league clubs can upset Premier League teams.","matches":["carabao cup","efl cup","league cup"]},{"id":"champions-league","icon":"🌟","name":"Champions League","sport":"Soccer","season":"September–May","format":"League + Knockout","description":"Europe’s biggest club competition.","dates":["League phase: September–January","Knockout rounds: February–May","Final: late May"],"learning":"Learn the league-phase table, qualification places, two-leg aggregate scores and knockout advancement.","matches":["champions league"]},{"id":"fa-cup","icon":"⚽","name":"FA Cup","sport":"Soccer","season":"August–May","format":"Knockout","description":"Hundreds of English clubs share one road to Wembley.","dates":["Qualifying: August–October","First Round Proper: November","Premier League clubs enter: January","Final: May"],"learning":"Smaller clubs enter first and bigger clubs join later. Win and advance; lose and the cup run is over. That setup creates famous giant-killing upsets.","matches":["fa cup"]}]
                    .filter((event) => !hiddenEventIds.includes(event.id))
                    .map((event) => {
                    const eventGames = realGames
                      .filter((game) => {
                        const competition = game.competition.toLowerCase();
                        const matchesEvent =
                          event.id === "stanley-cup"
                            ? competition.includes("nhl") &&
                              (game.sourceNotes ?? "").toLowerCase().includes("stanley cup")
                            : event.matches.some((name) => competition.includes(name));
                        const upcoming = !game.startsAt ||
                          new Date(game.startsAt).getTime() > (currentTime ?? Date.now());
                        return matchesEvent && upcoming;
                      })
                      .sort(
                        (a, b) =>
                          new Date(a.startsAt ?? 0).getTime() -
                          new Date(b.startsAt ?? 0).getTime(),
                      )
                      .slice(0, 4);
                    const progress = eventProgress[event.id];

                    return (
                      <div key={event.id} className="rounded-xl bg-[#f7f4ec] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedEventGuide(event)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left active:opacity-70"
                          >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xl">{event.icon}</span>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-black text-[#10254a]">{event.name}</div>
                              <div className="text-[8px] font-bold text-slate-500">
                                {progress ? `${progress.correct} correct · ${progress.made} picks` : `${event.season} · Tap for guide`}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black text-emerald-700">
                              ACTIVE
                            </span>
                            <span className="text-xs font-black text-[#b28a2e]">ⓘ</span>
                          </div>
                          </button>
                          <button
                            type="button"
                            disabled={eventVisibilitySavingId === event.id}
                            onClick={() => void setEventHidden(event.id, true)}
                            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[8px] font-black text-slate-500 disabled:opacity-50"
                          >
                            {eventVisibilitySavingId === event.id ? "Hiding…" : "Hide"}
                          </button>
                        </div>

                        {eventGames.length > 0 ? (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {eventGames.map((game) => {
                              const selected = eventPicks[event.id]?.[game.id];
                              const saving = eventPickSavingKey === `${event.id}:${game.id}`;
                              return (
                                <div key={game.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                  <button
                                    type="button"
                                    onClick={() => void openGameRoom(game)}
                                    className="w-full text-left"
                                  >
                                    <div className="text-[10px] font-black text-[#10254a]">
                                      {game.away} at {game.home}
                                    </div>
                                    <div className="mt-0.5 text-[8px] font-semibold text-slate-500">
                                      {formatGameDate(game.startsAt)} · {formatGameTime(game.startsAt, game.startTimeTbd)}
                                    </div>
                                  </button>
                                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                                    {([
                                      ["away", game.away],
                                      ["home", game.home],
                                    ] as const).map(([choice, team]) => (
                                      <button
                                        key={choice}
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void saveEventPick(event.id, game, choice)}
                                        aria-pressed={selected === choice}
                                        className={`min-h-11 rounded-lg px-2 py-2 text-[8px] font-black transition active:scale-[0.98] ${
                                          selected === choice
                                            ? "bg-[#06284a] text-white ring-2 ring-[#f3c64f]"
                                            : "border border-slate-200 bg-white text-[#10254a]"
                                        }`}
                                      >
                                        {selected === choice ? "✓ " : ""}{team}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[9px] font-semibold text-slate-500">
                            The next fixtures are refreshing now. Once published, they will appear here automatically for picks.
                          </div>
                        )}

                        {eventPickMessage &&
                          eventPickMessageEventId === event.id && (
                            <div className="mt-2 rounded-lg bg-[#fff8dc] px-3 py-2 text-center text-[10px] font-black text-[#765800]">
                              {eventPickMessage}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-[#10254a]">
                      Coming Up Next
                    </h3>
                    <div className="mt-0.5 text-[9px] font-semibold text-slate-500">
                      Soonest first, based on the usual event months. Events awaiting dates appear last. Tap for details.
                    </div>
                  </div>
                  <div className="text-[8px] font-black uppercase text-[#b28a2e]">
                    More coming
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {"icon": "⚾", "name": "MLB Playoffs & World Series", "sport": "Baseball", "season": "September–November", "format": "Playoff Series", "description": "Follow the road from the Wild Card round to the World Series.", "dates": ["Wild Card round", "Division and Championship Series", "World Series · matchups announced as teams advance"], "learning": "Learn playoff seeding, series wins and how clubs advance. Picks will open when matchups are connected."},
                    {"icon": "🏈", "name": "NFL Playoffs & Super Bowl", "sport": "Football", "season": "January–February", "format": "Single-Elimination Playoffs", "description": "Pick your way through the NFL postseason.", "dates": ["Wild Card and Divisional rounds", "Conference championships", "Super Bowl"], "learning": "Learn playoff seeds, home-field advantage and how the conference champions reach the Super Bowl. Picks are coming later."},
                    {"icon": "🏀", "name": "SEC Basketball Tournaments", "sport": "Basketball", "season": "March", "format": "Conference Tournaments", "description": "Follow the men’s and women’s SEC tournaments, including Kentucky.", "dates": ["Women’s tournament: usually early March", "Men’s tournament: usually mid-March", "Brackets confirmed near the end of the regular season"], "learning": "Learn conference seeding, byes and automatic NCAA tournament bids. Men’s and women’s picks will be separate when activated."},
                    {"icon": "⚾", "name": "College World Series", "sport": "Baseball", "season": "May–June", "format": "NCAA Tournament", "description": "Follow college baseball from regionals to Omaha.", "dates": ["Regionals: usually late May–early June", "Super regionals: June", "College World Series: June"], "learning": "Learn double elimination, super-regional series and the championship series. Picks will open when the bracket is available."},
                    {"icon": "🏐", "name": "Pro Volleyball Playoffs", "sport": "Volleyball", "season": "Dates to be announced", "format": "League Playoffs", "description": "Follow the postseason race for Atlanta Vibe’s league.", "dates": ["Playoff dates: to be confirmed", "Qualifying teams and format: to be confirmed", "Championship: to be confirmed"], "learning": "Learn how regular-season standings determine playoff qualification and how teams advance. Atlanta Vibe’s participation depends on qualifying."},
                    {
                      icon: "🥤", name: "Carabao Cup", sport: "Soccer",
                      season: "August–March", format: "Knockout",
                      description: "England’s professional League Cup.",
                      dates: ["Early rounds: August–September", "Knockout rounds: October–February", "Final: usually March"],
                      learning: "Learn single-elimination brackets, extra time, penalties and how lower-league clubs can upset Premier League teams.",
                    },
                    {
                      icon: "🌟", name: "Champions League", sport: "Soccer",
                      season: "September–May", format: "League + Knockout",
                      description: "Europe’s biggest club competition.",
                      dates: ["League phase: September–January", "Knockout rounds: February–May", "Final: late May"],
                      learning: "Learn the league-phase table, qualification places, two-leg aggregate scores and knockout advancement.",
                    },
                    {
                      icon: "🟠", name: "Europa League", sport: "Soccer",
                      season: "September–May", format: "League + Knockout",
                      description: "A major European club tournament.",
                      dates: ["League phase: September–January", "Knockout rounds: February–May", "Final: May"],
                      learning: "Follow European standings, qualification cut lines, aggregate scoring and the path to the final.",
                    },
                    {
                      icon: "🟢", name: "Conference League", sport: "Soccer",
                      season: "September–May", format: "League + Knockout",
                      description: "European competition full of underdog stories.",
                      dates: ["League phase: September–December", "Knockout rounds: February–May", "Final: May"],
                      learning: "Discover clubs from across Europe and learn how league-phase results lead into knockout rounds.",
                    },
                    {
                      icon: "🌟", name: "Women’s Champions League", sport: "Soccer",
                      season: "September–May", format: "League + Knockout",
                      description: "Europe’s top women’s club competition.",
                      dates: ["Qualifying: summer–September", "League phase: autumn–winter", "Knockout rounds and final: spring"],
                      learning: "Follow the league phase, qualification places, aggregate scoring and Europe’s leading women’s clubs.",
                    },
                    {
                      icon: "🏒", name: "Stanley Cup", sport: "Hockey",
                      season: "April–June", format: "Best-of-Seven Playoffs",
                      description: "The NHL playoff path to hockey’s biggest trophy.",
                      dates: ["Regular season ends: April", "Four playoff rounds: April–June", "Stanley Cup Final: June"],
                      learning: "Learn playoff seeding, best-of-seven series, home-ice advantage and how a team advances by winning four games.",
                    },
                    {
                      icon: "🏒", name: "ACHA College Hockey Postseason", sport: "Hockey",
                      season: "February–March", format: "Conference + National Tournaments",
                      description: "Follow Kentucky Hockey from the ACCHL tournament toward the ACHA Division I national championship.",
                      dates: ["ACCHL tournament: February", "National tournament field: announced after conference play", "ACHA Division I championship: March"],
                      learning: "College club hockey uses conference and national postseason paths. Kentucky must advance or qualify to keep its championship run going; matchups will appear when the brackets are published.",
                    },
                    {
                      icon: "🦞", name: "SPHL President’s Cup Playoffs", sport: "Hockey",
                      season: "April", format: "Professional Playoff Series",
                      description: "Follow the Athens Rock Lobsters if they qualify for the SPHL postseason.",
                      dates: ["Regular season ends: early April", "President’s Cup playoff field: set from the standings", "Series matchups: announced after qualification"],
                      learning: "Learn playoff qualification, series results and how the Rock Lobsters can advance toward the President’s Cup. Picks will open when the bracket is official.",
                    },
                    {
                      icon: "🏆", name: "EFL Trophy", sport: "Soccer",
                      season: "August–April", format: "Groups + Knockout",
                      description: "A cup path especially relevant to AFC Wimbledon.",
                      dates: ["Group stage: August–November", "Knockout rounds: December–March", "Final: usually April"],
                      learning: "Learn group standings first, followed by a single-elimination bracket and a Wembley final.",
                    },
                    {
                      icon: "🏈", name: "Bowl Pick’em", sport: "College Football",
                      season: "December–January", format: "Many Bowls",
                      description: "Pick winners across the college football postseason.",
                      dates: ["Selections: early December", "Bowl season: mid-December–January", "Final standings: after the last bowl"],
                      learning: "Learn bowl affiliations, conference matchups and why bowls exist outside the playoff.",
                    },
                    {
                      icon: "🏟️", name: "College Football Playoff", sport: "College Football",
                      season: "December–January", format: "Playoff",
                      description: "A bracket for the national championship.",
                      dates: ["Bracket reveal: December", "Early rounds: December", "Championship: January"],
                      learning: "Learn seeding, byes, bracket paths and how the national champion is decided.",
                    },
                    {
                      icon: "🏀", name: "Men’s March Madness", sport: "Basketball",
                      season: "March–April", format: "68-Team Bracket",
                      description: "The men’s NCAA tournament challenge.",
                      dates: ["Selection Sunday: March", "Tournament: mid-March–early April", "Championship: early April"],
                      learning: "Learn seeds, regions, upset picks, the Sweet 16, Elite Eight and Final Four.",
                    },
                    {
                      icon: "🏀", name: "Women’s March Madness", sport: "Basketball",
                      season: "March–April", format: "68-Team Bracket",
                      description: "The women’s NCAA tournament challenge.",
                      dates: ["Selection Sunday: March", "Tournament: mid-March–early April", "Championship: early April"],
                      learning: "Learn bracket strategy, seeds, Cinderella runs and how each region reaches the Final Four.",
                    },
                    {
                      icon: "📣", name: "UCA College Cheer Nationals", sport: "Cheerleading",
                      season: "January", format: "Judged Competition",
                      description: "Cheer on the University of Kentucky at college nationals.",
                      dates: ["Competition: mid-January 2027", "Preliminaries and semifinals", "Division finals and awards"],
                      learning: "Learn how routines are scored for stunts, pyramids, tumbling, jumps, synchronization and overall impression—and how deductions can change the final standings.",
                    },
                    {
                      icon: "🏐", name: "SEC Volleyball Tournament", sport: "Volleyball",
                      season: "November 20–24, 2026", format: "Conference Tournament",
                      description: "Follow Kentucky and the SEC in Savannah, Georgia.",
                      dates: ["Opening round: November 20", "Second round: November 21", "Quarterfinals: November 22", "Semifinals: November 23", "Championship: November 24 at 7 p.m. Eastern"],
                      learning: "Follow the conference bracket as teams advance toward the SEC tournament title. Kentucky’s opponents and entry round depend on the bracket. Picks will open once matchups are connected.",
                    },
                    {
                      icon: "🏐", name: "NCAA Volleyball Tournament", sport: "Volleyball",
                      season: "November–December", format: "64-Team Bracket",
                      description: "Follow the road to the national volleyball title.",
                      dates: ["Selection show: late November", "Tournament rounds: December", "Championship: mid-December"],
                      learning: "Learn tournament seeding, best-of-five matches, sets, advancement and the road to the national semifinals.",
                    },
                    {
                      icon: "🌹", name: "Kentucky Derby", sport: "Horse Racing",
                      season: "First Saturday in May", format: "Single Race",
                      description: "Pick the Derby winner and learn the field.",
                      dates: ["Prep season: winter–spring", "Post-position draw: Derby week", "Kentucky Derby: first Saturday in May"],
                      learning: "Learn qualifying points, post positions, odds, track conditions and how the Derby begins the Triple Crown.",
                    },
                    {
                      icon: "👑", name: "Triple Crown", sport: "Horse Racing",
                      season: "May–June", format: "Three Races",
                      description: "Derby, Preakness and Belmont together.",
                      dates: ["Kentucky Derby: May", "Preakness Stakes: May", "Belmont Stakes: June"],
                      learning: "Track three different races and distances while watching whether one horse can sweep all three.",
                    },
                    {
                      icon: "🌍", name: "World Cups & Euros", sport: "International Soccer",
                      season: "Tournament years", format: "Groups + Knockout",
                      description: "Men’s and women’s international tournaments.",
                      dates: ["Group stage", "Knockout rounds", "Final"],
                      learning: "Learn group tables, goal difference, qualification paths and knockout brackets while choosing a country to support.",
                    },
                    {
                      icon: "🥇", name: "Olympics", sport: "Multi-Sport",
                      season: "Every two years", format: "Many Events",
                      description: "Family picks across favorite Olympic events.",
                      dates: ["Opening ceremony", "Daily medal events", "Closing ceremony"],
                      learning: "Follow medal tables, heats, qualification rounds and finals across many sports.",
                    },
                  ]
                    .filter((event) => !["Carabao Cup", "Champions League", "EFL Trophy"].includes(event.name))
                    .filter((event) => !hiddenEventIds.includes(eventIdFromName(event.name)))
                    .sort((a, b) => {
                      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                      const now = new Date(currentTime ?? Date.now());
                      const month = Number(new Intl.DateTimeFormat("en-US", {
                        timeZone: "America/New_York", month: "numeric",
                      }).format(now)) - 1;
                      const nextMonthOffset = (season: string) => {
                        const mentioned = [...season.matchAll(new RegExp(months.join("|"), "g"))]
                          .map((match) => months.indexOf(match[0]));
                        if (mentioned.length === 0) return Number.POSITIVE_INFINITY;
                        const start = mentioned[0];
                        const end = mentioned[mentioned.length - 1];
                        const inSeason = start <= end
                          ? month >= start && month <= end
                          : month >= start || month <= end;
                        return inSeason ? 0 : (start - month + 12) % 12;
                      };
                      const aOffset = nextMonthOffset(a.season);
                      const bOffset = nextMonthOffset(b.season);
                      // Preserve the existing order for ties and undated events.
                      return aOffset === bOffset ? 0 : aOffset - bOffset;
                    }).map((event) => (
                    <div
                      key={event.name}
                      className="relative rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedEventGuide(event)}
                        className="w-full pr-10 text-left transition active:scale-[0.98]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-2xl">{event.icon}</div>
                          <div className="text-[9px] font-black text-[#b28a2e]">→</div>
                        </div>
                        <div className="mt-2 text-xs font-black text-[#10254a]">{event.name}</div>
                        <div className="mt-1 text-[9px] font-semibold leading-relaxed text-slate-500">{event.description}</div>
                        <div className="mt-2 inline-flex rounded-full bg-[#f7f4ec] px-2 py-1 text-[8px] font-black text-[#765800]">{event.season}</div>
                      </button>
                      <button
                        type="button"
                        disabled={eventVisibilitySavingId === eventIdFromName(event.name)}
                        onClick={() => void setEventHidden(eventIdFromName(event.name), true)}
                        className="absolute right-2 top-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[8px] font-black text-slate-500 disabled:opacity-50"
                      >
                        Hide
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#10254a] p-4 text-white">
                <div className="text-[10px] font-black uppercase tracking-wide text-[#f3c64f]">
                  Learn While We Play
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-semibold text-blue-100">
                  <div>✓ Standings and points</div>
                  <div>✓ Aggregate scores</div>
                  <div>✓ Extra time and penalties</div>
                  <div>✓ Who advances</div>
                  <div>✓ Who to root for</div>
                  <div>✓ Why each result matters</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeSection === "Challenge" &&
        signedInPlayer &&
        challenge && (
          <section className="mx-auto max-w-5xl px-3 py-4">
            <div className="mx-auto max-w-lg overflow-hidden rounded-[1.5rem] bg-[#f7f4ec] shadow-lg">
              <div className="bg-[#06284a] p-5 text-white">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f3c64f]">
                    This Week&apos;s Challenge
                  </div>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">
                    {signedInPlayer.display_name}&apos;s Picks
                  </h2>
                </div>
              </div>

              <div className="border-b border-[#e5dcc5] bg-[#fffaf0] px-4 py-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b28a2e]">Current Challenge</div>
                    <div className="mt-0.5 text-lg font-black tracking-tight text-[#06284a]">{signedInPlayer.display_name}&apos;s Scoreboard</div>
                  </div>
                  <div className="text-[9px] font-bold text-slate-400">Updates as games finish</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    [trophyStanding?.points ?? 0, "Points"],
                    [trophyStanding?.correct ?? 0, "Correct"],
                    [trophyStanding?.completed_picks ? `${Math.round(trophyStanding.accuracy)}%` : "0%", "Accuracy"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-xl border border-[#e5dcc5] bg-white p-3 text-center shadow-sm">
                      <div className="text-2xl font-black text-[#b28a2e]">{value}</div>
                      <div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* WHO'S READY */}
              <div className="border-b border-[#e5dcc5] bg-white px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">👥</span>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#06284a]">
                      Who&apos;s Ready?
                    </div>
                  </div>

                  <div className="text-[9px] font-bold text-slate-400">
                    {challengeGames.length} picks this week
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {players.map((player) => {
                    const count =
                      challengePickStatus[player.id] ?? 0;

                    const ready =
                      challengeGames.length > 0 &&
                      count >= challengeGames.length;

                    const isYou =
                      player.id === signedInPlayer.id;

                    return (
                      <div
                        key={player.id}
                        className="min-w-0 text-center"
                      >
                        <div
                          className={`relative mx-auto flex h-10 w-10 items-center justify-center overflow-visible rounded-full text-[9px] font-black ${
                            isYou
                              ? "bg-[#06284a] text-white"
                              : "bg-[#f7f4ec] text-[#10254a] ring-1 ring-[#e5dcc5]"
                          }`}
                        >
                          {player.avatar_url ? (
                            <img
                              src={player.avatar_url}
                              alt={`${player.display_name} profile`}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            player.initials ?? "?"
                          )}

                        </div>

                        <div className="mt-1 truncate text-[8px] font-black text-[#10254a]">
                          {player.display_name}
                        </div>

                        <div
                          className={`mt-0.5 text-[7px] font-black ${
                            ready
                              ? "text-green-600"
                              : "text-slate-400"
                          }`}
                        >
                          {ready
                            ? "Ready!"
                            : `${Math.max(
                                0,
                                challengeGames.length - count,
                              )} left`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!picksUnlocked ? (
                <div className="p-6">
                  {loadingPicks ? (
                    <div className="py-8 text-center">
                      <div className="text-3xl">
                        🏆
                      </div>
                      <h3 className="mt-3 text-xl font-black">
                        Loading Your Picks...
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        Getting this week&apos;s Challenge ready.
                      </p>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <div className="text-3xl">
                        🔒
                      </div>
                      <h3 className="mt-3 text-xl font-black">
                        Couldn&apos;t Open Your Picks
                      </h3>

                      {picksError && (
                        <p className="mt-2 text-sm font-semibold text-slate-500">
                          {picksError}
                        </p>
                      )}

                      <button
                        onClick={() => setActiveSection("Home")}
                        className="mt-5 rounded-xl bg-[#06284a] px-6 py-3 text-sm font-black text-white"
                      >
                        Back to Home
                      </button>
                    </div>
                  )}
                </div>              ) : (
                <div className="p-5">
                  {weeklyLeaderboard.length > 0 && (
                    <div className="mb-4 rounded-2xl border border-[#e5dcc5] bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b28a2e]">
                            Challenge Scoreboard
                          </div>
                          <div className="text-sm font-black text-[#06284a]">
                            This Week 🏆
                          </div>
                        </div>

                        <div className="text-[9px] font-black uppercase text-slate-400">
                          Points
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {[...weeklyLeaderboard]
                          .sort((a, b) => {
                            if (b.points !== a.points) {
                              return b.points - a.points;
                            }

                            if (b.correct !== a.correct) {
                              return b.correct - a.correct;
                            }

                            return b.accuracy - a.accuracy;
                          })
                          .map((row, index) => {
                            const isYou =
                              row.player_id === signedInPlayer.id;

                            return (
                              <div
                                key={row.player_id}
                                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${
                                  isYou
                                    ? "bg-[#edf5ff] ring-1 ring-[#bdd7f4]"
                                    : "bg-[#f8f6ef]"
                                }`}
                              >
                                <div className="w-6 text-center text-sm font-black text-[#b28a2e]">
                                  {index === 0
                                    ? "🥇"
                                    : index === 1
                                      ? "🥈"
                                      : index === 2
                                        ? "🥉"
                                        : `${index + 1}.`}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-black text-[#06284a]">
                                    {row.display_name}
                                  </div>

                                  <div className="text-[9px] font-semibold text-slate-500">
                                    {row.correct} correct
                                    {" · "}
                                    {row.completed_picks}/{row.total_picks} scored
                                    {row.completed_picks > 0
                                      ? ` · ${Math.round(row.accuracy)}%`
                                      : ""}
                                  </div>
                                </div>

                                <div className="shrink-0 text-right">
                                  <div className="text-lg font-black leading-none text-[#06284a]">
                                    {row.points}
                                  </div>
                                  <div className="mt-0.5 text-[8px] font-black uppercase text-slate-400">
                                    pts
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {challengeGames.map(
                      (game) => {
                        const locked =
                          gameIsLocked(game, currentTime);

                        const choice =
                          pickChoices[game.id];

                        const saved =
                          savedPickGameIds.includes(
                            game.id,
                          );

                        const isFinal =
                          [
                            "final",
                            "finished",
                            "complete",
                            "completed",
                            "closed",
                          ].includes(
                            game.status.toLowerCase(),
                          ) &&
                          game.homeScore !== null &&
                          game.awayScore !== null;

                        const winningChoice =
                          isFinal
                            ? game.homeScore! >
                              game.awayScore!
                              ? "home"
                              : game.awayScore! >
                                  game.homeScore!
                                ? "away"
                                : "draw"
                            : null;

                        const winningTeam =
                          winningChoice === "home"
                            ? game.home
                            : winningChoice === "away"
                              ? game.away
                              : null;

                        return (
                          <div
                            key={game.id}
                            className="rounded-2xl border border-[#e3dccd] bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-wide text-[#b28a2e]">
                                  {
                                    game.competition
                                  }
                                </div>

                                <div className="mt-1 text-xs font-semibold text-slate-500">
                                  {formatGameDate(
                                    game.startsAt,
                                  )}
                                  {" · "}
                                  {formatGameTime(
                                    game.startsAt,
                                    game.startTimeTbd,
                                  )}
                                </div>
                              </div>

                              {saved && (
                                <div className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">
                                  ✓ SAVED
                                </div>
                              )}
                            </div>

                            {game.startTimeTbd ? (
                              <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-black text-amber-700">
                                ⏳ Picks open
                                when kickoff is
                                confirmed.
                              </div>
                            ) : locked ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openGameRoom(game)}
                                  className="mt-3 block w-full rounded-xl text-left active:bg-slate-50"
                                  aria-label={`Open game details for ${game.away} vs ${game.home}`}
                                >
                                  <div className="text-lg font-black text-slate-950">
                                    {game.sport === "College Football"
                                      ? rankedTeamLabel(
                                          game.away,
                                          collegeFootballRankings,
                                        )
                                      : game.away}
                                    {" at "}
                                    {game.sport === "College Football"
                                      ? rankedTeamLabel(
                                          game.home,
                                          collegeFootballRankings,
                                        )
                                      : game.home}
                                  </div>

                                  <div className="mt-1 text-[10px] font-bold text-[#164d75]">
                                    Tap matchup for game details →
                                  </div>
                                </button>

                                {isFinal && (
                                  <div className="mt-3 rounded-2xl border border-[#e3dccd] bg-[#f8f6ef] p-3">
                                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#b28a2e]">
                                      FINAL
                                    </div>

                                    <div className="mt-1 text-base font-black text-[#06284a]">
                                      {game.away} {game.awayScore}
                                      {" — "}
                                      {game.home} {game.homeScore}
                                    </div>

                                    <div className="mt-1 text-sm font-black text-slate-700">
                                      {winningTeam
                                        ? `🏆 ${winningTeam} wins`
                                        : "🤝 Draw"}
                                    </div>
                                  </div>
                                )}



                                {challengeRevealedPicks[game.id] && (
                                  <div className="mt-3 rounded-2xl border border-[#e3dccd] bg-[#f8f6ef] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#b28a2e]">
                                          👀 FamBam Picks Revealed
                                        </div>
                                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                                          Kickoff happened — everybody's picks are out!
                                        </div>
                                      </div>

                                      <div className="rounded-full bg-[#e8f0fb] px-2 py-1 text-[9px] font-black text-[#06284a]">
                                        🔒 LOCKED
                                      </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                      {challengeRevealedPicks[
                                        game.id
                                      ].map((pick) => {
                                        const pickLabel =
                                          pick.pick_choice === "away"
                                            ? game.sport ===
                                              "College Football"
                                              ? rankedTeamLabel(
                                                  game.away,
                                                  collegeFootballRankings,
                                                )
                                              : game.away
                                            : pick.pick_choice === "home"
                                              ? game.sport ===
                                                "College Football"
                                                ? rankedTeamLabel(
                                                    game.home,
                                                    collegeFootballRankings,
                                                  )
                                                : game.home
                                              : pick.pick_choice === "draw"
                                                ? "Draw"
                                                : "No pick";

                                        const mine =
                                          pick.player_id ===
                                          signedInPlayer.id;

                                        const pickCorrect =
                                          isFinal &&
                                          winningChoice !== null &&
                                          pick.pick_choice ===
                                            winningChoice;

                                        return (
                                          <div
                                            key={pick.player_id}
                                            className={`rounded-xl p-3 ${
                                              mine
                                                ? "border-2 border-[#f3c64f] bg-white"
                                                : "border border-slate-200 bg-white"
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#06284a] text-[9px] font-black text-white">
                                                {pick.initials ||
                                                  pick.display_name
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                              </div>

                                              <div className="min-w-0">
                                                <div className="truncate text-[10px] font-black text-slate-500">
                                                  {pick.display_name}
                                                  {mine
                                                    ? " · YOU"
                                                    : ""}
                                                </div>

                                                <div className="mt-0.5 flex items-center gap-2">
                                                  <div className="min-w-0 truncate text-xs font-black text-[#10254a]">
                                                    {pickLabel}
                                                  </div>

                                                  {isFinal &&
                                                    pick.pick_choice && (
                                                      <div
                                                        className={`shrink-0 text-[10px] font-black ${
                                                          pickCorrect
                                                            ? "text-emerald-600"
                                                            : "text-rose-500"
                                                        }`}
                                                      >
                                                        {pickCorrect
                                                          ? "✓ +1"
                                                          : "✗ 0"}
                                                      </div>
                                                    )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openGameRoom(game)}
                                  className="mt-3 block w-full rounded-xl text-left active:bg-slate-50"
                                  aria-label={`Open game details for ${game.away} vs ${game.home}`}
                                >
                                  <div className="text-lg font-black text-slate-950">
                                    {game.sport === "College Football"
                                      ? rankedTeamLabel(
                                          game.away,
                                          collegeFootballRankings,
                                        )
                                      : game.away}
                                    {" at "}
                                    {game.sport === "College Football"
                                      ? rankedTeamLabel(
                                          game.home,
                                          collegeFootballRankings,
                                        )
                                      : game.home}
                                  </div>

                                  <div className="mt-1 text-[10px] font-bold text-[#164d75]">
                                    Tap matchup for game details →
                                  </div>
                                </button>



                                <div
                                  className={`mt-4 grid gap-2 ${
                                    game.sport === "Soccer"
                                      ? "grid-cols-3"
                                      : "grid-cols-2"
                                  }`}
                                >
                                  <button
                                    onClick={() =>
                                      selectPick(game.id, "away")
                                    }
                                    className={`rounded-2xl border-2 p-3 text-center transition active:scale-[0.98] ${
                                      choice === "away"
                                        ? "border-[#f3c64f] bg-[#06284a] text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-900"
                                    }`}
                                  >
                                    <div className={`text-[9px] font-black uppercase ${
                                      choice === "away"
                                        ? "text-[#f3d879]"
                                        : "text-slate-400"
                                    }`}>
                                      Away
                                    </div>
                                    <div className="mt-1 text-sm font-black">
                                      {game.sport === "College Football"
                                        ? rankedTeamLabel(
                                            game.away,
                                            collegeFootballRankings,
                                          )
                                        : game.away}
                                    </div>
                                    {choice === "away" && (
                                      <div className="mt-1 text-[10px] font-black">
                                        ✓ YOUR PICK
                                      </div>
                                    )}
                                  </button>

                                  {game.sport === "Soccer" && (
                                    <button
                                      onClick={() =>
                                        selectPick(game.id, "draw")
                                      }
                                      className={`rounded-2xl border-2 p-3 text-center transition active:scale-[0.98] ${
                                        choice === "draw"
  ? "border-[#f3c64f] bg-[#06284a] text-white shadow-sm"
                                          : "border-slate-200 bg-white text-slate-900"
                                      }`}
                                    >
                                      <div className={`text-[9px] font-black uppercase ${
                                        choice === "draw"
  ? "text-[#f3d879]"
                                          : "text-slate-400"
                                      }`}>
                                        Result
                                      </div>
                                      <div className="mt-1 text-sm font-black">
                                        Draw
                                      </div>
                                      {choice === "draw" && (
                                        <div className="mt-1 text-[10px] font-black">
                                          ✓ YOUR PICK
                                        </div>
                                      )}
                                    </button>
                                  )}

                                  <button
                                    onClick={() =>
                                      selectPick(game.id, "home")
                                    }
                                    className={`rounded-2xl border-2 p-3 text-center transition active:scale-[0.98] ${
                                      choice === "home"
                                        ? "border-[#f3c64f] bg-[#06284a] text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-900"
                                    }`}
                                  >
                                    <div className={`text-[9px] font-black uppercase ${
                                      choice === "home"
                                        ? "text-[#f3d879]"
                                        : "text-slate-400"
                                    }`}>
                                      Home
                                    </div>
                                    <div className="mt-1 text-sm font-black">
                                      {game.sport === "College Football"
                                        ? rankedTeamLabel(
                                            game.home,
                                            collegeFootballRankings,
                                          )
                                        : game.home}
                                    </div>
                                    {choice === "home" && (
                                      <div className="mt-1 text-[10px] font-black">
                                        ✓ YOUR PICK
                                      </div>
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>

                  {picksError && (
                    <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-600">
                      {picksError}
                    </div>
                  )}

                  {picksSuccess && (
                    <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-center text-sm font-black text-emerald-700">
                      {picksSuccess}
                      <div className="mt-1 text-[10px]">
                        Nobody else can
                        see them yet.
                      </div>
                    </div>
                  )}

                  {availablePickGames.length >
                    0 && (
                    <button
                      onClick={saveAllPicks}
                      disabled={savingPicks}
                      className="mt-5 w-full rounded-2xl bg-[#06284a] py-4 font-black text-white shadow-sm disabled:bg-slate-300"
                    >
                      {savingPicks
  ? "Saving..."
  : savedPickGameIds.length > 0
    ? "Save My Picks 🔒"
    : "Save My Picks 🔒"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

      {selectedPlayer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-6">
            <h2 className="text-center text-2xl font-black">
              Hi, {selectedPlayer.display_name}!
            </h2>

            <p className="mt-1 text-center text-sm font-semibold text-slate-500">
              Enter your 4-digit PIN.
            </p>

            <div className="mt-5 flex justify-center gap-3">
              {pinEmojis.map((sportBall, position) => (
                  <div
                    key={sportBall}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition ${
                      pin.length > position
                        ? "scale-110 bg-blue-50"
                        : "bg-slate-200"
                    }`}
                  >
                    {pin.length > position
                      ? sportBall
                      : ""}
                  </div>
                ),
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
              ].map((digit) => (
                <button
                  key={digit}
                  onClick={() =>
                    enterDigit(digit)
                  }
                  className="h-14 rounded-2xl bg-slate-100 text-xl font-black transition active:scale-95 active:bg-blue-100 active:text-blue-700"
                >
                  {digit}
                </button>
              ))}

              <button
                onClick={closePinModal}
                className="text-xs font-black text-slate-400"
              >
                CANCEL
              </button>

              <button
                onClick={() =>
                  enterDigit("0")
                }
                className="h-14 rounded-2xl bg-slate-100 text-xl font-black transition active:scale-95 active:bg-blue-100 active:text-blue-700"
              >
                0
              </button>

              <button
                onClick={deleteDigit}
                className="text-xl font-black text-slate-500"
              >
                ⌫
              </button>
            </div>

            {pinError && (
              <div className="mt-4 text-center text-sm font-bold text-red-600">
                {pinError}
              </div>
            )}

            <button
              onClick={verifyPin}
              disabled={pin.length !== 4}
              className="mt-5 w-full rounded-2xl bg-blue-600 py-4 font-black text-white disabled:bg-slate-200"
            >
              Let&apos;s Go →
            </button>
          </div>
        </div>
      )}

      {adminGame && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-6">
            <h2 className="text-center text-2xl font-black">
              Add to Challenge?
            </h2>

            <p className="mt-2 text-center font-bold">
              {adminGame.away} at{" "}
              {adminGame.home}
            </p>

            <p className="mt-2 text-center text-sm font-semibold text-slate-500">
              Enter your admin PIN.
            </p>

            <div className="mt-5 flex justify-center gap-3">
              {[0, 1, 2, 3].map((position) => (
                <div
                  key={position}
                  className={`h-4 w-4 rounded-full transition ${
                    adminPin.length > position
                      ? "scale-110 bg-amber-400"
                      : "bg-slate-200"
                  }`}
                />
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
              ].map((digit) => (
                <button
                  key={digit}
                  onClick={() =>
                    enterAdminDigit(
                      digit,
                    )
                  }
                  className="h-14 rounded-2xl bg-slate-100 text-xl font-black transition active:scale-95 active:bg-blue-100 active:text-blue-700"
                >
                  {digit}
                </button>
              ))}

              <button
                onClick={closeAdminModal}
                className="text-xs font-black text-slate-400"
              >
                CANCEL
              </button>

              <button
                onClick={() =>
                  enterAdminDigit("0")
                }
                className="h-14 rounded-2xl bg-slate-100 text-xl font-black transition active:scale-95 active:bg-blue-100 active:text-blue-700"
              >
                0
              </button>

              <button
                onClick={deleteAdminDigit}
                className="text-xl font-black text-slate-500"
              >
                ⌫
              </button>
            </div>

            {adminError && (
              <div className="mt-4 text-center text-sm font-bold text-red-600">
                {adminError}
              </div>
            )}

            <button
              onClick={addGameToChallenge}
              disabled={
                adminPin.length !== 4 ||
                addingGame
              }
              className="mt-5 w-full rounded-2xl bg-amber-400 py-4 font-black text-amber-950 disabled:bg-slate-200"
            >
              {addingGame
                ? "Adding..."
                : "Add to Challenge →"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// Deployment refresh: event pick confirmation
