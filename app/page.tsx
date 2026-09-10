"use client";

import { useEffect, useState } from "react";
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
  | "College Basketball";

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

  return "SCHEDULED";
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

    if (awayRank) facts.push(`${game.away} is ranked #${awayRank} in the latest AP Top 25.`);
    if (homeRank) facts.push(`${game.home} is ranked #${homeRank} in the latest AP Top 25.`);

    if (hasTeam(game, "Kentucky")) {
      facts.push("Kentucky is one of the FamBam must-in teams for the weekly Challenge.");
    } else if (hasTeam(game, "Georgia")) {
      facts.push("Georgia is one of the FamBam must-in teams for the weekly Challenge.");
    }
  }

  if (game.sport === "Soccer") {
    facts.push(`This match is in the ${game.competition}.`);
    if (
      hasTeam(game, "Arsenal") ||
      hasTeam(game, "Liverpool") ||
      hasTeam(game, "Aston Villa") ||
      hasTeam(game, "AFC Wimbledon")
    ) {
      facts.push("A FamBam-supported club is playing.");
    }
    facts.push("Soccer picks can be home win, draw, or away win.");
  }

  if (facts.length < 2) {
    facts.push(`Kickoff: ${formatGameDate(game.startsAt)} at ${formatGameTime(game.startsAt, game.startTimeTbd)}.`);
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
  const [pinError, setPinError] =
    useState<string | null>(null);

  const [checkingPin, setCheckingPin] =
    useState(false);

  const [activeSport, setActiveSport] =
    useState<Sport>("All");

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
              game.sport === "Soccer",
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
                : "🏈",
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
  const watchGames = thisWeekGames.filter((game) => {
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
    setSelectedPlayer(player);
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

    setPicksOpen(true);
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
              onClick={switchPlayer}
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
                  Tap to switch
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
            {/* PERSONALIZED HERO */}
            <section className="relative mb-2.5 overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-r from-[#082f57] via-[#0b3d6a] to-[#082f57] px-4 py-4 text-white shadow-sm">
              <div className="absolute -right-8 -top-12 h-32 w-32 rounded-full border-[18px] border-white/5" />
              <div className="absolute -bottom-16 left-1/3 h-36 w-36 rounded-full border-[20px] border-[#f3c64f]/10" />

              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <div className="text-xl font-black italic">
                    Same teams.
                  </div>
                  <div className="font-serif text-3xl italic text-[#f3c64f]">
                    More fun.
                  </div>
                </div>

                <div className="max-w-[48%] text-right">
                  <div className="text-sm font-black">
                    It&apos;s a good week
                  </div>
                  <div className="text-sm font-black">
                    for {signedInPlayer.display_name}.
                  </div>
                  <div className="mt-2 ml-auto h-0.5 w-16 rotate-[-8deg] rounded bg-[#f3c64f]" />
                </div>
              </div>
            </section>

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
            {filteredGames.slice(0, 2).map((game) => (
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
                      <button className="rounded-lg bg-[#edf5ff] px-3 py-1.5 text-[10px] font-black text-[#164d9b]">
                        Tell Me More →
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!gamesLoading && filteredGames.length === 0 && (
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

                      <div className="mt-2 flex justify-end">
                        <button className="rounded-lg bg-[#edf5ff] px-3 py-1.5 text-[10px] font-black text-[#164d9b]">
                          Tell Me More →
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </section>

        {/* BOTTOM DASHBOARD ROW */}
        <div className="grid grid-cols-2 gap-2.5">
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

                    <div className="mt-1 truncate text-[7px] font-black">
                      {player.display_name}
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

          {/* WHAT MATTERS TODAY */}
          <section className="min-w-0 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span>🔥</span>
              <h2 className="text-[12px] font-black uppercase">
                What Matters Today
              </h2>
            </div>

            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1.5 text-[8px] font-semibold leading-tight">
                <span>🔵</span>
                <span>
                  Your sports are front and center.
                </span>
              </div>

              <div className="flex gap-1.5 text-[8px] font-semibold leading-tight">
                <span>🏈</span>
                <span>
                  Big college football games are coming.
                </span>
              </div>

              <div className="flex gap-1.5 text-[8px] font-semibold leading-tight">
                <span>⭐</span>
                <span>
                  {currentPlayerReady
                    ? "Your Challenge picks are complete."
                    : `${challengeGames.length - challengeGamesWithSavedPick} Challenge picks left.`}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* APP NAV */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#06284a] text-white shadow-[0_-4px_18px_rgba(0,0,0,0.18)]">
        <div className="mx-auto grid max-w-5xl grid-cols-5">
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
                if (label === "Challenge") openPicks();
              }}
              className={`relative flex min-w-0 flex-col items-center justify-center py-2 ${
                index === 0 ? "text-[#f3c64f]" : "text-white"
              }`}
            >
              <span className="text-xl leading-none">
                {icon}
              </span>
              <span className="mt-1 truncate text-[9px] font-bold">
                {label}
              </span>

              {index === 0 && (
                <span className="absolute bottom-0 h-0.5 w-10 rounded-full bg-[#f3c64f]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {picksOpen &&
        signedInPlayer &&
        challenge && (
          <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
            <div className="mx-auto max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                <div className="flex justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-200">
                      🎯 Who Ya Got?
                    </div>
                    <h2 className="mt-1 text-2xl font-black">
                      {
                        signedInPlayer.display_name
                      }
                      &apos;s Picks
                    </h2>
                  </div>

                  <button
                    onClick={closePicks}
                    className="h-9 w-9 rounded-full bg-white/15 text-xl"
                  >
                    ×
                  </button>
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
                        onClick={closePicks}
                        className="mt-5 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white"
                      >
                        Close
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
                            className="rounded-2xl border border-slate-200 p-4"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-[9px] font-black uppercase text-blue-600">
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
                              <div className="mt-4 rounded-xl bg-slate-100 p-4 text-center text-sm font-black text-slate-500">
                                🔒 Picks Locked
                              </div>
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
                                  className="mt-2 text-xs font-black text-blue-600"
                                >
                                  {expandedGameIds.includes(game.id)
                                    ? "Show Less ↑"
                                    : "Tell Me More →"}
                                </button>

                                {expandedGameIds.includes(game.id) && (
                                  <div className="mt-2 rounded-xl bg-slate-50 p-3">
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
                                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-900"
                                    }`}
                                  >
                                    <div className={`text-[9px] font-black uppercase ${
                                      choice === "away"
                                        ? "text-blue-100"
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
  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                          : "border-slate-200 bg-white text-slate-900"
                                      }`}
                                    >
                                      <div className={`text-[9px] font-black uppercase ${
                                        choice === "draw"
  ? "text-blue-100"
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
                                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-900"
                                    }`}
                                  >
                                    <div className={`text-[9px] font-black uppercase ${
                                      choice === "home"
                                        ? "text-blue-100"
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
                      className="mt-5 w-full rounded-2xl bg-blue-600 py-4 font-black text-white disabled:bg-slate-300"
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
          </div>
        )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {[
            ["🏠", "Home"],
            ["🏆", "Challenge"],
            ["📅", "Games"],
            ["🧢", "Locker Room"],
            ["🏅", "Trophy Room"],
          ].map(([icon, label], index) => (
            <button
              key={label}
              className={`flex flex-col items-center gap-1 py-1 text-[9px] font-black ${
                index === 0 ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <span className="text-lg">{icon}</span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </nav>

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
              {["🏈", "⚽", "🏀", "⚾"].map(
                (sportBall, position) => (
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
