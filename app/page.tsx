Warning: truncated output (original token count: 111089)
Total output lines: 9782

"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StandingsHub from "@/components/standings-hub";
import GiftManager from "@/components/gift-manager";
import PantryManager from "@/components/pantry-manager";

type PackingItem = { id: string; label: string; repeatWeekly: boolean; checked: boolean };
type DaisyFeedEvent = { id: string; fedAt: string; fedBy: string };
type DaisyWaterEvent = { id: string; changedAt: string; changedBy: string };

async function readApiResponse(response: Response, serviceName: string) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch {
    throw new Error(response.status === 404
      ? `${serviceName} isn’t available on this app version yet. Refresh after the update is published.`
      : `${serviceName} returned an unreadable response (${response.status}). Please refresh the app and try again.`);
  }
}

type Player = {
  id: string;
  display_name: string;
  initials: string | null;
  is_admin: boolean;
  sort_order: number;
  avatar_url?: string | null;
};

function isMamaPlayer(player: Player | null) {
  if (!player) return false;
  const name = player.display_name.trim().toLowerCase();
  return name === "mama" || name === "emily" || name === "emily stafford";
}

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

const RADAR_SPORTS: Sport[] = [
  "All", "Soccer", "College Football", "College Basketball",
  "Volleyball", "Hockey", "Baseball",
];

const EVENT_GAME_MATCHES: Record<string, string[]> = {
  "mlb-playoffs-world-series": ["mlb postseason"],
  "efl-trophy": ["efl trophy", "english football league trophy", "football league trophy", "vertu trophy", "papa john", "bristol street motors trophy"],
  "carabao-cup": ["carabao cup", "efl cup", "league cup"],
  "champions-league": ["champions league"],
  "womens-champions-league": ["women’s champions league", "women\'s champions league"],
  "subway-players-cup": ["subway players cup", "women’s league cup", "women\'s league cup"],
  "europa-league": ["europa league"],
  "conference-league": ["conference league"],
  "fa-cup": ["fa cup"],
};

function matchesEventGame(eventId: string, game: BrowserGame) {
  const competition = game.competition.toLowerCase();
  const notes = (game.sourceNotes ?? "").toLowerCase();
  if (eventId === "stanley-cup") return competition.includes("nhl") && notes.includes("stanley cup");
  if (eventId === "nfl-playoffs-super-bowl") return competition.includes("nfl") && /(playoff|wild card|divisional|conference championship|super bowl)/.test(competition + " " + notes);
  if (eventId === "sec-mens-basketball-tournament") return game.sport === "College Basketball" && competition.includes("sec") && !/(women|womens|women’s)/.test(competition);
  if (eventId === "sec-womens-basketball-tournament") return game.sport === "College Basketball" && competition.includes("sec") && /(women|womens|women’s)/.test(competition);
  if (eventId === "college-world-series") return /(college world series|ncaa baseball)/.test(competition);
  if (eventId === "pro-volleyball-playoffs") return competition.includes("volleyball") && /(playoff|championship)/.test(competition + " " + notes);
  if (eventId === "acha-college-hockey-postseason") return /(acha|acchl)/.test(competition) && /(postseason|tournament|playoff|championship)/.test(competition + " " + notes);
  if (eventId === "sphl-presidents-cup") return competition.includes("sphl") && /(playoff|president)/.test(competition + " " + notes);
  if (eventId === "bowl-pickem") return game.sport === "College Football" && /(bowl)/.test(competition + " " + notes);
  if (eventId === "college-football-playoff") return game.sport === "College Football" && /(college football playoff|cfp|national championship)/.test(competition + " " + notes);
  if (eventId === "mens-march-madness") return game.sport === "College Basketball" && /(ncaa|march madness)/.test(competition) && !/(women|womens|women’s)/.test(competition);
  if (eventId === "womens-march-madness") return game.sport === "College Basketball" && /(ncaa|march madness)/.test(competition) && /(women|womens|women’s)/.test(competition);
  if (eventId === "sec-volleyball-tournament") return game.sport === "Volleyball" && competition.includes("sec") && /(tournament|championship)/.test(competition + " " + notes);
  if (eventId === "ncaa-volleyball-tournament") return game.sport === "Volleyball" && /(ncaa|national championship)/.test(competition);
  if (eventId === "world-cups-euros") return game.sport === "Soccer" && /(world cup|euro)/.test(competition);
  if (eventId === "olympics") return /(olympic)/.test(competition + " " + notes);
  if (eventId === "champions-league") {
    return competition.includes("champions league") && !/(women|womens|women’s)/.test(competition);
  }
  return (EVENT_GAME_MATCHES[eventId] ?? []).some((name) => competition.includes(name));
}

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
  correctPickCount: number;
  correctPickMilestones: Record<string, string>;
  sportCorrect: Record<string, number>;
  sportMilestones: Record<string, Record<string, string>>;
  weeklyWinMilestones: Record<string, string>;
  fullCardMilestones: Record<string, string>;
  perfectTenMilestones: Record<string, string>;
};

type TrophyTier = "bronze" | "silver" | "gold";

