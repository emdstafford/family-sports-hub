import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

type GameRow = {
  id: string;
  starts_at: string;
  start_time_tbd: boolean | null;
  status: string | null;
  home_team_id: string;
  away_team_id: string;
  sport_id: string;
  competition_id: string | null;
  external_provider: string | null;
  source_notes: string | null;
};

type RankingRow = { team_name: string; rank: number; season: number; week: number };
type ExistingRow = { game_id: string; selection_source: "manual" | "auto"; selection_reason: string | null };
type Candidate = {
  game: GameRow;
  home: string;
  away: string;
  sport: string;
  homeRank: number | null;
  awayRank: number | null;
  score: number;
  mandatory: boolean;
  reason: string;
};

const TARGET_GAMES = 10;

function normalize(value: string) {
  return value.toLowerCase().replace(/\b(fc|afc)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function exactTeam(name: string, target: string) {
  return normalize(name) === normalize(target);
}

function isFamilySoccerTeam(name: string) {
  return ["Arsenal", "Liverpool", "Aston Villa", "AFC Wimbledon"].some((team) => exactTeam(name, team));
}

function isFamilyFootballTeam(name: string) {
  const n = normalize(name);
  return ["kentucky", "kentuckywildcats", "georgia", "georgiabulldogs"].includes(n);
}

function isKentuckyBasketballTeam(name: string) {
  const n = normalize(name);
  return n === "kentucky" || n === "kentuckywildcats";
}

function isBigBlueMadnessTeam(name: string) {
  const n = normalize(name);
  return n === "blue" || n === "white";
}

const SEC_BASKETBALL_TEAMS = [
  "Alabama", "Arkansas", "Auburn", "Florida", "Georgia", "Kentucky", "LSU",
  "Mississippi State", "Missouri", "Oklahoma", "Ole Miss", "South Carolina",
  "Tennessee", "Texas", "Texas A&M", "Vanderbilt",
];

function isSecBasketballTeam(name: string) {
  const n = normalize(name);
  return SEC_BASKETBALL_TEAMS.some((team) => {
    const base = normalize(team);
    return n === base || n.startsWith(base);
  });
}

async function getBasketballRankings() {
  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
      { cache: "no-store" },
    );
    if (!response.ok) return new Map<string, number>();
    const data = await response.json();
    const poll = data?.rankings?.[0];
    const map = new Map<string, number>();
    for (const row of poll?.ranks ?? []) {
      const rank = Number(row?.current);
      if (!rank) continue;
      const team = row?.team ?? {};
      const names = [
        team.displayName,
        team.location && team.nickname ? `${team.location} ${team.nickname}` : null,
        team.location,
        team.name,
        team.nickname,
      ].filter((value): value is string => Boolean(value));
      for (const name of names) map.set(normalize(name), rank);
    }
    return map;
  } catch {
    return new Map<string, number>();
  }
}

