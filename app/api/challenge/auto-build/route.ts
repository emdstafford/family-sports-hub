import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type GameRow = {
  id: string;
  starts_at: string;
  start_time_tbd: boolean | null;
  status: string | null;
  home_team_id: string;
  away_team_id: string;
  sport_id: string;
  external_provider: string | null;
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
  return exactTeam(name, "Kentucky") || exactTeam(name, "Georgia");
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

    const windowEnd = new Date(now);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

    const [gamesResult, teamsResult, sportsResult, rankingsResult, existingResult, picksResult] = await Promise.all([
      supabase.from("games")
        .select("id,starts_at,start_time_tbd,status,home_team_id,away_team_id,sport_id,external_provider")
        .gte("starts_at", now.toISOString())
        .lte("starts_at", windowEnd.toISOString())
        .order("starts_at", { ascending: true }),
      supabase.from("teams").select("id,name"),
      supabase.from("sports").select("id,name"),
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
    ]);

    for (const result of [gamesResult, teamsResult, sportsResult, rankingsResult, existingResult, picksResult]) {
      if (result.error) throw result.error;
    }

    const existing = (existingResult.data ?? []) as ExistingRow[];
    const picks = (picksResult.data ?? []) as { game_id: string }[];
    const reset = new URL(request.url).searchParams.get("reset") === "true" || picks.length === 0;

    const teamMap = new Map((teamsResult.data ?? []).map((row) => [row.id, row.name]));
    const sportMap = new Map((sportsResult.data ?? []).map((row) => [row.id, row.name]));
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
      if (game.start_time_tbd || isFinal(game.status)) continue;
      const home = teamMap.get(game.home_team_id);
      const away = teamMap.get(game.away_team_id);
      const sport = sportMap.get(game.sport_id);
      if (!home || !away || !sport) continue;
      if (sport !== "Soccer" && sport !== "College Football") continue;

      // Football may come from either of our Division-I feeds. The CFBD
      // importer permanently removes D-II/D-III games before they reach here.
      if (
        sport === "College Football" &&
        game.external_provider !== "cfbd" &&
        game.external_provider !== "espn-cfb"
      ) continue;

      const homeRank = rankingMap.get(normalize(home)) ?? null;
      const awayRank = rankingMap.get(normalize(away)) ?? null;
      let score = sport === "College Football" ? 30 : 10;
      let mandatory = false;
      let reason = "Weekly featured matchup";

      if (sport === "Soccer") {
        if (isFamilySoccerTeam(home) || isFamilySoccerTeam(away)) {
          mandatory = true;
          score += 1000;
          reason = "FamBam favorite team";
        } else {
          const bigSix = ["Arsenal", "Chelsea", "Liverpool", "Manchester City", "Manchester United", "Tottenham Hotspur"];
          const heavyweight = bigSix.some((t) => exactTeam(home, t)) && bigSix.some((t) => exactTeam(away, t));
          if (heavyweight) {
            score += 150;
            reason = "Major soccer matchup";
          }
        }
      }

      if (sport === "College Football") {
        if (isFamilyFootballTeam(home) || isFamilyFootballTeam(away)) {
          mandatory = true;
          score += 1200;
          reason = "FamBam favorite team";
        }

        const topTen = (homeRank !== null && homeRank <= 10) || (awayRank !== null && awayRank <= 10);
        if (topTen) {
          mandatory = true;
          score += 800;
          if (reason === "Weekly featured matchup") {
            const rank = homeRank !== null && homeRank <= 10 ? homeRank : awayRank;
            reason = `AP Top 10 team (#${rank})`;
          }
        }

        if (homeRank !== null && awayRank !== null) {
          score += 450 + Math.max(0, 60 - Math.min(homeRank + awayRank, 50));
          if (reason === "Weekly featured matchup") reason = `Ranked matchup: #${awayRank} vs #${homeRank}`;
        } else {
          const rank = homeRank ?? awayRank;
          if (rank !== null) {
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
          score += 200;
          if (reason === "Weekly featured matchup") reason = "Rivalry game";
        }
      }

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

    return NextResponse.json({
      success: true,
      mode: reset ? "reset" : "weekly",
      challenge: { id: challenge.id, name: challenge.name ?? challenge.title ?? "FamBam Challenge" },
      target: TARGET_GAMES,
      selectedCount: selected.length,
      protectedCount: protectedIds.size,
      removedCount: removeIds.length,
      addedCount: rowsToInsert.length,
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