type TrophyMilestone = {
  target: number;
  label: string;
  achievedAt: string | null;
  description?: string;
  earned?: boolean;
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

function basketballSpecialLabel(game: BrowserGame) {
  if (game.sport !== "College Basketball") return null;
  const notes = (game.sourceNotes ?? "").toUpperCase();
  if (notes.includes("BIG BLUE MADNESS")) return "BIG BLUE MADNESS";
  if (notes.includes("EXHIBITION")) return "EXHIBITION";
  return null;
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

function lockerVenue(team: LockerTeam) {
  const name = team.name.toLowerCase();
  if (name.includes("arsenal")) return { name: "Emirates Stadium", previewX: 239, scene: "field" };
  if (name.includes("aston villa")) return { name: "Villa Park", previewX: 435, scene: "field" };
  if (name.includes("liverpool")) return { name: "Anfield", previewX: 629, scene: "field" };
  if (name.includes("wimbledon")) return { name: "Plough Lane", previewX: 1023, scene: "field" };
  if (name.includes("kentucky") && team.sport === "College Basketball") return { name: "Rupp Arena", previewX: 825, scene: "court" };
  if (name.includes("kentucky") && team.sport === "College Football") return { name: "Commonwealth", scene: "field" };
  if (name.includes("kentucky") && team.sport === "Hockey") return { name: "Lexington Ice Center", scene: "rink" };
  if (name.includes("kentucky") && team.sport === "Volleyball") return { name: "Historic Memorial Coliseum", scene: "court" };
  if (name.includes("vancouver") || name.includes("canucks")) return { name: "Rogers Arena", scene: "rink" };
  if (name.includes("rock lobster")) return { name: "Akins Ford Arena", scene: "rink" };
  if (name.includes("georgia") && team.sport === "College Football") return { name: "Sanford Stadium", scene: "field" };
  if (name.includes("braves")) return { name: "Truist Park", scene: "diamond" };
  if (name.includes("cubs")) return { name: "Wrigley Field", scene: "diamond" };
  if (team.sport === "Hockey") return { name: "Home ice", scene: "rink" };
  if (team.sport === "Volleyball" || team.sport === "College Basketball" || team.sport === "Cheerleading") return { name: "Home court", scene: "court" };
  if (team.sport === "Baseball") return { name: "Home ballpark", scene: "diamond" };
  return { name: "Home field", scene: "field" };
}

type LockerStandingRow = { position: number; team: string; abbreviation?: string; wins?: string; draws?: string; losses?: string; overtimeLosses?: string; points?: string; record?: string };
type LockerStandings = { title: string; kind: string; groups: Array<{ rows: LockerStandingRow[] }> };
const lockerStandingsCache = new Map<string, { expires: number; promise: Promise<LockerStandings> }>();

function lockerStandingsCompetition(team: LockerTeam) {
  const name = team.name.toLowerCase();
  if (team.sport === "Soccer") return name.includes("wimbledon") ? "league-one" : "premier-league";
  if (team.sport === "College Football") return "college-football";
  if (team.sport === "College Basketball") return "college-basketball";
  if (team.sport === "Volleyball" && name.includes("kentucky")) return "volleyball";
  if (team.sport === "Hockey" && name.includes("canucks")) return "nhl";
  if (team.sport === "Baseball" && (name.includes("braves") || name.includes("cubs"))) return "mlb";
  return null;
}

function LockerTeamStanding({ team, games }: { team: LockerTeam; games: BrowserGame[] }) {
  const competition = lockerStandingsCompetition(team);
  const [data, setData] = useState<LockerStandings | null>(null);

  useEffect(() => {
    if (!competition) return;
    let mounted = true;
    let cached = lockerStandingsCache.get(competition);
    if (!cached || cached.expires < Date.now()) {
      const promise = fetch(`/api/standings?competition=${competition}`).then(async (response) => {
        if (!response.ok) throw new Error("Standings unavailable");
        return response.json() as Promise<LockerStandings>;
      });
      cached = { expires: Date.now() + 15 * 60_000, promise };
      lockerStandingsCache.set(competition, cached);
      promise.catch(() => { if (lockerStandingsCache.get(competition)?.promise === promise) lockerStandingsCache.delete(competition); });
    }
    cached.promise.then((result) => { if (mounted) setData(result); }).catch(() => {});
    return () => { mounted = false; };
  }, [competition]);

  if (!competition || !data) return <div className="h-6" />;
  const name = team.name.toLowerCase();
  const row = data.groups.flatMap((group) => group.rows).find((item) => {
    const label = item.team.toLowerCase();
    const abbr = item.abbreviation?.toLowerCase();
    if (name.includes("kentucky")) return label.includes("kentucky") || abbr === "uk";
    if (name.includes("georgia")) return label.includes("georgia") || abbr === "uga";
    if (name.includes("wimbledon")) return label.includes("wimbledon");
    if (name.includes("aston villa")) return label.includes("aston villa");
    if (name.includes("arsenal")) return label.includes("arsenal");
    if (name.includes("liverpool")) return label.includes("liverpool");
    if (name.includes("canucks")) return label.includes("canucks");
    if (name.includes("braves")) return label.includes("braves");
    if (name.includes("cubs")) return label.includes("cubs");
    return false;
  });
  if (!row) {
    if (data.kind === "rankings" && team.sport === "College Football") {
      let wins = 0;
      let losses = 0;
      games.filter((game) => lockerTeamMatchesGame(team, game)).forEach((game) => {
        const status = (game.status ?? "").toLowerCase();
        const final = ["final", "finished", "complete", "completed", "closed"].some((value) => status.includes(value));
        if (!final || game.homeScore === null || game.awayScore === null) return;
        const teamIsHome = [team.name, team.short_name ?? ""].map(normalizeLockerTeamName).filter((name) => name.length >= 3).includes(normalizeLockerTeamName(game.home));
        const teamScore = teamIsHome ? game.homeScore : game.awayScore;
        const opponentScore = teamIsHome ? game.awayScore : game.homeScore;
        if (teamScore > opponentScore) wins += 1;
        else if (teamScore < opponentScore) losses += 1;
      });
      return <div className="min-h-6 text-center text-[10px] font-semibold leading-tight text-[#cdb89e]"><span className="block">Not in current Top 25</span><span className="block text-[#f8efe0]">{wins}-{losses}</span></div>;
    }
    return <div className="min-h-6 text-center text-[10px] font-semibold leading-tight text-[#cdb89e]">{data.kind === "rankings" ? "Not in current Top 25" : ""}</div>;
  }
  const score = data.kind === "rankings" ? row.record : data.kind === "soccer" ? `${row.wins}W · ${row.draws}D · ${row.losses}L · ${row.points} pts` : data.kind === "nhl" ? `${row.wins}W · ${row.losses}L · ${row.overtimeLosses}OT` : `${row.wins}W · ${row.losses}L`;
  return <div className="min-h-6 text-center text-[11px] font-bold leading-tight text-[#f3c64f]">#{row.position} {data.kind === "rankings" ? "nationally" : data.kind === "nhl" || data.kind === "mlb" ? "division" : "table"}<span className="block text-[#f8efe0]">{score}</span></div>;
}

const lockerVenuePhotos: Record<string, string> = {
  "Commonwealth": "KentuckyCommonwealthStadium-EZInterior.jpg",
  "Sanford Stadium": "Sanford Stadium, August 2025.jpg",
  "Rogers Arena": "Rogers arena vancouver 2016.jpg",
  "Akins Ford Arena": "Akins Ford Arena building (1).jpg",
  "Truist Park": "Truist Park 2025.jpg",
  "Wrigley Field": "Wrigley Field, Chicago, Illinois (42488187655).jpg",
};
const lockerLocalVenuePhotos: Record<string, string> = {
  "Lexington Ice Center": "/venues/lexington-ice-center.svg",
};

const KENTUCKY_CHEER_TEAM_PHOTO =
  "https://ukathletics.com/imgproxy/CPFU8JWUtV1vXS5TfSPtz2R7CwhLm5ZhnJ9DjbhX7v4/fit/3840/2160/ce/0/aHR0cHM6Ly9zdG9yYWdlLmdvb2dsZWFwaXMuY29tL3VrYXRobGV0aWNzLWNvbS8yMDI0LzAxLzg2NTE5ODgwLTQxOTQxODYwMl8xMDE2MTM3NzIyOTE3Mzk3MF82NDI1OTExODAxMjI0MjgxNDIxX24uanBn.png";

function lockerTeamPhoto(team: LockerTeam) {
  const name = team.name.toLowerCase();
  if (name.includes("kentucky") && team.sport === "Cheerleading") {
    return KENTUCKY_CHEER_TEAM_PHOTO;
  }
  return null;
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
  if (!game.startsAt) return true;
  if (currentTime === null) return false;

  const status = String(game.status ?? "").toLowerCase();
  if (["live", "in_progress", "in progress", "final", "finished", "complete", "completed", "closed"]
    .some((value) => status.includes(value))) {
    return true;
  }

  if (game.startTimeTbd) {
    // A TBD time should not make a game impossible to pick all week.
    // Keep it open through its scheduled Eastern date; live/final status still locks it.
    return getEasternDateKey(currentTime) > getEasternDateKey(game.startsAt);
  }

  return currentTime >= new Date(game.startsAt).getTime();
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

  const basketballNote = (game.sourceNotes ?? "").toUpperCase();
  if (game.sport === "College Basketball" && basketballNote.includes("BIG BLUE MADNESS")) {
    return [
      "Big Blue Madness is Kentucky’s preseason celebration and first big look at the team.",
      "Blue vs White is an intrasquad exhibition: Kentucky players compete against each other, so it does not count toward the regular-season record.",
      "The FamBam pick is just for fun — choose whether Blue or White wins the scrimmage.",
    ];
  }

  if (game.sport === "College Basketball" && basketballNote.includes("EXHIBITION")) {
    return [
      "This is an exhibition game, which means it is played before the regular season and does not count toward Kentucky’s official win-loss record.",
      "Coaches use exhibitions to test lineups, rotations and game plans before the season begins.",
      "FamBam still gets to make a pick so everyone can start learning the team before regular-season games begin.",
    ];
  }

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
  visitType?: "game" | "tour" | "travel";
  date: string;
  away: string;
  home: string;
  venue: string;
  city: string;
  state: string;
  country: string;
  continent: string;
  awayScore: string;
  homeScore: string;
  result: "W" | "L" | "T" | "";
  attendeeIds: string[];
  attendeeNames: string[];
  memories: PassportMemory[];
  photos: string[];
  entryType?: "passport" | "family" | "travel";
  familyCategory?: string;
  familyMilestone?: string;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

const STATE_NAMES: Record<string,string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};

const CONTINENTS = [
  "North America",
  "South America",
  "Europe",
  "Africa",
  "Asia",
  "Oceania",
  "Antarctica",
] as const;

const COUNTRY_CONTINENTS: Record<string, string> = {
  "United States": "North America",
  Canada: "North America",
  Mexico: "North America",
  Bahamas: "North America",
  Jamaica: "North America",
  "Costa Rica": "North America",
  Brazil: "South America",
  Argentina: "South America",
  Peru: "South America",
  Chile: "South America",
  Colombia: "South America",
  "United Kingdom": "Europe",
  Ireland: "Europe",
  France: "Europe",
  Germany: "Europe",
  Italy: "Europe",
  Spain: "Europe",
  Portugal: "Europe",
  Netherlands: "Europe",
  Belgium: "Europe",
  Switzerland: "Europe",
  Austria: "Europe",
  Greece: "Europe",
  Iceland: "Europe",
  Norway: "Europe",
  Sweden: "Europe",
  Denmark: "Europe",
  Malawi: "Africa",
  "South Africa": "Africa",
  Kenya: "Africa",
  Tanzania: "Africa",
  Zambia: "Africa",
  Zimbabwe: "Africa",
  Morocco: "Africa",
  Egypt: "Africa",
  Japan: "Asia",
  China: "Asia",
  India: "Asia",
  Thailand: "Asia",
  Singapore: "Asia",
  Philippines: "Asia",
  "South Korea": "Asia",
  Israel: "Asia",
  Australia: "Oceania",
  "New Zealand": "Oceania",
  Fiji: "Oceania",
  Antarctica: "Antarctica",
};

function passportEntryTitle(entry: PassportEntry) {
  if (entry.entryType === "family") return entry.away;
  if (entry.entryType === "travel") return entry.country;
  return entry.visitType === "tour" || entry.sport === "Tour"
    ? `${entry.venue} Stadium Tour`
    : `${entry.away} at ${entry.home}`;
}

function passportLocationLabel(entry: PassportEntry) {
  const local = [entry.city, entry.state].filter(Boolean).join(", ");
  if (entry.country === "United States") return local || entry.country;
  return [local, entry.country].filter(Boolean).join(" · ");
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
  "sec-mens-basketball-tournament": "SEC Men’s Basketball Tournament",
  "sec-womens-basketball-tournament": "SEC Women’s Basketball Tournament",
  "college-world-series": "College World Series",
  "pro-volleyball-playoffs": "Pro Volleyball Playoffs",
  "carabao-cup": "Carabao Cup",
  "champions-league": "Champions League",
  "europa-league": "Europa League",
  "conference-league": "Conference League",
  "womens-champions-league": "Women’s Champions League",
  "subway-players-cup": "Subway Players Cup",
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

  const [packingItems, setPackingItems] = useState<PackingItem[]>([]);
  const [packingInput, setPackingInput] = useState("");
  const [packingRepeatWeekly, setPackingRepeatWeekly] = useState(true);
  const [packingBusy, setPackingBusy] = useState(false);
  const [packingError, setPackingError] = useState<string | null>(null);
  const [editingPackingId, setEditingPackingId] = useState<string | null>(null);
  const [editingPackingLabel, setEditingPackingLabel] = useState("");
  const [daisyLatestFeed, setDaisyLatestFeed] = useState<DaisyFeedEvent | null>(null);
  const [daisyLatestWater, setDaisyLatestWater] = useState<DaisyWaterEvent | null>(null);
  const [daisyBusy, setDaisyBusy] = useState(false);
  const [daisyError, setDaisyError] = useState<string | null>(null);
  const [nfcFeedNotice, setNfcFeedNotice] = useState<string | null>(null);
  const nfcFeedHandledRef = useRef(false);

  const [pin, setPin] = useState("");
  const [pinEmojis, setPinEmojis] =
    useState(["🏈", "⚽", "🏀", "⚾"]);
  const [pinError, setPinError] =
    useState<string | null>(null);

  const [checkingPin, setCheckingPin] =
    useState(false);

  const [activeSport, setActiveSport] =
    useState<Sport>("All");

  useEffect(() => {
    if (!signedInPlayer) {
      setPackingItems([]);
      setDaisyLatestFeed(null);
      setDaisyLatestWater(null);
      return;
    }
    void loadFamilyTools();
  }, [signedInPlayer?.id]);


  const [gamesPageView, setGamesPageView] =
    useState<"games" | "standings" | "results">("games");

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
      tier?: TrophyTier;
      progressTier?: TrophyTier;
      progressPercent?: number;
      milestones?: TrophyMilestone[];
    } | null>(null);

  const [passportView, setPassportView] =
    useState<"year" | "venue" | "states" | "world">("year");

  const [passportEntries, setPassportEntries] = useState<PassportEntry[]>([]);
  const [visitedStates, setVisitedStates] = useState<string[]>([]);
  const [familyStateCounts, setFamilyStateCounts] = useState<Array<{ playerId: string; displayName: string; initials: string; count: number; states: string[]; sportsStates: string[] }>>([]);
  const [selectedFamilyStatePlayerId, setSelectedFamilyStatePlayerId] = useState<string | null>(null);
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
  const [passportDraft, setPassportDraft] = useState<PassportEntry>({ id:"", sport:"Football", visitType:"game", date:"", away:"", home:"", venue:"", city:"", state:"", country:"United States", continent:"North America", awayScore:"", homeScore:"", result:"", attendeeIds:[], attendeeNames:[], memories:[], photos:[] });

  const [activeSection, setActiveSection] =
    useState<"Home" | "Sports" | "Challenge" | "Events" | "Locker Room" | "Trophy Room" | "Gifts" | "Pantry">("Home");

  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("section") === "Pantry") setActiveSection("Pantry");
  }, []);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [activeSection]);

  const [selectedEventGuide, setSelectedEventGuide] =
    useState<null | {
      id?: string;
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
  const [eventPicksLoaded, setEventPicksLoaded] =
    useState<Record<string, string>>({});
  const [eventPicksLoadFailed, setEventPicksLoadFailed] =
    useState<Record<string, string>>({});
  const [eventPickOutcomes, setEventPickOutcomes] =
    useState<Record<string, Array<{
      gameId: string;
      result: "correct" | "incorrect" | "draw";
      homeScore: number;
      awayScore: number;
    }>>>({});
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
  const [eventSportFilter, setEventSportFilter] = useState("All");
  const [showAllUpcomingEvents, setShowAllUpcomingEvents] = useState(false);
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

  const latestChallengeGameIds = useRef(challengeGameIds);
  latestChallengeGameIds.current = challengeGameIds;
  const latestScoreGames = useRef(realGames);
  latestScoreGames.current = realGames;
  const scoreRefreshAttempts = useRef(new Map<string, number>());
  const scoreRefreshInFlight = useRef(false);

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
      setEventPickOutcomes((current) => ({
        ...current,
        [eventId]: data.outcomes ?? [],
      }));
      setEventPicksLoaded((current) => ({ ...current, [eventId]: signedInPlayer.id }));
      setEventPicksLoadFailed((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
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
      setEventPicksLoadFailed((current) => ({ ...current, [eventId]: signedInPlayer.id }));
    }
  }

  async function saveEventPick(
    eventId: string,
    game: BrowserGame,
    pickChoice: PickChoice,
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
    if (!["Events", "Challenge"].includes(activeSection)) return;

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

    // Refresh once when the user actually opens Events or Challenge.
    // The hourly server sync remains the background safety net.
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

    // Event picks are user-driven: read them once when the screen opens.
    // Saving a pick already refreshes that specific event immediately.
    ["fa-cup", "carabao-cup", "champions-league", "womens-champions-league", "subway-players-cup", "europa-league", "conference-league", "efl-trophy", "stanley-cup", "mlb-playoffs-world-series"].forEach(
      (eventId) => void loadEventPicks(eventId),
    );

    if (challenge?.id) {
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
        // Show FamBam's saved game data immediately. Only call the
        // external live provider when the game is actually near/live;
        // future and final game cards should never wait on ESPN/etc.
        const currentGame =
          latestScoreGames.current.find(
            (game) => game.id === gameRoomGameId,
          ) ?? gameRoomGame;

        if (!currentGame) return;

        const currentStatus = String(currentGame.status ?? "").toLowerCase();
        const currentStartsAtMs = currentGame.startsAt
          ? new Date(currentGame.startsAt).getTime()
          : null;
        const shouldRefreshProvider =
          !["final", "finished", "complete", "completed", "closed"].some(
            (value) => currentStatus.includes(value),
          ) &&
          currentStartsAtMs !== null &&
          Date.now() >= currentStartsAtMs - 10 * 60_000 &&
          Date.now() <= currentStartsAtMs + 6 * 60 * 60_000;

        if (shouldRefreshProvider) {
          void fetch(
            `/api/game-room/live?gameId=${encodeURIComponent(gameRoomGameId)}`,
            { cache: "no-store" },
          ).catch((liveError) => {
            console.error(
              "Game Details provider refresh request failed:",
              liveError,
            );
          });
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
                    : n…71089 tokens truncated…  <img
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
        <section className="bg-[#eef1f4] pb-[calc(env(safe-area-inset-bottom,0px)+5rem)]">
          <div className="mx-auto max-w-3xl">
            <div className="bg-[#06284a] px-4 pb-4 pt-4 text-white">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#f3c64f]">
                FamBam Special Events
              </div>
              <h2 className="mt-1 text-3xl font-black">🏆 Events Hub</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-blue-100">
                Pick the events you love. They’re separate from the weekly family challenge.
              </p>
            </div>

            <div className="space-y-4 px-3 py-4">
              {eventPicksRemaining > 0 && (
                <div className="rounded-2xl border border-[#e6dfd0] bg-[#fffaf0] px-4 py-3 text-xs font-black text-[#10254a]">
                  🏟️ {eventPicksRemaining} {eventPicksRemaining === 1 ? "pick is" : "picks are"} ready across {eventReminderGroups.length} {eventReminderGroups.length === 1 ? "event" : "events"}. Picks lock when each game starts.
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-[#10254a]">Your Events</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      Hide events you do not want to follow. You can add them back anytime.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHiddenEvents((current) => !current)}
                    className="shrink-0 rounded-full border border-slate-200 bg-[#f7f4ec] px-3 py-2 text-[11px] font-black text-[#10254a]"
                  >
                    Hidden ({hiddenEventIds.length})
                  </button>
                </div>

                {eventVisibilityMessage && (
                  <div className="mt-2 rounded-lg bg-[#fff8dc] px-3 py-2 text-[11px] font-bold text-[#765800]">
                    {eventVisibilityMessage}
                  </div>
                )}

                {showHiddenEvents && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {hiddenEventIds.length === 0 ? (
                      <div className="text-xs font-semibold text-slate-500">You have not hidden any events.</div>
                    ) : (
                      <div className="space-y-2">
                        {hiddenEventIds.map((eventId) => (
                          <div key={eventId} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f4ec] px-3 py-2">
                            <div className="text-xs font-black text-[#10254a]">
                              {eventId.startsWith("mamas-hockey-") ? "Weekly Hockey Challenge" : EVENT_NAMES[eventId] ?? eventId.replaceAll("-", " ")}
                            </div>
                            <button
                              type="button"
                              disabled={eventVisibilitySavingId === eventId}
                              onClick={() => void setEventHidden(eventId, false)}
                              className="rounded-full bg-[#06284a] px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
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

              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#10254a]">Browse events by sport</div>
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Event sports">
                  {["All", "Soccer", "Hockey", "Baseball", "Volleyball", "Football", "Basketball", "Other"].map((sport) => (
                    <button key={sport} type="button" aria-pressed={eventSportFilter === sport}
                      onClick={() => { setEventSportFilter(sport); setShowAllUpcomingEvents(false); }}
                      className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${eventSportFilter === sport ? "bg-[#06284a] text-white" : "bg-[#f7f4ec] text-[#10254a]"}`}>
                      {sport === "Other" ? "🏇 Olympics & more" : sport}
                    </button>
                  ))}
                </div>
                {eventSportFilter === "Soccer" && <div className="mt-2 text-[11px] font-semibold text-slate-500">Men’s and women’s competitions stay separate. Women’s Champions League and Subway Players Cup have their own picks and history.</div>}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-black uppercase tracking-wide text-[#10254a]">
                    Happening Now
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    Ordered by what is happening next · Tap an event name for its guide · Optional with no penalty.
                  </div>
                </div>

                <div className="space-y-4 p-3">
              {mamasHockeyEventId && !hiddenEventIds.includes(mamasHockeyEventId) && matchesEventSport("Hockey") && (
                <div className="rounded-xl bg-[#f7f4ec] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setSelectedEventGuide({
                      id: mamasHockeyEventId, icon: "🏒", name: "Weekly Hockey Challenge", sport: "Hockey",
                      season: "Every challenge week", format: "Five shared game picks",
                      description: "An optional hockey challenge anyone in the family can join by making a pick.",
                      dates: ["New games each challenge week", "Picks lock when each game starts"],
                      learning: "Everyone sees the same five games. Hockey picks are separate from the regular 10-game family challenge.",
                    })} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left active:opacity-70">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-xl">🏒</span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-black text-[#10254a]">Weekly Hockey Challenge</div>
                          <div className="text-[10px] font-bold text-slate-500">{eventProgress[mamasHockeyEventId]?.made ?? 0}/5 picks · {eventProgress[mamasHockeyEventId]?.correct ?? 0} correct · Tap for guide</div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${mamasHockeyGames.some((game) => !gameIsLocked(game, currentTime)) ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{mamasHockeyGames.some((game) => !gameIsLocked(game, currentTime)) ? "PICKS OPEN" : "AWAITING GAMES"}</span>
                    </button>
                    <button type="button" disabled={eventVisibilitySavingId === mamasHockeyEventId}
                      onClick={() => void setEventHidden(mamasHockeyEventId, true)}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-500 disabled:opacity-50">Hide</button>
                  </div>
                  <div className="mt-3">
                    {visibleHockeyGames.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {visibleHockeyGames.map((game) => {
                          const selected = eventPicks[mamasHockeyEventId]?.[game.id];
                          const saving = eventPickSavingKey === `${mamasHockeyEventId}:${game.id}`;
                          const locked = gameIsLocked(game, currentTime);
                          const outcome = eventPickOutcomes[mamasHockeyEventId]?.find((item) => item.gameId === game.id);

                          return (
                            <div key={game.id} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                              <button
                                type="button"
                                onClick={() => void openGameRoom(game)}
                                className="w-full text-left"
                              >
                                <div className="flex gap-2.5">
                                  <div className="flex w-9 shrink-0 flex-col items-center text-center">
                                    <div className="text-xl">{game.icon}</div>
                                    <div className="mt-0.5 text-[6px] font-black uppercase leading-tight text-[#765800]">
                                      {game.competition}
                                    </div>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1 text-right text-[9px] font-black text-[#10254a]">
                                      {formatGameTime(game.startsAt, game.startTimeTbd)}
                                    </div>
                                    <div className="truncate text-[12px] font-black text-[#10254a]">{game.away}</div>
                                    <div className="mt-0.5 truncate text-[12px] font-black text-[#10254a]">{game.home}</div>
                                  </div>
                                </div>
                                <div className="mt-1 text-[9px] font-semibold text-slate-400">{formatGameDate(game.startsAt)}</div>
                              </button>
                              {locked ? (
                                <div className={`mt-2 rounded-lg px-3 py-2.5 text-xs font-black ${outcome?.result === "correct" ? "bg-emerald-100 text-emerald-800" : outcome?.result === "incorrect" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"}`}>
                                  {outcome ? `${outcome.awayScore}–${outcome.homeScore} · ` : ""}
                                  {outcome?.result === "correct" ? "✓ Correct pick" : outcome?.result === "incorrect" ? "✕ Missed pick" : outcome?.result === "draw" ? "Draw · not graded" : "Game started · checking the result"}
                                  {selected && <span className="block mt-1 text-[11px] font-semibold">You picked {selected === "away" ? game.away : game.home}</span>}
                                </div>
                              ) : <div className="mt-2 grid grid-cols-2 gap-1.5">
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
                                    className={`min-h-9 rounded-lg px-2 py-1.5 text-[10px] font-black transition active:scale-[0.98] ${
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
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-[#f7f4ec] px-4 py-4 text-center text-xs font-semibold text-slate-500">
                        {mamasHockeyGames.length > 0 ? "No remaining hockey picks this week. Your completed picks are in the event guide." : "No hockey games fall in this challenge week yet. Your five picks will appear here automatically when the schedule is available."}
                      </div>
                    )}

                    {eventPickMessage && eventPickMessageEventId === mamasHockeyEventId && (
                      <div className="mt-2 rounded-lg bg-[#fff8dc] px-3 py-2 text-center text-xs font-black text-[#765800]">
                        {eventPickMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}

                  {[{"id":"mlb-playoffs-world-series","icon":"⚾","name":"MLB Playoffs & World Series","sport":"Baseball","season":"September–October","format":"Wild Card → Division → League Championship → World Series","description":"One event for the whole postseason, with new game picks as matchups are set.","dates":["Wild Card: September 29–October 1","Division Series: begins October 3","League Championship Series: begins October 11","World Series: begins October 23"],"learning":"Pick individual game winners as each round arrives. Your picks lock at first pitch; teams advance by winning their series.","matches":["mlb postseason"]},{"id":"efl-trophy","icon":"🏆","name":"EFL Trophy","sport":"Soccer","season":"August–April","format":"Groups + Knockout","description":"A cup path especially relevant to AFC Wimbledon.","dates":["Group stage: August–November","Knockout rounds: December–March","Final at Wembley: usually April"],"learning":"Regional groups of four play three matches. A win earns 3 points. A group-stage draw goes straight to penalties: both clubs earn 1 point and the shootout winner earns a bonus point. The top two in each group advance.","matches":["efl trophy","english football league trophy","football league trophy","vertu trophy","papa john","bristol street motors trophy"]},{"id":"carabao-cup","icon":"🥤","name":"Carabao Cup","sport":"Soccer","season":"August–March","format":"Knockout","description":"England’s professional League Cup.","dates":["Early rounds: August–September","Knockout rounds: October–February","Final: usually March"],"learning":"Learn single-elimination brackets, extra time, penalties and how lower-league clubs can upset Premier League teams.","matches":["carabao cup","efl cup","league cup"]},{"id":"champions-league","icon":"🌟","name":"Champions League","sport":"Soccer","season":"September–May","format":"League + Knockout","description":"Europe’s biggest club competition.","dates":["League phase: September–January","Knockout rounds: February–May","Final: late May"],"learning":"Learn the league-phase table, qualification places, two-leg aggregate scores and knockout advancement.","matches":["champions league"]},{"id":"europa-league","icon":"🟠","name":"Europa League","sport":"Soccer","season":"September–May","format":"League + Knockout","description":"UEFA Europa League. League phase began September 16–17.","dates":["League phase began September 16–17","Next league matchday: October 15","Knockout rounds: February–May"],"learning":"Follow UEFA league-phase standings and knockout games. This is separate from the Champions and Conference Leagues.","matches":["europa league"]},{"id":"womens-champions-league","icon":"🌟","name":"Women’s Champions League","sport":"Soccer","season":"September–May","format":"League + Knockout","description":"Europe’s top women’s club competition, with Arsenal in the league phase.","dates":["League phase: September–December","Knockout rounds: spring","Final: May"],"learning":"Follow Arsenal and Europe’s leading women’s clubs through the league phase and knockouts.","matches":["women’s champions league","women\'s champions league"]},{"id":"subway-players-cup","icon":"🏆","name":"Subway Players Cup","sport":"Soccer","season":"September–March","format":"League Phase + Knockout","description":"England’s women’s cup competition, including Liverpool and Aston Villa.","dates":["League phase: September–December","Knockout rounds: winter","Final: spring"],"learning":"Follow Liverpool and Aston Villa through the league phase and knockout rounds.","matches":["subway players cup","women’s league cup","women\'s league cup"]},...(conferenceLeagueActive ? [{"id":"conference-league","icon":"🟢","name":"Conference League","sport":"Soccer","season":"October–May","format":"League + Knockout","description":"UEFA Conference League league phase begins October 15.","dates":["League phase begins October 15","League phase: October–December","Knockout rounds: February–May"],"learning":"The Conference League is a separate UEFA competition with its own standings and picks.","matches":["conference league"]}] : []),{"id":"fa-cup","icon":"⚽","name":"FA Cup","sport":"Soccer","season":"August–May","format":"Knockout","description":"Hundreds of English clubs share one road to Wembley.","dates":["Qualifying: August–October","First Round Proper: November","Premier League clubs enter: January","Final: May"],"learning":"Smaller clubs enter first and bigger clubs join later. Win and advance; lose and the cup run is over. That setup creates famous giant-killing upsets.","matches":["fa cup"]}]
                    .filter((event) => !hiddenEventIds.includes(event.id) && matchesEventSport(event.sport))
                    .map((event) => {
                    const eventGames = realGames
                      .filter((game) => {
                        const matchesEvent = matchesEventGame(event.id, game);
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
                    const mlbSoon = event.id === "mlb-playoffs-world-series";
                    if (eventGames.length === 0 && !mlbSoon) return null;

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
                              <div className="text-[10px] font-bold text-slate-500">
                                {progress ? `${progress.correct} correct · ${progress.made} picks` : `${event.season} · Tap for guide`}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${eventGames.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                              {eventGames.length > 0 ? "PICKS OPEN" : "AWAITING GAMES"}
                            </span>
                            <span className="text-xs font-black text-[#b28a2e]">ⓘ</span>
                          </div>
                          </button>
                          <button
                            type="button"
                            disabled={eventVisibilitySavingId === event.id}
                            onClick={() => void setEventHidden(event.id, true)}
                            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-500 disabled:opacity-50"
                          >
                            {eventVisibilitySavingId === event.id ? "Hiding…" : "Hide"}
                          </button>
                        </div>

                        {eventGames.length > 0 ? (
                          <div className="mt-3 -mx-1.5 grid grid-cols-2 gap-1.5">
                            {eventGames.map((game) => {
                              const selected = eventPicks[event.id]?.[game.id];
                              const saving = eventPickSavingKey === `${event.id}:${game.id}`;
                              return (
                                <div key={game.id} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                                  {event.id === "mlb-playoffs-world-series" && (
                                    <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-[#765800]">
                                      {game.sourceNotes?.split(" · ")[1] ?? "MLB Postseason"}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void openGameRoom(game)}
                                    className="w-full text-left"
                                  >
                                    <div className="flex gap-2.5">
                                      <div className="flex w-9 shrink-0 flex-col items-center text-center">
                                        <div className="text-xl">{game.icon}</div>
                                        <div className="mt-0.5 text-[6px] font-black uppercase leading-tight text-[#765800]">
                                          {game.competition}
                                        </div>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-1 text-right text-[9px] font-black text-[#10254a]">
                                          {formatGameTime(game.startsAt, game.startTimeTbd)}
                                        </div>
                                        <div className="truncate text-[12px] font-black text-[#10254a]">{game.away}</div>
                                        <div className="mt-0.5 truncate text-[12px] font-black text-[#10254a]">{game.home}</div>
                                      </div>
                                    </div>
                                    <div className="mt-1 text-[9px] font-semibold text-slate-400">{formatGameDate(game.startsAt)}</div>
                                  </button>
                                  {signedInPlayer?.is_admin && challenge && game.liveData && !gameIsLocked(game, currentTime) && !challengeGameIds.includes(game.id) && challengeGameIds.length < 10 && (
                                    <button type="button" onClick={() => openAdminAdd(game)} className="mt-2 w-full rounded-lg bg-amber-100 px-2 py-2 text-[10px] font-black text-amber-900">
                                      + Add to weekly Challenge
                                    </button>
                                  )}
                                  <div className={`mt-2 grid gap-1.5 ${game.sport === "Soccer" ? "grid-cols-3" : "grid-cols-2"}`}>
                                    {([
                                      ["away", game.away],
                                      ...(game.sport === "Soccer" ? [["draw", "Draw"] as const] : []),
                                      ["home", game.home],
                                    ] as const).map(([choice, team]) => (
                                      <button
                                        key={choice}
                                        type="button"
                                        disabled={saving || gameIsLocked(game, currentTime)}
                                        onClick={() => void saveEventPick(event.id, game, choice)}
                                        aria-pressed={selected === choice}
                                        className={`min-h-9 rounded-lg px-2 py-1.5 text-[10px] font-black transition active:scale-[0.98] ${
                                          selected === choice
                                            ? "bg-[#06284a] text-white ring-2 ring-[#f3c64f]"
                                            : gameIsLocked(game, currentTime)
                                              ? "border border-slate-200 bg-slate-100 text-slate-400"
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
                          <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                            {event.id === "mlb-playoffs-world-series"
                              ? "The postseason starts September 29. Picks appear as MLB confirms matchups and first-pitch times."
                              : "The next fixtures are refreshing now. Once published, they will appear here automatically for picks."}
                          </div>
                        )}

                        {eventPickMessage &&
                          eventPickMessageEventId === event.id && (
                            <div className="mt-2 rounded-lg bg-[#fff8dc] px-3 py-2 text-center text-xs font-black text-[#765800]">
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
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      Live events and upcoming games rise automatically. Future events follow their season dates. Tap for details.
                    </div>
                  </div>
                  <div className="text-[10px] font-black uppercase text-[#b28a2e]">
                    More coming
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {"icon": "🏈", "name": "NFL Playoffs & Super Bowl", "sport": "Football", "season": "January–February", "format": "Single-Elimination Playoffs", "description": "Pick your way through the NFL postseason.", "dates": ["Wild Card and Divisional rounds", "Conference championships", "Super Bowl"], "learning": "Learn playoff seeds, home-field advantage and how the conference champions reach the Super Bowl. Picks are coming later."},
                    {"icon": "🏀", "name": "SEC Women’s Basketball Tournament", "sport": "Women’s Basketball", "season": "March", "format": "Interactive Conference Bracket", "description": "Build a complete women’s SEC Tournament bracket and follow Kentucky through its own field.", "dates": ["Tournament: usually early March", "Bracket released after the regular season", "Picks lock when tournament play begins"], "learning": "Learn conference seeding, byes, upset paths and the automatic NCAA tournament bid. This bracket stays completely separate from the men’s tournament."},
                    {"icon": "🏀", "name": "SEC Men’s Basketball Tournament", "sport": "Men’s Basketball", "season": "March", "format": "Interactive Conference Bracket", "description": "Build a complete men’s SEC Tournament bracket and follow Kentucky through its own field.", "dates": ["Tournament: usually mid-March", "Bracket released after the regular season", "Picks lock when tournament play begins"], "learning": "Learn conference seeding, byes, upset paths and the automatic NCAA tournament bid. Your picks advance through your own bracket until it locks."},
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
                      season: "October–May", format: "League + Knockout",
                      description: "UEFA league phase starts October 15; European competition full of underdog stories.",
                      dates: ["League phase starts October 15", "League phase: October–December", "Knockout rounds: February–May", "Final: May"],
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
                      icon: "🏆", name: "Subway Players Cup", sport: "Soccer",
                      season: "September–March", format: "League Phase + Knockout",
                      description: "England’s women’s cup competition, including Liverpool and Aston Villa.",
                      dates: ["League phase: September–December", "Knockout rounds: winter", "Final: spring"],
                      learning: "Follow the new league-phase format and the knockout path. European-qualified clubs do not take part in the league phase.",
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
                      season: "March–April", format: "Interactive 68-Team Bracket",
                      description: "Build your full men’s NCAA bracket, advance your picks round by round and choose your champion.",
                      dates: ["Selection Sunday: March", "Tournament: mid-March–early April", "Championship: early April"],
                      learning: "Learn seeds, regions, upset picks, the Sweet 16, Elite Eight and Final Four.",
                    },
                    {
                      icon: "🏀", name: "Women’s March Madness", sport: "Basketball",
                      season: "March–April", format: "Interactive 68-Team Bracket",
                      description: "Build your full women’s NCAA bracket, advance your picks round by round and choose your champion.",
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
                      season: "First Saturday in May", format: "Race Day Picks + Meet the Horses",
                      description: "Meet every Derby horse and jockey, then make your Winner and Top 3 picks.",
                      dates: ["Prep season: winter–spring", "Post-position draw: Derby week", "Kentucky Derby: first Saturday in May"],
                      learning: "Explore each horse’s post position, jockey, trainer, silks, odds, story and a fun fact before making picks. Then save the family’s Derby results and memories in FamBam History.",
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
                    .filter((event) => {
                      const eventId = eventIdFromName(event.name);
                      const hasUpcomingGames = realGames.some((game) => matchesEventGame(eventId, game) && (!game.startsAt || new Date(game.startsAt).getTime() >= (currentTime ?? Date.now())));
                      const alwaysActive = ["Carabao Cup", "Champions League", "Europa League", "EFL Trophy"].includes(event.name) || (conferenceLeagueActive && event.name === "Conference League");
                      return !alwaysActive && !hasUpcomingGames;
                    })
                    .filter((event) => !hiddenEventIds.includes(eventIdFromName(event.name)) && matchesEventSport(event.sport))
                    .sort((a, b) => {
                      // Events with real upcoming games always rise to the top automatically.
                      // This keeps the page useful in future seasons without hand-reordering cards.
                      const nowMs = currentTime ?? Date.now();
                      const nextGameTime = (eventName: string) => {
                        const eventId = eventIdFromName(eventName);
                        const times = realGames
                          .filter((game) => matchesEventGame(eventId, game) && game.startsAt && new Date(game.startsAt).getTime() >= nowMs)
                          .map((game) => new Date(game.startsAt!).getTime());
                        return times.length ? Math.min(...times) : Number.POSITIVE_INFINITY;
                      };
                      const aGame = nextGameTime(a.name);
                      const bGame = nextGameTime(b.name);
                      if (Number.isFinite(aGame) || Number.isFinite(bGame)) {
                        if (!Number.isFinite(aGame)) return 1;
                        if (!Number.isFinite(bGame)) return -1;
                        if (aGame !== bGame) return aGame - bGame;
                      }

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
                    }).slice(0, showAllUpcomingEvents ? undefined : 6).map((event) => (
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
                          <div className="text-[11px] font-black text-[#b28a2e]">→</div>
                        </div>
                        <div className="mt-2 text-xs font-black text-[#10254a]">{event.name}</div>
                        <div className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">{event.description}</div>
                        <div className="mt-2 inline-flex rounded-full bg-[#f7f4ec] px-2 py-1 text-[10px] font-black text-[#765800]">{event.season}</div>
                      </button>
                      <button
                        type="button"
                        disabled={eventVisibilitySavingId === eventIdFromName(event.name)}
                        onClick={() => void setEventHidden(eventIdFromName(event.name), true)}
                        className="absolute right-2 top-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 disabled:opacity-50"
                      >
                        Hide
                      </button>
                    </div>
                  ))}
                </div>
                {!showAllUpcomingEvents && <button type="button" onClick={() => setShowAllUpcomingEvents(true)} className="mt-3 w-full rounded-xl border border-[#b28a2e] bg-white px-4 py-3 text-xs font-black text-[#10254a]">Show all upcoming {eventSportFilter === "All" ? "events" : eventSportFilter + " events"} ↓</button>}
                {showAllUpcomingEvents && <button type="button" onClick={() => setShowAllUpcomingEvents(false)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-[#10254a]">Show fewer ↑</button>}
              </div>

            </div>
          </div>
        </section>
      )}

      {activeSection === "Challenge" &&
        signedInPlayer &&
        challenge && (
          <section className="w-full px-0.5 py-4">
            <div className="w-full overflow-hidden rounded-[1.5rem] bg-[#f7f4ec] shadow-lg">
              {/* COMPACT WEEKLY SCOREBOARD + READINESS */}
              {weeklyLeaderboard.length > 0 && (
                <div className="border-b border-[#e5dcc5] bg-white px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-[#b28a2e]">
                      This Week 🏆
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">
                      Score · picks ready
                    </div>
                  </div>
                  <div className="space-y-1">
                    {[...weeklyLeaderboard]
                      .sort((a, b) => b.points - a.points || b.correct - a.correct || b.accuracy - a.accuracy)
                      .map((row, index) => {
                        const isYou = row.player_id === signedInPlayer.id;
                        const pickCount = challengePickStatus[row.player_id] ?? 0;
                        const ready = challengeGames.length > 0 && pickCount >= challengeGames.length;
                        return (
                          <div key={row.player_id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${isYou ? "bg-[#edf5ff] ring-1 ring-[#bdd7f4]" : "bg-[#f8f6ef]"}`}>
                            <div className="w-5 text-center text-xs font-black text-[#b28a2e]">
                              {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-black text-[#06284a]">{row.display_name}</div>
                              <div className="text-[10px] font-semibold text-slate-500">
                                {row.correct} correct · {row.completed_picks}/{row.total_picks} scored
                              </div>
                            </div>
                            <div className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                              {ready ? "READY" : `${Math.max(0, challengeGames.length - pickCount)} LEFT`}
                            </div>
                            <div className="w-7 shrink-0 text-right">
                              <div className="text-base font-black leading-none text-[#06284a]">{row.points}</div>
                              <div className="text-[8px] font-black uppercase text-slate-400">pts</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

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
                <div className="px-1.5 py-3">
                  <div className="grid grid-cols-2 gap-1.5">
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
                          challengeGameIsFinal(game);

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
                            className="rounded-xl border border-[#e3dccd] bg-white p-2 shadow-sm"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-wide text-[#b28a2e]">
                                  {game.competition}
                                </div>
                                {basketballSpecialLabel(game) && (
                                  <div className="mt-1 inline-flex rounded-full bg-[#eaf0ff] px-2 py-1 text-[8px] font-black uppercase tracking-wide text-[#0033a0]">
                                    {basketballSpecialLabel(game)}
                                  </div>
                                )}

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
                                  className="mt-2 block w-full rounded-lg text-left active:bg-slate-50"
                                  aria-label={`Open game details for ${game.away} vs ${game.home}`}
                                >
                                  <div className="text-sm font-black leading-tight text-slate-950">
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
                                  <button
                                    type="button"
                                    onClick={() => void openGameRoom(game)}
                                    className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-[#e3dccd] bg-[#f8f6ef] px-3 py-2 text-left active:bg-[#f2eee4]"
                                    aria-label={`Open ${game.away} vs ${game.home} and see FamBam picks`}
                                  >
                                    <span>
                                      <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#b28a2e]">
                                        👀 Picks Revealed
                                      </span>
                                      <span className="block text-[10px] font-semibold text-slate-500">
                                        Tap to open game card
                                      </span>
                                    </span>
                                    <span className="shrink-0 rounded-lg bg-[#06284a] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">
                                      View
                                    </span>
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openGameRoom(game)}
                                  className="mt-2 block w-full rounded-lg text-left active:bg-slate-50"
                                  aria-label={`Open game details for ${game.away} vs ${game.home}`}
                                >
                                  <div className="text-sm font-black leading-tight text-slate-950">
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
                                </button>



                                <div
                                  className={`mt-2 grid gap-1.5 ${
                                    game.sport === "Soccer"
                                      ? "grid-cols-3"
                                      : "grid-cols-2"
                                  }`}
                                >
                                  <button
                                    onClick={() =>
                                      selectPick(game.id, "away")
                                    }
                                    className={`rounded-xl border-2 px-1.5 py-2 text-center transition active:scale-[0.98] ${
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
                                    <div className="mt-0.5 text-[11px] font-black leading-tight">
                                      {game.sport === "College Football"
                                        ? rankedTeamLabel(
                                            game.away,
                                            collegeFootballRankings,
                                          )
                                        : game.away}
                                    </div>
                                    {choice === "away" && (
                                      <div className="mt-0.5 text-[8px] font-black">
                                        ✓ YOUR PICK
                                      </div>
                                    )}
                                  </button>

                                  {game.sport === "Soccer" && (
                                    <button
                                      onClick={() =>
                                        selectPick(game.id, "draw")
                                      }
                                      className={`rounded-xl border-2 px-1.5 py-2 text-center transition active:scale-[0.98] ${
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
                                      <div className="mt-0.5 text-[11px] font-black leading-tight">
                                        Draw
                                      </div>
                                      {choice === "draw" && (
                                        <div className="mt-0.5 text-[8px] font-black">
                                          ✓ YOUR PICK
                                        </div>
                                      )}
                                    </button>
                                  )}

                                  <button
                                    onClick={() =>
                                      selectPick(game.id, "home")
                                    }
                                    className={`rounded-xl border-2 px-1.5 py-2 text-center transition active:scale-[0.98] ${
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
                                    <div className="mt-0.5 text-[11px] font-black leading-tight">
                                      {game.sport === "College Football"
                                        ? rankedTeamLabel(
                                            game.home,
                                            collegeFootballRankings,
                                          )
                                        : game.home}
                                    </div>
                                    {choice === "home" && (
                                      <div className="mt-0.5 text-[8px] font-black">
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