function isFinal(status: string | null) {
  return ["final", "completed", "finished", "closed"].includes((status ?? "").toLowerCase());
}

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekday = todayUtc.getUTCDay();
    const weekStart = new Date(todayUtc);
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const { data: recentChallenge, error: recentError } = await supabase
      .from("challenges")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) throw recentError;
    if (!recentChallenge?.family_id) {
      return NextResponse.json({ error: "No FamBam family challenge was found." }, { status: 404 });
    }

    await supabase
      .from("challenges")
      .update({ status: "complete", updated_at: now.toISOString() })
      .eq("status", "open")
      .lt("ends_at", weekStart.toISOString());

    const { data: current, error: currentError } = await supabase
      .from("challenges")
      .select("*")
      .eq("family_id", recentChallenge.family_id)
      .gte("starts_at", weekStart.toISOString())
      .lte("starts_at", weekEnd.toISOString())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentError) throw currentError;

    let challenge = current;
    if (!challenge?.id) {
      const format = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const { data, error } = await supabase
        .from("challenges")
        .insert({
          family_id: recentChallenge.family_id,
          name: `FamBam Challenge · ${format(weekStart)}–${format(weekEnd)}`,
          description: "Weekly FamBam Sports Challenge",
          starts_at: weekStart.toISOString(),
          ends_at: weekEnd.toISOString(),
          status: "open",
        })
        .select("*")
        .single();
      if (error) throw error;
      challenge = data;
    } else if (challenge.status !== "open") {
      const { data, error } = await supabase
        .from("challenges")
        .update({ status: "open", updated_at: now.toISOString() })
        .eq("id", challenge.id)
        .select("*")
        .single();
      if (error) throw error;
      challenge = data;
    }

    // A weekly Challenge must contain games from this Challenge week only.
    // Building on Thursday must not pull Monday/Tuesday games from next week's card.
    const windowEnd = challenge.ends_at
      ? new Date(challenge.ends_at)
      : weekEnd;

    // Refresh the Division-I college-football slate immediately before
    // building the Challenge. This keeps UK/UGA, Top-10 and ranked games
    // available even if the earlier daily sports sync was missed or stale.
    const footballSyncUrl = new URL("/api/college-football/espn/import", request.url);
    const basketballSyncUrl = new URL("/api/college-basketball/import", request.url);

    // These feeds are independent. Refresh them in parallel so one slow provider
    // cannot double the time a family waits for a Challenge rebuild.
    const [footballSyncResponse, basketballSyncResponse, basketballRankingMap] = await Promise.all([
      fetch(footballSyncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
      fetch(basketballSyncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }),
      getBasketballRankings(),
    ]);

    const importWarnings: string[] = [];
    if (!footballSyncResponse.ok) {
      const details = await footballSyncResponse.text();
      importWarnings.push(`College football refresh failed: ${details}`);
      console.error("Challenge import warning:", importWarnings[importWarnings.length - 1]);
    }
    if (!basketballSyncResponse.ok) {
      const details = await basketballSyncResponse.text();
      importWarnings.push(`College basketball refresh failed: ${details}`);
      console.error("Challenge import warning:", importWarnings[importWarnings.length - 1]);
    }

    const [gamesResult, teamsResult, sportsResult, competitionsResult, rankingsResult, existingResult, picksResult, favoritesResult] = await Promise.all([
      supabase.from("games")
        .select("id,starts_at,start_time_tbd,status,home_team_id,away_team_id,sport_id,competition_id,external_provider,source_notes")
        .gte("starts_at", now.toISOString())
        .lte("starts_at", windowEnd.toISOString())
        .order("starts_at", { ascending: true }),
      supabase.from("teams").select("id,name"),
      supabase.from("sports").select("id,name"),
      supabase.from("competitions").select("id,name"),
      supabase.from("college_football_rankings")
        .select("team_name,rank,season,week")
        .eq("poll", "AP Top 25")
        .order("season", { ascending: false })
        .order("week", { ascending: false })
        .order("rank", { ascending: true }),
      supabase.from("challenge_games")
        .select("game_id,selection_source,selection_reason")
        .eq("challenge_id", challenge.id),
      supabase.from("player_picks").select("game_id").eq("challenge_id", challenge.id),
      supabase.from("player_favorite_teams").select("team_id"),
    ]);

    for (const result of [gamesResult, teamsResult, sportsResult, competitionsResult, rankingsResult, existingResult, picksResult, favoritesResult]) {
      if (result.error) throw result.error;
    }

    const existing = (existingResult.data ?? []) as ExistingRow[];
    const picks = (picksResult.data ?? []) as { game_id: string }[];

    // The weekly card becomes immutable as soon as anyone makes a pick.
    // This protects the shared family slate from the daily cron changing games
    // after one person has already started.
    if (picks.length > 0) {
      return NextResponse.json({
        success: true,
        locked: true,
        reason: "Challenge already has family picks.",
        challenge: { id: challenge.id, name: challenge.name ?? challenge.title ?? "FamBam Challenge" },
        existingCount: existing.length,
      });
    }

    const reset = new URL(request.url).searchParams.get("reset") === "true" || picks.length === 0;

    const teamMap = new Map((teamsResult.data ?? []).map((row) => [row.id, row.name]));
    const sportMap = new Map((sportsResult.data ?? []).map((row) => [row.id, row.name]));
    const competitionMap = new Map((competitionsResult.data ?? []).map((row) => [row.id, row.name]));
    const favoriteTeamIds = new Set((favoritesResult.data ?? []).map((row) => row.team_id));
    const rankingRows = (rankingsResult.data ?? []) as RankingRow[];
    const latestSeason = rankingRows[0]?.season;
    const latestWeek = rankingRows[0]?.week;
    const rankingMap = new Map(
      rankingRows
        .filter((row) => row.season === latestSeason && row.week === latestWeek)
        .map((row) => [normalize(row.team_name), row.rank]),
    );

    const candidates: Candidate[] = [];

    for (const game of (gamesResult.data ?? []) as GameRow[]) {
      // A TBD kickoff/time is still a valid weekly pick. It remains visible as TBD
      // and the client can lock it when the game actually starts.
      const normalizedStatus = String(game.status ?? "").toLowerCase();
      const notes = String(game.source_notes ?? "").toLowerCase();
      if (
        isFinal(game.status) ||
        ["postponed", "cancelled", "canceled", "suspended"].some(
          (value) => normalizedStatus.includes(value) || notes.includes(value),
        )
      ) continue;
      const home = teamMap.get(game.home_team_id);
      const away = teamMap.get(game.away_team_id);
      const sport = sportMap.get(game.sport_id);
      if (!home || !away || !sport) continue;
      if (!["Soccer", "College Football", "College Basketball", "Volleyball", "Hockey", "Baseball"].includes(sport)) continue;

      const competition = game.competition_id ? competitionMap.get(game.competition_id) ?? "" : "";

      // ESPN is the verified current Division-I feed for weekly picks.
      // Historical CFBD rows remain useful for old results, but stale lower-division
      // CFBD games must never be eligible for the live FamBam Challenge.
      if (
        sport === "College Football" &&
        game.external_provider !== "espn-cfb"
      ) continue;

      const activeRankingMap = sport === "College Basketball" ? basketballRankingMap : rankingMap;
      const homeRank = activeRankingMap.get(normalize(home)) ?? null;
      const awayRank = activeRankingMap.get(normalize(away)) ?? null;
      let score =
        sport === "College Football" ? 30 :
        sport === "College Basketball" ? 25 :
        sport === "Soccer" ? 15 : 10;
      let mandatory = false;
      let worthy = false;
      let reason = "Weekly featured matchup";

      // Use the family's actual saved favorites instead of relying only on a
      // hard-coded list. This automatically follows future profile changes.
      if (favoriteTeamIds.has(game.home_team_id) || favoriteTeamIds.has(game.away_team_id)) {
        mandatory = true;
        worthy = true;
        score += 1000;
        reason = "FamBam favorite team";
      }

      if (sport === "Baseball" && /postseason|playoff|world series/i.test(competition)) {
        worthy = true;
        score += 300;
        if (reason === "Weekly featured matchup") reason = "MLB postseason";
      }

      if (sport === "Hockey" && /playoff|stanley/i.test(competition)) {
        worthy = true;
        score += 300;
        if (reason === "Weekly featured matchup") reason = "Hockey postseason";
      }

      if (sport === "Soccer") {
        if (isFamilySoccerTeam(home) || isFamilySoccerTeam(away)) {
          mandatory = true;
          worthy = true;
          score += 1000;
          reason = "FamBam favorite team";
        } else {
          const bigSix = ["Arsenal", "Chelsea", "Liverpool", "Manchester City", "Manchester United", "Tottenham Hotspur"];
          const heavyweight = bigSix.some((t) => exactTeam(home, t)) && bigSix.some((t) => exactTeam(away, t));
          if (heavyweight) {
            worthy = true;
            score += 150;
            reason = "Major soccer matchup";
          }
        }

        if (/champions league/i.test(competition)) {
          worthy = true;
          score += 250;
          if (reason === "Weekly featured matchup") reason = "Champions League";
        } else if (/fa cup|carabao|league cup|efl cup/i.test(competition)) {
          worthy = true;
          score += 160;
          if (reason === "Weekly featured matchup") reason = "Cup match";
        }
      }

      if (sport === "College Basketball") {
        const kentuckyGame =
          isKentuckyBasketballTeam(home) ||
          isKentuckyBasketballTeam(away) ||
          (game.external_provider === "ukathletics-mbb" &&
            isBigBlueMadnessTeam(home) &&
            isBigBlueMadnessTeam(away));

        if (kentuckyGame) {
          mandatory = true;
          worthy = true;
          score += 1400;
          reason = game.external_provider === "ukathletics-mbb" &&
            isBigBlueMadnessTeam(home) &&
            isBigBlueMadnessTeam(away)
            ? "Big Blue Madness · Blue vs White exhibition"
            : game.external_provider === "ukathletics-mbb"
              ? "Kentucky exhibition"
              : "Kentucky basketball";
        }

        const topTen = (homeRank !== null && homeRank <= 10) || (awayRank !== null && awayRank <= 10);
        if (topTen) {
          mandatory = true;
          worthy = true;
          score += 850;
          if (reason === "Weekly featured matchup") {
            const rank = homeRank !== null && homeRank <= 10 ? homeRank : awayRank;
            reason = `AP Top 10 basketball team (#${rank})`;
          }
        }

        if (homeRank !== null && awayRank !== null) {
          worthy = true;
          score += 500 + Math.max(0, 70 - Math.min(homeRank + awayRank, 50));
          if (reason === "Weekly featured matchup") reason = `Ranked basketball matchup: #${awayRank} vs #${homeRank}`;
        } else {
          const rank = homeRank ?? awayRank;
          if (rank !== null) {
            worthy = true;
            score += Math.max(60, 220 - rank * 5);
            if (reason === "Weekly featured matchup") reason = `AP Top 25 basketball team (#${rank})`;
          }
        }

        const homeSec = isSecBasketballTeam(home);
        const awaySec = isSecBasketballTeam(away);
        if (homeSec && awaySec) {
          worthy = true;
          score += 250;
          if (reason === "Weekly featured matchup") reason = "SEC basketball matchup";
        } else if (homeSec || awaySec) {
          score += 90;
          if (reason === "Weekly featured matchup") reason = "SEC basketball";
        }
      }

      if (sport === "College Football") {
        if (isFamilyFootballTeam(home) || isFamilyFootballTeam(away)) {
          mandatory = true;
          worthy = true;
          score += 1200;
          reason = "FamBam favorite team";
        }

        const topTen = (homeRank !== null && homeRank <= 10) || (awayRank !== null && awayRank <= 10);
        if (topTen) {
          mandatory = true;
          worthy = true;
          score += 800;
          if (reason === "Weekly featured matchup") {
            const rank = homeRank !== null && homeRank <= 10 ? homeRank : awayRank;
            reason = `AP Top 10 team (#${rank})`;
          }
        }

        if (homeRank !== null && awayRank !== null) {
          worthy = true;
          score += 450 + Math.max(0, 60 - Math.min(homeRank + awayRank, 50));
          if (reason === "Weekly featured matchup") reason = `Ranked matchup: #${awayRank} vs #${homeRank}`;
        } else {
          const rank = homeRank ?? awayRank;
          if (rank !== null) {
            worthy = true;
            score += Math.max(40, 180 - rank * 4);
            if (reason === "Weekly featured matchup") reason = `AP Top 25 team (#${rank})`;
          }
        }

        const rivalryPairs = [
          ["iowa", "iowa state"], ["missouri", "kansas"], ["ohio state", "michigan"],
          ["alabama", "auburn"], ["georgia", "georgia tech"], ["kentucky", "louisville"],
        ];
        const rivalry = rivalryPairs.some(([a, b]) =>
          (exactTeam(home, a) && exactTeam(away, b)) || (exactTeam(home, b) && exactTeam(away, a)),
        );
        if (rivalry) {
          worthy = true;
          score += 200;
          if (reason === "Weekly featured matchup") reason = "Rivalry game";
        }
      }

      // Never fill the card with random games just to reach ten. If a matchup
      // is not a family favorite, ranked/big game, rivalry, cup, or postseason
      // game, it does not belong in the weekly Challenge.
      if (!worthy) continue;

      candidates.push({ game, home, away, sport, homeRank, awayRank, score, mandatory, reason });
    }

    candidates.sort((a, b) => {
      if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.game.starts_at).getTime() - new Date(b.game.starts_at).getTime();
    });

    const protectedIds = new Set<string>(picks.map((pick) => pick.game_id));
    if (!reset) {
      for (const row of existing) {
        if (row.selection_source === "manual") protectedIds.add(row.game_id);
      }
    }

    const selected: Candidate[] = [];
    for (const candidate of candidates) {
      if (protectedIds.has(candidate.game.id)) continue;
      if (protectedIds.size + selected.length >= TARGET_GAMES) break;
      selected.push(candidate);
    }

    const desiredIds = new Set([...protectedIds, ...selected.map((row) => row.game.id)]);
    const removeIds = existing.filter((row) => !desiredIds.has(row.game_id)).map((row) => row.game_id);

    if (removeIds.length) {
      const { error } = await supabase
        .from("challenge_games")
        .delete()
        .eq("challenge_id", challenge.id)
        .in("game_id", removeIds);
      if (error) throw error;
    }

    const remainingExisting = new Set(existing.filter((row) => !removeIds.includes(row.game_id)).map((row) => row.game_id));
    const rowsToInsert = selected
      .filter((row) => !remainingExisting.has(row.game.id))
      .map((row) => ({
        challenge_id: challenge.id,
        game_id: row.game.id,
        selection_source: "auto" as const,
        selection_reason: row.reason,
      }));

    if (rowsToInsert.length) {
      const { error } = await supabase.from("challenge_games").insert(rowsToInsert);
      if (error) throw error;
    }

    if (reset) {
      for (const row of selected) {
        if (!remainingExisting.has(row.game.id)) continue;
        const { error } = await supabase
          .from("challenge_games")
          .update({ selection_source: "auto", selection_reason: row.reason })
          .eq("challenge_id", challenge.id)
          .eq("game_id", row.game.id);
        if (error) throw error;
      }
    }

    console.log(
      "Challenge selected games:",
      selected.map((row) => ({
        sport: row.sport,
        away: row.away,
        home: row.home,
        reason: row.reason,
        awayRank: row.awayRank,
        homeRank: row.homeRank,
      })),
      "warnings:",
      importWarnings,
    );

    return NextResponse.json({
      success: true,
      mode: reset ? "reset" : "weekly",
      challenge: { id: challenge.id, name: challenge.name ?? challenge.title ?? "FamBam Challenge" },
      target: TARGET_GAMES,
      selectedCount: selected.length,
      protectedCount: protectedIds.size,
      removedCount: removeIds.length,
      addedCount: rowsToInsert.length,
      importWarnings,
      selectedGames: selected.map((row) => ({
        gameId: row.game.id,
        startsAt: row.game.starts_at,
        sport: row.sport,
        away: row.away,
        home: row.home,
        awayRank: row.awayRank,
        homeRank: row.homeRank,
        mandatory: row.mandatory,
        reason: row.reason,
      })),
    });
  } catch (error) {
    console.error("Auto Challenge build error:", error);
    return NextResponse.json(
      {
        error: "Could not build the FamBam Challenge.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}


// Vercel Cron invokes scheduled paths with GET. Keep POST for in-app refreshes
// and let both entry points use the same authenticated builder.
export async function GET(request: Request) {
  return POST(request);
}
