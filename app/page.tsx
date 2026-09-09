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

  const [picksPin, setPicksPin] = useState("");

  const [picksError, setPicksError] =
    useState<string | null>(null);

  const [picksSuccess, setPicksSuccess] =
    useState<string | null>(null);

  const [checkingPicksPin, setCheckingPicksPin] =
    useState(false);

  const [savingPicks, setSavingPicks] =
    useState(false);

  const [pickChoices, setPickChoices] =
    useState<Record<string, PickChoice | null>>({});

  const [savedPickGameIds, setSavedPickGameIds] =
    useState<string[]>([]);

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

        if (challengeGameError) {
          console.error(challengeGameError);
        } else {
          setChallengeGameIds(
            (challengeGameData ?? []).map(
              (row: { game_id: string }) =>
                row.game_id,
            ),
          );
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

    const supabase = createClient();

    const { data, error } =
      await supabase.rpc(
        "verify_player_pin",
        {
          target_player_id:
            selectedPlayer.id,
          attempted_pin: pin,
        },
      );

    if (error || !data) {
      setPinError(
        "That PIN wasn't right. Try again.",
      );

      setPin("");
      setCheckingPin(false);
      return;
    }

    localStorage.setItem(
      "fambam_player_id",
      selectedPlayer.id,
    );

    setSignedInPlayer(selectedPlayer);
    setSelectedPlayer(null);
    setPin("");
    setCheckingPin(false);
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

  function openPicks() {
    if (!signedInPlayer || !challenge) {
      return;
    }

    setPicksOpen(true);
    setPicksUnlocked(false);
    setPicksPin("");
    setPicksError(null);
    setPicksSuccess(null);
    setPickChoices({});
    setSavedPickGameIds([]);
  }

  function closePicks() {
    if (savingPicks || checkingPicksPin) {
      return;
    }

    setPicksOpen(false);
    setPicksUnlocked(false);
    setPicksPin("");
    setPicksError(null);
    setPicksSuccess(null);
    setPickChoices({});
    setSavedPickGameIds([]);
  }

  function enterPicksDigit(digit: string) {
    if (
      picksPin.length >= 4 ||
      checkingPicksPin
    ) {
      return;
    }

    setPicksPin(
      (current) => current + digit,
    );

    setPicksError(null);
  }

  function deletePicksDigit() {
    if (checkingPicksPin) return;

    setPicksPin((current) =>
      current.slice(0, -1),
    );
  }

  async function unlockPicks() {
    if (
      !signedInPlayer ||
      !challenge ||
      picksPin.length !== 4
    ) {
      return;
    }

    setCheckingPicksPin(true);
    setPicksError(null);

    try {
      const supabase = createClient();

      const { data, error } =
        await supabase.rpc(
          "get_my_challenge_picks",
          {
            target_player_id:
              signedInPlayer.id,
            target_challenge_id:
              challenge.id,
            attempted_pin:
              picksPin,
          },
        );

      if (error) {
        throw new Error(
          error.message
            .toLowerCase()
            .includes("pin")
            ? "That PIN wasn't right. Try again."
            : "Could not open your picks.",
        );
      }

      const saved =
        (data ?? []) as SavedPick[];

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

      setPicksPin("");
    } finally {
      setCheckingPicksPin(false);
    }
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
      !picksUnlocked ||
      picksPin.length !== 4
    ) {
      return;
    }

    const gamesToSave = availablePickGames.filter(
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
      const supabase = createClient();

      for (const game of gamesToSave) {
        const choice = pickChoices[game.id];

        if (!choice) continue;

        const { error } =
          await supabase.rpc(
            "save_player_pick",
            {
              target_player_id:
                signedInPlayer.id,
              target_game_id:
                game.id,
              target_challenge_id:
                challenge.id,
              attempted_pin:
                picksPin,
              target_pick_choice:
                choice,
            },
          );

        if (error) {
          throw new Error(
            `Could not save ${game.away} at ${game.home}.`,
          );
        }
      }

      setSavedPickGameIds((current) => [
        ...new Set([
          ...current,
          ...gamesToSave.map(
            (game) => game.id,
          ),
        ]),
      ]);

      const totalSaved = new Set([
        ...savedPickGameIds,
        ...gamesToSave.map(
          (game) => game.id,
        ),
      ]).size;

      setPicksSuccess(
        totalSaved === challengeGames.length
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
    challengeGames.filter((game) =>
      savedPickGameIds.includes(game.id),
    ).length;

  const currentPlayerReady =
    challengeGames.length > 0 &&
    challengeGamesWithSavedPick ===
      challengeGames.length;

  return (
    <main className="min-h-screen bg-[#f6f8fc] pb-24 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-xl">
              🏆
            </div>

            <div>
              <h1 className="text-lg font-black">
                FamBam Sports
              </h1>
              <p className="text-xs font-semibold text-slate-400">
                Who ya got?
              </p>
            </div>
          </div>

          {signedInPlayer ? (
            <button
              onClick={switchPlayer}
              className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700"
            >
              {signedInPlayer.display_name}
              {signedInPlayer.is_admin
                ? " 👑"
                : ""}{" "}
              · Switch
            </button>
          ) : (
            <a
              href="#signin"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white"
            >
              Sign In
            </a>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {!signedInPlayer && (
          <section
            id="signin"
            className="mb-5 rounded-[2rem] bg-gradient-to-br from-blue-700 to-indigo-600 p-5 text-white"
          >
            <div className="text-center">
              <div className="text-3xl">
                👋
              </div>
              <h2 className="mt-2 text-2xl font-black">
                Who&apos;s playing?
              </h2>
            </div>

            {loading ? (
              <p className="mt-5 text-center">
                Loading...
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() =>
                      choosePlayer(player)
                    }
                    className="rounded-2xl bg-white/10 p-3"
                  >
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-xs font-black text-blue-700">
                      {player.initials}
                    </div>
                    <div className="mt-2 text-sm font-black">
                      {player.display_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-100">
              🎯 FamBam Challenge
            </div>

            <h2 className="mt-2 text-2xl font-black">
              {challenge?.name ??
                "No Challenge Open"}
            </h2>

            <p className="mt-1 text-sm text-blue-100">
              {challengeGameIds.length}/10 picks selected
            </p>

            {signedInPlayer && (
              <div className="mt-5 rounded-2xl bg-white/10 p-4">
                <div className="text-sm font-bold text-blue-100">
                  {signedInPlayer.display_name}
                  &apos;s Picks
                </div>

                <div className="mt-1 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-black">
                      {currentPlayerReady
                        ? "Locked In! 🔒"
                        : "Who Ya Got?"}
                    </div>
                  </div>

                  <button
                    onClick={openPicks}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-black text-blue-700"
                  >
                    {currentPlayerReady
                      ? "View / Edit →"
                      : "Make My Picks →"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-5">
            <h3 className="font-black">
              Challenge Games
            </h3>

            <div className="mt-4 grid gap-3">
              {challengeGames.map((game) => (
                <div
                  key={game.id}
                  className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
                >
                  <div className="text-[9px] font-black uppercase text-blue-600">
                    {game.competition}
                  </div>

                  <div className="mt-1 font-black">
                    {game.away} at {game.home}
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
              ))}
            </div>
          </div>
        </section>

        {challenge && (
          <section className="mt-8">
            <div className="mb-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                Bragging Rights
              </div>
              <h2 className="text-2xl font-black">
                🏆 Challenge Leaderboard
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                1 point per correct completed pick.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {leaderboard.map((row, index) => (
                <div
                  key={row.player_id}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-700">
                    {index === 0 && row.points > 0
                      ? "🏆"
                      : index + 1}
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xs font-black text-blue-700">
                    {row.initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-950">
                      {row.display_name}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {row.completed_picks > 0
                        ? `${row.correct}/${row.completed_picks} correct · ${Number(
                            row.accuracy,
                          ).toFixed(1)}%`
                        : row.total_picks > 0
                          ? `${row.total_picks} pick${
                              row.total_picks === 1 ? "" : "s"
                            } waiting for results`
                          : "No picks yet"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-slate-950">
                      {row.points}
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                👀 This Week
              </div>
              <h2 className="text-2xl font-black">
                Games to Watch
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Every Top-10 game, ranked-vs-ranked matchup, FamBam game and major rivalry worth watching this week.
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto">
            {sportButtons.map((sport) => (
              <button
                key={sport}
                onClick={() =>
                  setActiveSport(sport)
                }
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  activeSport === sport
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-500"
                }`}
              >
                {sport}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredGames.map((game) => {
              const inChallenge =
                challengeGameIds.includes(
                  game.id,
                );

              const watchInfo =
                getWatchInfo(game, collegeFootballRankings);

              const locked =
                gameIsLocked(
                  game,
                  currentTime,
                );

              return (
                <article
                  key={game.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xl">
                      {game.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[9px] font-black uppercase text-slate-400">
                          {game.competition}
                        </div>

                        <div
                          className={`rounded-full px-2 py-1 text-[9px] font-black ${
                            watchInfo.label.includes(
                              "Must Watch",
                            )
                              ? "bg-orange-100 text-orange-700"
                              : watchInfo.label.includes(
                                    "Big Game",
                                  )
                                ? "bg-blue-100 text-blue-700"
                                : watchInfo.label.includes(
                                      "FamBam",
                                    )
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {watchInfo.label}
                        </div>
                      </div>

                      <div className="mt-1 font-black">
                        {game.sport === "College Football"
                          ? rankedTeamLabel(
                              game.away,
                              collegeFootballRankings,
                            )
                          : game.away}{" "}
                        at{" "}
                        {game.sport === "College Football"
                          ? rankedTeamLabel(
                              game.home,
                              collegeFootballRankings,
                            )
                          : game.home}
                      </div>

                      <div className="text-xs text-slate-500">
                        {game.liveData
                          ? `${formatGameDate(
                              game.startsAt,
                            )} · ${formatGameTime(
                              game.startsAt,
                              game.startTimeTbd,
                            )}`
                          : "Sample"}
                      </div>

                      <div className="mt-1 text-[11px] font-bold text-slate-500">
                        {watchInfo.reasons.join(
                          " • ",
                        )}
                      </div>
                    </div>

                    {signedInPlayer?.is_admin && (
                      <button
                        onClick={() =>
                          openAdminAdd(game)
                        }
                        disabled={
                          inChallenge ||
                          !game.liveData ||
                          locked ||
                          challengeGameIds.length >= 10
                        }
                        className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition active:scale-95 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {inChallenge
                          ? "✓ In Challenge"
                          : locked
                            ? "Started"
                            : challengeGameIds.length >= 10
                              ? "10/10 Full"
                              : "+ Challenge"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}

            {!gamesLoading && filteredGames.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-bold text-slate-500 lg:col-span-2">
                No FamBam, ranked, or major games found for this filter this week.
              </div>
            )}
          </div>
        </section>
      </div>

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
                  <div className="text-center">
                    <div className="text-3xl">
                      🔒
                    </div>
                    <h3 className="mt-2 text-xl font-black">
                      Open My Picks
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Enter your PIN.
                    </p>
                  </div>

                  <div className="mt-5 flex justify-center gap-3">
                    {[0, 1, 2, 3].map(
                      (position) => (
                        <div
                          key={position}
                          className={`h-4 w-4 rounded-full ${
                            picksPin.length >
                            position
                              ? "bg-blue-600"
                              : "bg-slate-200"
                          }`}
                        />
                      ),
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
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
                          enterPicksDigit(
                            digit,
                          )
                        }
                        className="h-14 rounded-2xl bg-slate-100 text-xl font-black transition active:scale-95 active:bg-blue-100 active:text-blue-700"
                      >
                        {digit}
                      </button>
                    ))}

                    <button
                      onClick={closePicks}
                      className="text-xs font-black text-slate-400"
                    >
                      CANCEL
                    </button>

                    <button
                      onClick={() =>
                        enterPicksDigit("0")
                      }
                      className="h-14 rounded-2xl bg-slate-100 text-xl font-black transition active:scale-95 active:bg-blue-100 active:text-blue-700"
                    >
                      0
                    </button>

                    <button
                      onClick={deletePicksDigit}
                      className="text-xl font-black text-slate-500"
                    >
                      ⌫
                    </button>
                  </div>

                  {picksError && (
                    <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm font-bold text-red-600">
                      {picksError}
                    </div>
                  )}

                  <button
                    onClick={unlockPicks}
                    disabled={
                      picksPin.length !== 4
                    }
                    className="mt-5 w-full rounded-2xl bg-blue-600 py-4 font-black text-white disabled:bg-slate-200"
                  >
                    Open My Picks →
                  </button>
                </div>
              ) : (
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
                                <div className="mt-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                                  Who Ya Got?
                                </div>

                                <div
                                  className={`mt-3 grid gap-2 ${
                                    game.sport ===
                                    "Soccer"
                                      ? "grid-cols-3"
                                      : "grid-cols-2"
                                  }`}
                                >
                                  <button
                                    onClick={() =>
                                      selectPick(
                                        game.id,
                                        "away",
                                      )
                                    }
                                    className={`rounded-2xl border-2 p-3 text-center transition ${
                                      choice ===
                                      "away"
                                        ? "border-blue-600 bg-blue-50 text-blue-800"
                                        : "border-slate-200 bg-white"
                                    }`}
                                  >
                                    <div className="text-[10px] font-bold uppercase text-slate-400">
                                      Away
                                    </div>
                                    <div className="mt-1 text-sm font-black">
                                      {game.away}
                                    </div>
                                  </button>

                                  {game.sport ===
                                    "Soccer" && (
                                    <button
                                      onClick={() =>
                                        selectPick(
                                          game.id,
                                          "draw",
                                        )
                                      }
                                      className={`rounded-2xl border-2 p-3 text-center transition ${
                                        choice ===
                                        "draw"
                                          ? "border-violet-600 bg-violet-50 text-violet-800"
                                          : "border-slate-200 bg-white"
                                      }`}
                                    >
                                      <div className="text-[10px] font-bold uppercase text-slate-400">
                                        Result
                                      </div>
                                      <div className="mt-1 text-sm font-black">
                                        Draw
                                      </div>
                                    </button>
                                  )}

                                  <button
                                    onClick={() =>
                                      selectPick(
                                        game.id,
                                        "home",
                                      )
                                    }
                                    className={`rounded-2xl border-2 p-3 text-center transition ${
                                      choice ===
                                      "home"
                                        ? "border-blue-600 bg-blue-50 text-blue-800"
                                        : "border-slate-200 bg-white"
                                    }`}
                                  >
                                    <div className="text-[10px] font-bold uppercase text-slate-400">
                                      Home
                                    </div>
                                    <div className="mt-1 text-sm font-black">
                                      {game.home}
                                    </div>
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
              {[0, 1, 2, 3].map((position) => (
                <div
                  key={position}
                  className={`h-4 w-4 rounded-full transition ${
                    pin.length > position
                      ? "scale-110 bg-blue-600"
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