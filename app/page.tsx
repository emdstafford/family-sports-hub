"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  display_name: string;
  initials: string | null;
  is_admin: boolean;
  sort_order: number;
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
  | "Baseball";

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

function getStatusLabel(game: BrowserGame) {
  if (!game.liveData) return "SAMPLE";
  if (game.status === "final") return "FINAL";
  if (game.startTimeTbd) return "TIME TBD";

  if (
    game.homeScore !== null ||
    game.awayScore !== null
  ) {
    return "LIVE";
  }

  return "SCHEDULED";
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

function getGameFacts(
  game: BrowserGame,
  rankings: CollegeFootballRanking[],
) {
  const facts: string[] = [];

  if (game.sport === "College Football") {
    const awayRank = getTeamRank(game.away, rankings);
    const homeRank = getTeamRank(game.home, rankings);

    if (awayRank && homeRank) {
      facts.push(
        `This is a ranked-vs-ranked matchup: #${awayRank} ${game.away} visits #${homeRank} ${game.home}.`,
      );
    } else if (awayRank) {
      facts.push(
        `#${awayRank} ${game.away} comes into this one ranked, while ${game.home} gets the game at home.`,
      );
    } else if (homeRank) {
      facts.push(
        `${game.away} gets a road shot at #${homeRank} ${game.home}.`,
      );
    } else {
      facts.push(
        `${game.away} goes on the road to face ${game.home}.`,
      );
    }

    if (hasTeam(game, "Kentucky")) {
      const opponent =
        game.home.toLowerCase().includes("kentucky")
          ? game.away
          : game.home;

      facts.push(
        `Kentucky's matchup with ${opponent} is one the family will especially want to keep an eye on.`,
      );
    } else if (hasTeam(game, "Georgia")) {
      const opponent =
        game.home.toLowerCase().includes("georgia")
          ? game.away
          : game.home;

      facts.push(
        `Georgia faces ${opponent} in a game that will be especially relevant for the Georgia fans in the family.`,
      );
    }

    if (awayRank && !homeRank) {
      facts.push(
        `${game.home} has the home-field opportunity to knock off a ranked opponent.`,
      );
    } else if (homeRank && !awayRank) {
      facts.push(
        `${game.away} would have to beat a ranked opponent on the road to pull this one out.`,
      );
    } else if (awayRank && homeRank) {
      facts.push(
        `With both teams ranked, this is one of the stronger matchups on the Challenge slate.`,
      );
    }
  }

  if (game.sport === "Soccer") {
    facts.push(
      `${game.away} travels to ${game.home} for this ${game.competition} matchup.`,
    );

    if (hasTeam(game, "Arsenal")) {
      const opponent =
        game.home.toLowerCase().includes("arsenal")
          ? game.away
          : game.home;

      facts.push(
        `Arsenal faces ${opponent}, making this especially relevant for the Arsenal supporters in the family.`,
      );
    } else if (hasTeam(game, "Liverpool")) {
      const opponent =
        game.home.toLowerCase().includes("liverpool")
          ? game.away
          : game.home;

      facts.push(
        `Liverpool faces ${opponent}, so this one belongs on Kayla's radar.`,
      );
    } else if (hasTeam(game, "Aston Villa")) {
      const opponent =
        game.home.toLowerCase().includes("aston villa")
          ? game.away
          : game.home;

      facts.push(
        `Aston Villa faces ${opponent}, making this one especially relevant for the Villa supporters in the family.`,
      );
    } else if (hasTeam(game, "AFC Wimbledon")) {
      const opponent =
        game.home.toLowerCase().includes("afc wimbledon")
          ? game.away
          : game.home;

      facts.push(
        `AFC Wimbledon faces ${opponent}, so this is one of Emily's clubs to follow.`,
      );
    }

    facts.push(
      `Because this is ${game.competition}, the result counts toward that competition rather than a separate league or cup.`,
    );
  }

  if (facts.length < 2) {
    facts.push(
      `${game.away} visits ${game.home} in the ${game.competition}.`,
    );
  }

  if (facts.length < 3) {
    facts.push(
      `Kickoff: ${formatGameDate(game.startsAt)} at ${formatGameTime(
        game.startsAt,
        game.startTimeTbd,
      )}.`,
    );
  }

  return facts.slice(0, 3);
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [challenge, setChallenge] =
    useState<Challenge | null>(null);

  const [leaderboard, setLeaderboard] =
    useState<LeaderboardRow[]>([]);

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

  const [trophyRoomOpen, setTrophyRoomOpen] =
    useState(false);

  const [lockerRoomOpen, setLockerRoomOpen] =
    useState(false);

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [profileLoading, setProfileLoading] =
    useState(false);

  const [profileSaving, setProfileSaving] =
    useState(false);

  const [profileError, setProfileError] =
    useState<string | null>(null);

  const [profileDisplayName, setProfileDisplayName] =
    useState("");

  const [profileInitials, setProfileInitials] =
    useState("");

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

  const [activeSection, setActiveSection] =
    useState<"Home" | "Challenge" | "Games" | "Locker Room" | "Trophy Room">("Home");

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

  const [expandedGameIds, setExpandedGameIds] =
    useState<string[]>([]);

  const [gameRoomGame, setGameRoomGame] =
    useState<BrowserGame | null>(null);

  const [gameRoomMessages, setGameRoomMessages] =
    useState<GameRoomMessage[]>([]);

  const [gameRoomMessage, setGameRoomMessage] =
    useState("");

  const [gameRoomLoading, setGameRoomLoading] =
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

  async function openGameRoom(game: BrowserGame) {
    if (!signedInPlayer) {
      setLoadError("Choose your player before entering a Game Room.");
      return;
    }

    setGameRoomGame(game);
    setGameRoomMessages([]);
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

    await Promise.all([
      loadGameRoomMessages(game),
      loadGameRoomPicks(game),
    ]);
  }

  useEffect(() => {
    if (!gameRoomGame || !signedInPlayer) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`game-room-${gameRoomGame.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_room_events",
          filter: `game_id=eq.${gameRoomGame.id}`,
        },
        async (payload) => {
          const event = payload.new as {
            event_type?: string;
            player_id?: string | null;
          };

          if (event.event_type === "typing") {
            if (
              event.player_id &&
              event.player_id !== signedInPlayer.id
            ) {
              const typingPlayer =
                players.find(
                  (player) => player.id === event.player_id,
                );

              setGameRoomTypingName(
                typingPlayer?.display_name ?? "Someone",
              );

              if (gameRoomTypingTimeoutRef.current) {
                clearTimeout(
                  gameRoomTypingTimeoutRef.current,
                );
              }

              gameRoomTypingTimeoutRef.current =
                setTimeout(() => {
                  setGameRoomTypingName(null);
                }, 2500);
            }

            return;
          }

          if (event.event_type === "message") {
            setGameRoomTypingName(null);
            await loadGameRoomMessages(gameRoomGame);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);

      if (gameRoomTypingTimeoutRef.current) {
        clearTimeout(gameRoomTypingTimeoutRef.current);
      }

      setGameRoomTypingName(null);
    };
  }, [gameRoomGame?.id, signedInPlayer?.id, players]);

  function closeGameRoom() {
    setGameRoomGame(null);
    setGameRoomMessages([]);
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

        setRealGames((currentGames) =>
          currentGames.map((game) =>
            game.id === updatedGame.id
              ? {
                  ...game,
                  startsAt: updatedGame.startsAt,
                  startTimeTbd:
                    updatedGame.startTimeTbd,
                  homeScore: updatedGame.homeScore,
                  awayScore: updatedGame.awayScore,
                  status: updatedGame.status,
                }
              : game,
          ),
        );
      } catch (error) {
        console.error(
          "Game Room score refresh failed:",
          error,
        );
      }
    }

    void refreshGameRoomGame();

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

  async function openProfile() {
    if (!signedInPlayer) return;

    const sessionToken =
      window.localStorage.getItem(
        "fambam_session_token",
      );

    setProfileOpen(true);
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

      setProfileFavoriteTeamIds(
        favorites,
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
              Number(row.picks_made) || 0;
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

      if (storedPlayerId) {
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
        }
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

  const filteredGames =
    activeSport === "All"
      ? watchGames
      : watchGames.filter(
          (game) =>
            game.sport === activeSport,
        );

  const challengeGames =
    realGames.filter((game) =>
      challengeGameIds.includes(game.id),
    );

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

  function toggleGameDetails(gameId: string) {
    setExpandedGameIds((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : [...current, gameId],
    );
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

      setChallengePickStatus(
        (current) => ({
          ...current,
          [signedInPlayer.id]:
            totalSaved,
        }),
      );

      setPicksSuccess(
        totalSaved ===
          challengeGames.length
          ? `You're all set! ${totalSaved}/${challengeGames.length} picks saved. ✅`
          : `${totalSaved}/${challengeGames.length} picks saved. Come back anytime to finish!`,
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
    challengeGamesWithSavedPick ===
      challengeGames.length;

  return (
    <main className="min-h-screen bg-[#eef1f4] pb-24 text-[#10254a]">
      {/* DARK APP HEADER */}
      <header className="bg-[#06284a] text-white">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/70 bg-[#f3c64f] text-[10px] font-black text-[#06284a]">
                {signedInPlayer.initials}
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
            <a
              href="#signin"
              className="rounded-xl bg-[#f3c64f] px-4 py-2 text-xs font-black text-[#06284a]"
            >
              Sign In
            </a>
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
                        {challengeGames.length - challengeGamesWithSavedPick} picks left
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

        {/* BOTTOM DASHBOARD ROW */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          {/* WHO'S READY */}
          <section className="min-w-0 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span>👥</span>
              <h2 className="text-[12px] font-black uppercase">
                Who&apos;s Ready?
              </h2>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1">
              {players.map((player) => {
                const count = challengePickStatus[player.id] ?? 0;
                const ready =
                  challengeGames.length > 0 &&
                  count === challengeGames.length;

                return (
                  <div
                    key={player.id}
                    className="min-w-0 text-center"
                  >
                    <div
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[8px] font-black ${
                        signedInPlayer?.id === player.id
                          ? "bg-[#06284a] text-white"
                          : "bg-slate-200 text-[#10254a]"
                      }`}
                    >
                      {player.initials ?? "?"}
                    </div>

                    <div
                      className={`mt-0.5 whitespace-nowrap text-[6px] font-black ${
                        ready ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {ready
                        ? "All set! ✓"
                        : `${Math.max(
                            0,
                            challengeGames.length - count,
                          )} left`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ON YOUR RADAR */}
          <section className="min-w-0 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span>🔥</span>
              <h2 className="text-[12px] font-black uppercase">
                On Your Radar
              </h2>
            </div>

            <div className="mt-2 space-y-1.5">
              {/* Challenge status always gets the first spot */}
              <button
                onClick={openPicks}
                className="flex w-full gap-1.5 text-left text-[8px] font-semibold leading-tight"
              >
                <span>{currentPlayerReady ? "✅" : "🏆"}</span>
                <span>
                  {currentPlayerReady
                    ? "Your Challenge picks are complete."
                    : `${Math.max(
                        0,
                        challengeGames.length -
                          challengeGamesWithSavedPick,
                      )} Challenge picks left.`}
                </span>
              </button>

              {/* Best upcoming games based on FamBam watch scoring */}
              {filteredGames
                .filter((game) => {
                  if (!game.startsAt) return false;

                  return (
                    new Date(game.startsAt).getTime() >
                    (currentTime ?? Date.now())
                  );
                })
                .sort((a, b) => {
                  const scoreDifference =
                    getWatchInfo(
                      b,
                      collegeFootballRankings,
                    ).score -
                    getWatchInfo(
                      a,
                      collegeFootballRankings,
                    ).score;

                  if (scoreDifference !== 0) {
                    return scoreDifference;
                  }

                  return (
                    new Date(a.startsAt!).getTime() -
                    new Date(b.startsAt!).getTime()
                  );
                })
                .slice(0, 4)
                .map((game) => {
                  const watchInfo = getWatchInfo(
                    game,
                    collegeFootballRankings,
                  );

                  return (
                    <div
                      key={game.id}
                      className="flex gap-1.5 text-[8px] font-semibold leading-tight"
                    >
                      <span>{game.icon}</span>

                      <span className="min-w-0">
                        <span className="font-black">
                          {watchInfo.label}
                        </span>
                        {" · "}
                        {game.sport === "College Football"
                          ? rankedTeamLabel(
                              game.away,
                              collegeFootballRankings,
                            )
                          : game.away}
                        {" vs "}
                        {game.sport === "College Football"
                          ? rankedTeamLabel(
                              game.home,
                              collegeFootballRankings,
                            )
                          : game.home}
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>

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

          <div className="divide-y divide-slate-200 px-3">
            {filteredGames
              .filter((game) => {
                if (!game.startsAt) return false;

                const gameDate = new Date(game.startsAt);

                const gameDay = gameDate.toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                const todayDay = new Date(currentTime ?? Date.now()).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                return gameDay === todayDay;
              })
              .slice(0, 2)
              .map((game) => (
              <article
                key={game.id}
                className="py-3"
              >
                <div className="flex gap-3">
                  <div className="flex w-12 shrink-0 flex-col items-center justify-center text-center">
                    <div className="text-2xl">{game.icon}</div>
                    <div className="mt-1 text-[7px] font-black uppercase leading-tight text-[#10254a]">
                      {game.competition}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-black leading-tight text-[#10254a]">
                      {game.sport === "College Football"
                        ? rankedTeamLabel(game.away, collegeFootballRankings)
                        : game.away}
                      {" vs "}
                      {game.sport === "College Football"
                        ? rankedTeamLabel(game.home, collegeFootballRankings)
                        : game.home}
                    </div>

                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {formatGameTime(game.startsAt, game.startTimeTbd)}
                    </div>

                    <div className="mt-2 rounded-md bg-[#edf5ff] px-2 py-1 text-[10px] font-semibold text-[#284d7e]">
                      {getGameContext(game, collegeFootballRankings)}
                    </div>

                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => toggleGameDetails(game.id)}
                        className="rounded-lg bg-[#eef2f6] px-3 py-1.5 text-[10px] font-black text-[#06284a]"
                      >
                        {expandedGameIds.includes(game.id)
                          ? "Show Less ↑"
                          : "Tell Me More →"}
                      </button>

                      <button
                        onClick={() => openGameRoom(game)}
                        className="ml-2 rounded-lg bg-[#06284a] px-3 py-1.5 text-[10px] font-black text-white"
                      >
                        Game Room 💬
                      </button>

                      {expandedGameIds.includes(game.id) && (
                        <div className="mt-2 rounded-lg bg-[#f8f6ef] p-2.5">
                          <ul className="space-y-1 text-[10px] font-semibold leading-snug text-slate-600">
                            {getGameFacts(
                              game,
                              collegeFootballRankings,
                            ).map((fact) => (
                              <li key={fact}>• {fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!gamesLoading &&
              filteredGames.filter((game) => {
                if (!game.startsAt) return false;

                const gameDay = new Date(game.startsAt).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                const todayDay = new Date(currentTime ?? Date.now()).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                });

                return gameDay === todayDay;
              }).length === 0 && (
              <div className="py-5 text-center text-xs font-bold text-slate-500">
                No games on your radar today.
              </div>
            )}
          </div>
        </section>

        {/* UP NEXT */}
        <section className="mb-2.5 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">◷</span>
              <h2 className="text-base font-black uppercase">
                Up Next
              </h2>
            </div>

            <div className="text-[10px] font-black uppercase">
              This Week
            </div>
          </div>

          <div className="divide-y divide-slate-200 px-3">
            {challengeGames
              .filter((game) => !gameIsLocked(game, currentTime))
              .sort(
                (a, b) =>
                  (a.startsAt
                    ? new Date(a.startsAt).getTime()
                    : Number.MAX_SAFE_INTEGER) -
                  (b.startsAt
                    ? new Date(b.startsAt).getTime()
                    : Number.MAX_SAFE_INTEGER),
              )
              .slice(0, 2)
              .map((game) => (
                <article key={game.id} className="py-3">
                  <div className="flex gap-3">
                    <div className="flex w-12 shrink-0 flex-col items-center justify-center text-center">
                      <div className="text-2xl">{game.icon}</div>
                      <div className="mt-1 text-[7px] font-black uppercase leading-tight">
                        {game.competition}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-black leading-tight">
                        {game.sport === "College Football"
                          ? rankedTeamLabel(game.away, collegeFootballRankings)
                          : game.away}
                        {" vs "}
                        {game.sport === "College Football"
                          ? rankedTeamLabel(game.home, collegeFootballRankings)
                          : game.home}
                      </div>

                      <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        {formatGameDate(game.startsAt)}
                        {" · "}
                        {formatGameTime(game.startsAt, game.startTimeTbd)}
                      </div>

                      <div className="mt-2 rounded-md bg-[#edf5ff] px-2 py-1 text-[10px] font-semibold text-[#284d7e]">
                        {getGameContext(game, collegeFootballRankings)}
                      </div>

                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => toggleGameDetails(game.id)}
                          className="rounded-lg bg-[#edf5ff] px-3 py-1.5 text-[10px] font-black text-[#164d9b]"
                        >
                          Tell Me More →
                        </button>

                        <button
                          onClick={() => openGameRoom(game)}
                          className="rounded-lg bg-[#06284a] px-3 py-1.5 text-[10px] font-black text-white"
                        >
                          Game Room 💬
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
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
              Big games, FamBam teams, rivalries and matchups worth your time.
            </p>
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
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

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="divide-y divide-slate-200 px-3">
              {filteredGames.map((game) => {
                const watchInfo =
                  getWatchInfo(game, collegeFootballRankings);

                let label = "Games to Watch";

                if (watchInfo.score >= 95) {
                  label = "Must Watch";
                } else if (watchInfo.score >= 90) {
                  label = "Big Game";
                } else if (
                  hasTeam(game, "Georgia") ||
                  hasTeam(game, "Kentucky") ||
                  hasTeam(game, "Arsenal") ||
                  hasTeam(game, "Liverpool") ||
                  hasTeam(game, "Aston Villa") ||
                  hasTeam(game, "AFC Wimbledon")
                ) {
                  label = "FamBam Game";
                }

                return (
                  <article key={game.id} className="py-4">
                    <div className="flex gap-3">
                      <div className="flex w-12 shrink-0 flex-col items-center justify-start text-center">
                        <div className="text-2xl">{game.icon}</div>
                        <div className="mt-1 text-[7px] font-black uppercase leading-tight text-[#10254a]">
                          {game.competition}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#fff3c4] px-2 py-1 text-[8px] font-black uppercase text-[#8a6618]">
                            {label}
                          </span>

                          <span className="text-[9px] font-bold text-slate-400">
                            {formatGameDate(game.startsAt)}
                          </span>
                        </div>

                        <div className="text-[15px] font-black leading-tight text-[#10254a]">
                          {game.sport === "College Football"
                            ? rankedTeamLabel(
                                game.away,
                                collegeFootballRankings,
                              )
                            : game.away}
                          {" vs "}
                          {game.sport === "College Football"
                            ? rankedTeamLabel(
                                game.home,
                                collegeFootballRankings,
                              )
                            : game.home}
                        </div>

                        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          {formatGameTime(
                            game.startsAt,
                            game.startTimeTbd,
                          )}
                        </div>

                        <div className="mt-2 rounded-md bg-[#edf5ff] px-2 py-1 text-[10px] font-semibold text-[#284d7e]">
                          {getGameContext(
                            game,
                            collegeFootballRankings,
                          )}
                        </div>

                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() =>
                              toggleGameDetails(game.id)
                            }
                            className="rounded-lg bg-[#eef2f6] px-3 py-1.5 text-[10px] font-black text-[#06284a]"
                          >
                            {expandedGameIds.includes(game.id)
                              ? "Show Less ↑"
                              : "Tell Me More →"}
                          </button>

                          <button
                            onClick={() => openGameRoom(game)}
                            className="rounded-lg bg-[#06284a] px-3 py-1.5 text-[10px] font-black text-white"
                          >
                            Game Room 💬
                          </button>
                        </div>

                        {expandedGameIds.includes(game.id) && (
                          <div className="mt-2 rounded-lg bg-[#f8f6ef] p-2.5">
                            <ul className="space-y-1 text-[10px] font-semibold leading-snug text-slate-600">
                              {getGameFacts(
                                game,
                                collegeFootballRankings,
                              ).map((fact) => (
                                <li key={fact}>• {fact}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {!gamesLoading && filteredGames.length === 0 && (
                <div className="py-8 text-center">
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
          </div>
        </section>
      )}

      {profileOpen && signedInPlayer && (
        <div className="fixed inset-0 z-[140] overflow-y-auto bg-[#eef1f4]">
          <div className="sticky top-0 z-20 border-b border-white/10 bg-[#06284a] text-white shadow-sm">
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

              <button
                onClick={() =>
                  setProfileOpen(false)
                }
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black active:bg-white/20"
              >
                Close ✕
              </button>
            </div>
          </div>

          <div
            className="mx-auto max-w-2xl px-3 py-4"
            style={{
              paddingBottom:
                "calc(env(safe-area-inset-bottom, 0px) + 30px)",
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
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-[#f3c64f] text-sm font-black text-[#06284a]">
                      {profileInitials ||
                        signedInPlayer.initials ||
                        "FB"}
                    </div>

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

                                <div className="flex shrink-0 items-center gap-2">
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
                  onClick={() =>
                    void saveProfile()
                  }
                  disabled={profileSaving}
                  className="mt-4 w-full rounded-2xl bg-[#f3c64f] px-4 py-4 text-sm font-black text-[#06284a] shadow-sm disabled:opacity-60"
                >
                  {profileSaving
                    ? "Saving…"
                    : "Save My Profile ✓"}
                </button>

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
        <section className="mx-auto max-w-5xl px-3 py-4">
          <div className="mb-3">
            <div className="text-lg font-black text-[#06284a]">
              Locker Room
            </div>
            <div className="text-[10px] font-bold text-slate-500">
              {signedInPlayer?.display_name
                ? `${signedInPlayer.display_name}'s sports`
                : "Your sports"}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
            <img
              src="/locker-room-preview.png"
              alt="FamBam Locker Room preview"
              className="h-auto w-full"
            />
          </div>

          <div className="mx-auto mt-3 max-w-md rounded-xl bg-[#fffaf0] px-4 py-3 text-center">
            <div className="text-xs font-black text-[#06284a]">
              👥 Your Locker Room is coming!
            </div>
            <div className="mt-1 text-[10px] font-semibold text-slate-500">
              Your teams, sports and personal FamBam setup will live here.
            </div>
          </div>
        </section>
      )}

      {activeSection === "Trophy Room" && (
        <section className="mx-auto max-w-5xl px-3 py-4">
          <div className="mb-3">
            <div className="text-lg font-black text-[#06284a]">
              Trophy Room
            </div>
            <div className="text-[10px] font-bold text-slate-500">
              {signedInPlayer?.display_name
                ? `${signedInPlayer.display_name}'s achievements`
                : "FamBam achievements"}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
            <img
              src="/trophy-room-preview.png"
              alt="FamBam Trophy Room preview"
              className="h-auto w-full"
            />
          </div>

          <div className="mx-auto mt-3 max-w-md rounded-xl bg-[#fffaf0] px-4 py-3 text-center">
            <div className="text-xs font-black text-[#06284a]">
              🏆 Trophy Room is coming to life!
            </div>
            <div className="mt-1 text-[10px] font-semibold text-slate-500">
              Your real trophies, records, streaks and Sports Passport
              will live here.
            </div>
          </div>
        </section>
      )}

      {/* APP NAV */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#06284a] text-white shadow-[0_-4px_18px_rgba(0,0,0,0.18)]">
        <div
          className="mx-auto grid max-w-5xl grid-cols-5"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            paddingTop: "6px",
          }}
        >
          {[
            ["🏠", "Home"],
            ["🏆", "Challenge"],
            ["⚽", "Games"],
            ["👥", "Locker Room"],
            ["▥", "Trophy Room"],
          ].map(([icon, label], index) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Home") {
                  setActiveSection("Home");
                  setActiveSport("All");
                }

                if (label === "Challenge") {
                  openPicks();
                }

                if (label === "Games") {
                  setActiveSection("Games");
                  setActiveSport("All");
                }

                if (label === "Locker Room") {
                  setActiveSection("Locker Room");
                }

                if (label === "Trophy Room") {
                  setActiveSection("Trophy Room");
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
                    {gameRoomGame.icon} Game Room
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
                  aria-label="Close Game Room"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-4 rounded-2xl bg-[#edf5ff] p-3 text-xs font-semibold text-[#284d7e]">
                {getGameContext(
                  gameRoomGame,
                  collegeFootballRankings,
                )}
              </div>

              {/* FAMBAM SPORTS DESK */}
              <div className="mb-4 overflow-hidden rounded-2xl border border-[#e8dba8] bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 bg-[#06284a] px-3 py-2 text-white">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#f3c64f]">
                      FamBam Sports Desk
                    </div>

                    <div className="mt-0.5 text-xs font-black">
                      {gameRoomGame.status === "final"
                        ? "🏁 Final"
                        : gameRoomGame.homeScore !== null ||
                            gameRoomGame.awayScore !== null
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
                  {(gameRoomGame.homeScore !== null ||
                    gameRoomGame.awayScore !== null) && (
                    <div className="rounded-xl bg-[#f7f4ec] px-3 py-3 text-center">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                        {gameRoomGame.status === "final"
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

                  {gameRoomGame.homeScore === null &&
                    gameRoomGame.awayScore === null && (
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

              {gameRoomLoading && (
                <div className="py-10 text-center text-sm font-bold text-slate-500">
                  Opening the Game Room…
                </div>
              )}

              {!gameRoomLoading &&
                gameRoomMessages.length === 0 &&
                gameRoomLiveEvents.length === 0 && (
                  <div className="py-10 text-center">
                    <div className="text-3xl">🛋️</div>
                    <div className="mt-2 text-sm font-black text-[#06284a]">
                      The couch is empty!
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      Be the first to say something about this game.
                    </div>
                  </div>
                )}

              <div className="space-y-3">
                {[
                  ...gameRoomMessages.map(
                    (message) => ({
                      kind: "message" as const,
                      created_at:
                        message.created_at,
                      message,
                    }),
                  ),
                  ...gameRoomLiveEvents.map(
                    (event) => ({
                      kind: "live" as const,
                      created_at:
                        event.created_at,
                      event,
                    }),
                  ),
                ]
                  .sort(
                    (a, b) =>
                      new Date(
                        a.created_at,
                      ).getTime() -
                      new Date(
                        b.created_at,
                      ).getTime(),
                  )
                  .map((item) => {
                    if (item.kind === "live") {
                      return (
                        <div
                          key={item.event.id}
                          className="flex justify-center py-1"
                        >
                          <div className="max-w-[92%] rounded-2xl border border-[#f3c64f]/50 bg-[#fff8dc] px-3 py-2 text-center shadow-sm">
                            <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#9a7414]">
                              FamBam Live
                            </div>

                            <div className="mt-0.5 text-xs font-black text-[#06284a]">
                              {item.event.message}
                            </div>

                            <div className="mt-1 text-[9px] font-semibold text-slate-400">
                              {new Date(
                                item.event.created_at,
                              ).toLocaleTimeString(
                                [],
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const message =
                      item.message;

                    const mine =
                      message.player_id ===
                      signedInPlayer.id;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${
                          mine
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[82%] ${
                            mine
                              ? "text-right"
                              : "text-left"
                          }`}
                        >
                          <div
                            className={`mb-1 flex items-center gap-1.5 ${
                              mine
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f3c64f] text-[9px] font-black text-[#06284a]">
                              {
                                message.player_initials
                              }
                            </div>

                            <span className="text-[10px] font-black text-slate-500">
                              {
                                message.player_name
                              }
                            </span>
                          </div>

                          <div
                            className={`inline-block rounded-2xl px-3 py-2 text-sm font-semibold ${
                              mine
                                ? "rounded-br-md bg-[#06284a] text-white"
                                : "rounded-bl-md bg-white text-slate-800 shadow-sm"
                            }`}
                          >
                            {message.message}
                          </div>

                          <div className="mt-1 text-[9px] font-semibold text-slate-400">
                            {new Date(
                              message.created_at,
                            ).toLocaleTimeString(
                              [],
                              {
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {gameRoomTypingName && (
                  <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span>
                      {gameRoomTypingName} is typing
                    </span>
                    <span className="inline-flex gap-0.5">
                      <span className="animate-pulse">•</span>
                      <span className="animate-pulse">•</span>
                      <span className="animate-pulse">•</span>
                    </span>
                  </div>
                )}

                <div ref={gameRoomBottomRef} />
              </div>

              {gameRoomError && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  {gameRoomError}
                </div>
              )}
            </div>

            <div
              className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2"
              style={{
                paddingBottom:
                  "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="mb-2 flex justify-center gap-2">
                {["😱", "🔥", "👀", "🙌", "😂"].map(
                  (reaction) => (
                    <button
                      key={reaction}
                      onClick={() =>
                        sendGameRoomMessage(reaction)
                      }
                      disabled={gameRoomSending}
                      className="flex h-9 w-11 items-center justify-center rounded-full bg-[#f7f4ec] text-lg active:scale-95 disabled:opacity-50"
                    >
                      {reaction}
                    </button>
                  ),
                )}
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={gameRoomMessage}
                  onChange={(event) => {
                    const value =
                      event.target.value.slice(0, 500);

                    setGameRoomMessage(value);

                    if (value.trim()) {
                      void signalGameRoomTyping();
                    }
                  }}
                  placeholder={`Message the FamBam…`}
                  rows={1}
                  className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl border border-slate-200 bg-[#f7f4ec] px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:border-[#f3c64f]"
                />

                <button
                  onClick={() =>
                    sendGameRoomMessage()
                  }
                  disabled={
                    gameRoomSending ||
                    !gameRoomMessage.trim()
                  }
                  className="h-11 rounded-2xl bg-[#f3c64f] px-4 text-xs font-black text-[#06284a] disabled:opacity-40"
                >
                  {gameRoomSending ? "…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
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
                                <div className="mt-3 text-lg font-black text-slate-950">
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

                                <p className="mt-1 text-sm font-semibold leading-snug text-slate-600">
                                  {getGameContext(
                                    game,
                                    collegeFootballRankings,
                                  )}
                                </p>

                                <button
                                  onClick={() =>
                                    toggleGameDetails(game.id)
                                  }
                                  className="mt-2 text-xs font-black text-[#164d75]"
                                >
                                  {expandedGameIds.includes(game.id)
                                    ? "Show Less ↑"
                                    : "Tell Me More →"}
                                </button>

                                {expandedGameIds.includes(game.id) && (
                                  <div className="mt-2 rounded-xl bg-[#f8f6ef] p-3">
                                    <ul className="space-y-1.5 text-xs font-semibold text-slate-600">
                                      {getGameFacts(
                                        game,
                                        collegeFootballRankings,
                                      ).map((fact) => (
                                        <li key={fact}>• {fact}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                <div className="mt-4 rounded-xl bg-slate-100 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs font-black text-slate-500">
                                      🔒 PICKS LOCKED
                                    </div>

                                    {challengeRevealedPicks[game.id] ? (
                                      <div className="rounded-full bg-[#e8f0fb] px-2 py-1 text-[9px] font-black text-[#06284a]">
                                        👀 REVEALED
                                      </div>
                                    ) : (
                                      <div className="text-[10px] font-bold text-slate-400">
                                        Waiting for kickoff
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-3 rounded-xl bg-white p-3">
                                    <div className="text-[9px] font-black uppercase tracking-wide text-[#b28a2e]">
                                      Your Pick
                                    </div>

                                    <div className="mt-1 text-base font-black text-[#10254a]">
                                      {choice === "away"
                                        ? game.sport === "College Football"
                                          ? rankedTeamLabel(
                                              game.away,
                                              collegeFootballRankings,
                                            )
                                          : game.away
                                        : choice === "home"
                                          ? game.sport === "College Football"
                                            ? rankedTeamLabel(
                                                game.home,
                                                collegeFootballRankings,
                                              )
                                            : game.home
                                          : choice === "draw"
                                            ? "Draw"
                                            : saved
                                              ? "✓ Pick saved"
                                              : "No pick saved"}
                                    </div>

                                    {choice && (
                                      <div className="mt-1 text-[10px] font-black text-emerald-700">
                                        ✓ YOUR PICK
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {challengeRevealedPicks[game.id] && (
                                  <div className="mt-3 rounded-2xl border border-[#e3dccd] bg-[#f8f6ef] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#b28a2e]">
                                          👀 FamBam Picks
                                        </div>
                                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                                          Kickoff happened — everybody's picks are out!
                                        </div>
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

                                                <div className="mt-0.5 truncate text-xs font-black text-[#10254a]">
                                                  {pickLabel}
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
                                <div className="mt-3 text-lg font-black text-slate-950">
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

                                <p className="mt-1 text-sm font-semibold leading-snug text-slate-600">
                                  {getGameContext(
                                    game,
                                    collegeFootballRankings,
                                  )}
                                </p>

                                <button
                                  onClick={() =>
                                    toggleGameDetails(game.id)
                                  }
                                  className="mt-2 text-xs font-black text-[#164d75]"
                                >
                                  {expandedGameIds.includes(game.id)
                                    ? "Show Less ↑"
                                    : "Tell Me More →"}
                                </button>

                                {expandedGameIds.includes(game.id) && (
                                  <div className="mt-2 rounded-xl bg-[#f8f6ef] p-3">
                                    <ul className="space-y-1.5 text-xs font-semibold text-slate-600">
                                      {getGameFacts(
                                        game,
                                        collegeFootballRankings,
                                      ).map((fact) => (
                                        <li key={fact}>• {fact}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

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
