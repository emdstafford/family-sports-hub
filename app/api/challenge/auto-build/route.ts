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
  competition_id: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type SportRow = {
  id: string;
  name: string;
};

type RankingRow = {
  team_name: string;
  rank: number;
  season: number;
  week: number;
};

type ExistingChallengeGame = {
  game_id: string;
  selection_source: "manual" | "auto";
  selection_reason: string | null;
  selected_at: string;
};

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
  return value
    .toLowerCase()
    .replace(/\b(fc|afc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function exactTeam(name: string, target: string) {
  return normalize(name) === normalize(target);
}

function isFamilySoccerTeam(name: string) {
  return (
    exactTeam(name, "Arsenal") ||
    exactTeam(name, "Liverpool") ||
    exactTeam(name, "Aston Villa") ||
    exactTeam(name, "AFC Wimbledon")
  );
}

function isFamilyCollegeFootballTeam(name: string) {
  return (
    exactTeam(name, "Kentucky") ||
    exactTeam(name, "Georgia")
  );
}

function isFinalStatus(status: string | null) {
  const value = (status ?? "").toLowerCase();

  return (
    value === "final" ||
    value === "completed" ||
    value === "finished"
  );
}

export async function POST(request: Request) {
  try {
    const cronSecret =
      process.env.CRON_SECRET;

    const authorization =
      request.headers.get("authorization");

    if (
      !cronSecret ||
      authorization !== `Bearer ${cronSecret}`
    ) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        {
          error:
            "Server configuration is incomplete.",
        },
        { status: 500 },
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const requestUrl = new URL(request.url);
    const reset =
      requestUrl.searchParams.get("reset") === "true";

    const now = new Date();

    /*
     * FamBam Challenge weeks run Monday through Sunday.
     *
     * We currently have one FamBam family, so the most
     * recent Challenge is the authoritative source for
     * family_id when a new weekly Challenge is created.
     */
    const {
      data: recentChallenge,
      error: recentChallengeError,
    } = await supabase
      .from("challenges")
      .select("*")
      .order("starts_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (recentChallengeError) {
      throw recentChallengeError;
    }

    if (!recentChallenge?.family_id) {
      return NextResponse.json(
        {
          error:
            "No existing FamBam Challenge with a family_id was found.",
        },
        { status: 404 },
      );
    }

    /*
     * Calculate the current Monday-Sunday week.
     *
     * Challenge records are stored as UTC timestamps,
     * while the displayed week is based on calendar days.
     */
    const todayUtc = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      ),
    );

    const weekday = todayUtc.getUTCDay();

    const daysSinceMonday =
      weekday === 0 ? 6 : weekday - 1;

    const weekStart = new Date(todayUtc);
    weekStart.setUTCDate(
      weekStart.getUTCDate() -
        daysSinceMonday,
    );

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(
      weekEnd.getUTCDate() + 6,
    );
    weekEnd.setUTCHours(
      23,
      59,
      59,
      999,
    );

    /*
     * First close any expired Challenge that is
     * incorrectly still marked open.
     */
    const {
      error: closeExpiredError,
    } = await supabase
      .from("challenges")
      .update({
        status: "complete",
        updated_at:
          now.toISOString(),
      })
      .eq("status", "open")
      .lt(
        "ends_at",
        weekStart.toISOString(),
      );

    if (closeExpiredError) {
      throw closeExpiredError;
    }

    /*
     * Reuse the current week's Challenge if it
     * already exists. This makes the route safe
     * to run repeatedly without creating duplicates.
     */
    const {
      data: existingCurrentChallenge,
      error:
        existingCurrentChallengeError,
    } = await supabase
      .from("challenges")
      .select("*")
      .eq(
        "family_id",
        recentChallenge.family_id,
      )
      .gte(
        "starts_at",
        weekStart.toISOString(),
      )
      .lte(
        "starts_at",
        weekEnd.toISOString(),
      )
      .order("starts_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (
      existingCurrentChallengeError
    ) {
      throw existingCurrentChallengeError;
    }

    let openChallenge =
      existingCurrentChallenge;

    if (!openChallenge?.id) {
      const formatMonthDay = (
        value: Date,
      ) =>
        value.toLocaleDateString(
          "en-US",
          {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          },
        );

      const {
        data: createdChallenge,
        error: createChallengeError,
      } = await supabase
        .from("challenges")
        .insert({
          family_id:
            recentChallenge.family_id,
          name:
            `FamBam Challenge · ${formatMonthDay(
              weekStart,
            )}–${formatMonthDay(
              weekEnd,
            )}`,
          description:
            "Weekly FamBam Sports Challenge",
          starts_at:
            weekStart.toISOString(),
          ends_at:
            weekEnd.toISOString(),
          status: "open",
        })
        .select("*")
        .single();

      if (createChallengeError) {
        throw createChallengeError;
      }

      openChallenge =
        createdChallenge;
    } else if (
      openChallenge.status !== "open"
    ) {
      const {
        data: reopenedChallenge,
        error: reopenChallengeError,
      } = await supabase
        .from("challenges")
        .update({
          status: "open",
          updated_at:
            now.toISOString(),
        })
        .eq(
          "id",
          openChallenge.id,
        )
        .select("*")
        .single();

      if (reopenChallengeError) {
        throw reopenChallengeError;
      }

      openChallenge =
        reopenedChallenge;
    }

    const windowEnd = new Date(now);
    windowEnd.setUTCDate(
      windowEnd.getUTCDate() + 7,
    );

    const [
      gamesResult,
      teamsResult,
      sportsResult,
      rankingsResult,
      existingResult,
      picksResult,
    ] = await Promise.all([
      supabase
        .from("games")
        .select(
          "id, starts_at, start_time_tbd, status, home_team_id, away_team_id, sport_id, competition_id",
        )
        .gte("starts_at", now.toISOString())
        .lte(
          "starts_at",
          windowEnd.toISOString(),
        )
        .order("starts_at", {
          ascending: true,
        }),

      supabase
        .from("teams")
        .select("id, name"),

      supabase
        .from("sports")
        .select("id, name"),

      supabase
        .from("college_football_rankings")
        .select(
          "team_name, rank, season, week",
        )
        .eq("poll", "AP Top 25")
        .order("season", {
          ascending: false,
        })
        .order("week", {
          ascending: false,
        })
        .order("rank", {
          ascending: true,
        }),

      supabase
        .from("challenge_games")
        .select(
          "game_id, selection_source, selection_reason, selected_at",
        )
        .eq(
          "challenge_id",
          openChallenge.id,
        ),

      supabase
        .from("player_picks")
        .select("game_id")
        .eq(
          "challenge_id",
          openChallenge.id,
        ),
    ]);

    if (gamesResult.error) {
      throw gamesResult.error;
    }

    if (teamsResult.error) {
      throw teamsResult.error;
    }

    if (sportsResult.error) {
      throw sportsResult.error;
    }

    if (rankingsResult.error) {
      throw rankingsResult.error;
    }

    if (existingResult.error) {
      throw existingResult.error;
    }

    if (picksResult.error) {
      throw picksResult.error;
    }

    const games =
      (gamesResult.data ?? []) as GameRow[];

    const teams =
      (teamsResult.data ?? []) as TeamRow[];

    const sports =
      (sportsResult.data ?? []) as SportRow[];

    const existing =
      (existingResult.data ??
        []) as ExistingChallengeGame[];

    const teamMap = new Map(
      teams.map((team) => [
        team.id,
        team.name,
      ]),
    );

    const sportMap = new Map(
      sports.map((sport) => [
        sport.id,
        sport.name,
      ]),
    );

    const rankingRows =
      (rankingsResult.data ??
        []) as RankingRow[];

    const latestSeason =
      rankingRows[0]?.season;

    const latestWeek =
      rankingRows[0]?.week;

    const latestRankings =
      latestSeason === undefined ||
      latestWeek === undefined
        ? []
        : rankingRows.filter(
            (row) =>
              row.season ===
                latestSeason &&
              row.week === latestWeek,
          );

    const rankingMap = new Map(
      latestRankings.map((row) => [
        normalize(row.team_name),
        row.rank,
      ]),
    );

    const candidates: Candidate[] = [];

    for (const game of games) {
      if (
        game.start_time_tbd ||
        isFinalStatus(game.status)
      ) {
        continue;
      }

      const home =
        teamMap.get(game.home_team_id);

      const away =
        teamMap.get(game.away_team_id);

      const sport =
        sportMap.get(game.sport_id);

      if (!home || !away || !sport) {
        continue;
      }

      if (
        sport !== "Soccer" &&
        sport !== "College Football"
      ) {
        continue;
      }

      const homeRank =
        rankingMap.get(
          normalize(home),
        ) ?? null;

      const awayRank =
        rankingMap.get(
          normalize(away),
        ) ?? null;

      // Every eligible soccer or college-football game can fill the weekly
      // card. Favorite, ranked and rivalry games still rise to the top, but
      // ordinary matchups keep the family Challenge at ten picks.
      let score = sport === "College Football" ? 20 : 10;
      let mandatory = false;
      let reason = "";

      if (sport === "Soccer") {
        const familyTeam =
          isFamilySoccerTeam(home) ||
          isFamilySoccerTeam(away);

        if (familyTeam) {
          mandatory = true;
          score += 1000;
          reason =
            "FamBam favorite team";
        }

        const bigSixNames = [
          "Arsenal",
          "Chelsea",
          "Liverpool",
          "Manchester City",
          "Manchester United",
          "Tottenham Hotspur",
        ];

        const heavyweight =
          bigSixNames.some((name) =>
            exactTeam(home, name),
          ) &&
          bigSixNames.some((name) =>
            exactTeam(away, name),
          );

        if (heavyweight) {
          score += 150;

          if (!reason) {
            reason =
              "Major soccer matchup";
          }
        }
      }

      if (
        sport === "College Football"
      ) {
        const familyTeam =
          isFamilyCollegeFootballTeam(
            home,
          ) ||
          isFamilyCollegeFootballTeam(
            away,
          );

        if (familyTeam) {
          mandatory = true;
          score += 1000;
          reason =
            "FamBam favorite team";
        }

        if (
          homeRank !== null &&
          awayRank !== null
        ) {
          score += 400;
          score +=
            60 -
            Math.min(
              homeRank + awayRank,
              50,
            );

          if (!reason) {
            reason =
              `Ranked matchup: #${awayRank} vs #${homeRank}`;
          }
        } else {
          const rankedTeam =
            homeRank ?? awayRank;

          if (rankedTeam !== null) {
            score += Math.max(
              20,
              120 -
                rankedTeam * 3,
            );

            if (!reason) {
              reason =
                `AP Top 25 team (#${rankedTeam})`;
            }
          }
        }

        const rivalryPairs = [
          ["iowa", "iowa state"],
          ["missouri", "kansas"],
          ["ohio state", "michigan"],
          ["alabama", "auburn"],
          ["georgia", "georgia tech"],
          ["kentucky", "louisville"],
        ];

        const rivalry =
          rivalryPairs.some(
            ([a, b]) =>
              (exactTeam(home, a) &&
                exactTeam(away, b)) ||
              (exactTeam(home, b) &&
                exactTeam(away, a)),
          );

        if (rivalry) {
          score += 175;

          if (!reason) {
            reason =
              "Rivalry game";
          }
        }
      }

      candidates.push({
        game,
        home,
        away,
        sport,
        homeRank,
        awayRank,
        score,
        mandatory,
        reason:
          reason ||
          "Weekly featured matchup",
      });
    }

    candidates.sort((a, b) => {
      if (
        a.mandatory !== b.mandatory
      ) {
        return a.mandatory
          ? -1
          : 1;
      }

      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (
        new Date(
          a.game.starts_at,
        ).getTime() -
        new Date(
          b.game.starts_at,
        ).getTime()
      );
    });

    const mandatory =
      candidates.filter(
        (candidate) =>
          candidate.mandatory,
      );

    const optional =
      candidates.filter(
        (candidate) =>
          !candidate.mandatory,
      );

    /*
     * Weekly Challenge is always exactly
     * TARGET_GAMES at most.
     *
     * Mandatory games are already sorted
     * ahead of optional games and by score,
     * so if there are more mandatory games
     * than available Challenge slots, keep
     * the strongest ones rather than letting
     * the Challenge grow beyond its target.
     */
    const pickedIds = new Set<string>();

    const pickCounts = new Map<string, number>();

    for (const row of
      (picksResult.data ?? []) as { game_id: string }[]) {
      pickCounts.set(
        row.game_id,
        (pickCounts.get(row.game_id) ?? 0) + 1,
      );
    }

    const pickedGamesByParticipation = [...pickCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([gameId]) => gameId);

    for (const gameId of pickedGamesByParticipation) {
      if (pickedIds.size >= TARGET_GAMES) {
        break;
      }

      pickedIds.add(gameId);
    }

    /*
     * The ten games picked by the most family members are the shared
     * weekly card. This cleanly identifies the original card after the
     * brief replacement-game issue because every player completed the
     * original ten while only some picked the accidental additions.
     * Extra pick records remain stored safely but are not scored.
     */
    const selected: Candidate[] = [];

    const remainingCandidates = [
      ...mandatory,
      ...optional,
    ].filter(
      (candidate) =>
        !pickedIds.has(candidate.game.id),
    );

    for (const candidate of remainingCandidates) {
      if (
        pickedIds.size + selected.length >=
        TARGET_GAMES
      ) {
        break;
      }

      selected.push(candidate);
    }

    const selectedIds = new Set(
      selected.map(
        (candidate) =>
          candidate.game.id,
      ),
    );

    /*
     * We need information about existing games
     * even when they're outside the new
     * seven-day candidate window.
     */
    const existingIds = [
      ...new Set([
        ...existing.map(
          (row) => row.game_id,
        ),
        ...pickedIds,
      ]),
    ];

    const existingGameMap =
      new Map<string, {
        starts_at: string;
      }>();

    if (existingIds.length > 0) {
      const {
        data: existingGameRows,
        error:
          existingGameRowsError,
      } = await supabase
        .from("games")
        .select("id, starts_at")
        .in("id", existingIds);

      if (existingGameRowsError) {
        throw existingGameRowsError;
      }

      for (
        const row of
        existingGameRows ?? []
      ) {
        existingGameMap.set(
          row.id,
          {
            starts_at:
              row.starts_at,
          },
        );
      }
    }

    const protectedIds =
      new Set<string>(pickedIds);

    for (const row of existing) {
      const game =
        existingGameMap.get(
          row.game_id,
        );

      const hasStarted =
        game
          ? new Date(
              game.starts_at,
            ).getTime() <=
            now.getTime()
          : false;

      /*
       * The authoritative picked games are already protected.
       *
       * If the family has picked fewer than ten distinct games,
       * started or intentional manual games may occupy the open
       * slots. They never expand the Challenge beyond ten.
       *
       * On reset=true, legacy manual rows may
       * be replaced unless they have a pick or
       * have already started.
       */
      if (
        protectedIds.size < TARGET_GAMES &&
        (hasStarted ||
          (!reset &&
            row.selection_source ===
              "manual"))
      ) {
        protectedIds.add(
          row.game_id,
        );
      }
    }

    /*
     * Keep every protected game attached to the Challenge.
     * This also repairs the current week automatically: if a
     * previous hourly run detached a game that still has saved
     * picks, pickedIds puts it back into desiredIds below.
     */
    const desiredIds = new Set<string>([
      ...selectedIds,
      ...protectedIds,
    ]);

    const removeIds =
      existing
        .filter(
          (row) =>
            !desiredIds.has(
              row.game_id,
            ),
        )
        .map(
          (row) =>
            row.game_id,
        );

    if (removeIds.length > 0) {
      const {
        error: deleteError,
      } = await supabase
        .from("challenge_games")
        .delete()
        .eq(
          "challenge_id",
          openChallenge.id,
        )
        .in("game_id", removeIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    const existingAfterRemoval =
      new Set(
        existing
          .filter(
            (row) =>
              !removeIds.includes(
                row.game_id,
              ),
          )
          .map(
            (row) =>
              row.game_id,
          ),
      );

    const rowsToInsert =
      [...desiredIds]
        .filter(
          (gameId) =>
            !existingAfterRemoval.has(gameId),
        )
        .map((gameId) => {
          const candidate = selected.find(
            (item) => item.game.id === gameId,
          );

          return {
            challenge_id:
              openChallenge.id,
            game_id: gameId,
            selection_source:
              "auto" as const,
            selection_reason:
              candidate?.reason ??
              "Restored saved pick",
          };
        });

    if (rowsToInsert.length > 0) {
      const {
        error: insertError,
      } = await supabase
        .from("challenge_games")
        .insert(rowsToInsert);

      if (insertError) {
        throw insertError;
      }
    }

    /*
     * If a selected game was already present
     * as an old legacy/manual row during the
     * one-time reset, convert it to auto so
     * future weekly builds can manage it.
     */
    if (reset) {
      for (const candidate of selected) {
        if (
          existingAfterRemoval.has(
            candidate.game.id,
          ) &&
          !pickedIds.has(
            candidate.game.id,
          )
        ) {
          const game =
            existingGameMap.get(
              candidate.game.id,
            );

          const hasStarted =
            game
              ? new Date(
                  game.starts_at,
                ).getTime() <=
                now.getTime()
              : false;

          if (!hasStarted) {
            const {
              error:
                updateError,
            } = await supabase
              .from(
                "challenge_games",
              )
              .update({
                selection_source:
                  "auto",
                selection_reason:
                  candidate.reason,
              })
              .eq(
                "challenge_id",
                openChallenge.id,
              )
              .eq(
                "game_id",
                candidate.game.id,
              );

            if (updateError) {
              throw updateError;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      mode: reset
        ? "reset"
        : "weekly",
      challenge: {
        id: openChallenge.id,
        name:
          openChallenge.name ??
          openChallenge.title ??
          "FamBam Challenge",
      },
      latestRankingWeek:
        latestSeason !== undefined &&
        latestWeek !== undefined
          ? {
              season:
                latestSeason,
              week: latestWeek,
            }
          : null,
      target: TARGET_GAMES,
      selectedCount:
        selected.length,
      protectedCount:
        protectedIds.size,
      removedCount:
        removeIds.length,
      addedCount:
        rowsToInsert.length,
      removedGameIds:
        removeIds,
      protectedGameIds: [
        ...protectedIds,
      ],
      selectedGames:
        selected.map(
          (candidate) => ({
            gameId:
              candidate.game.id,
            startsAt:
              candidate.game
                .starts_at,
            sport:
              candidate.sport,
            away:
              candidate.away,
            home:
              candidate.home,
            awayRank:
              candidate.awayRank,
            homeRank:
              candidate.homeRank,
            mandatory:
              candidate.mandatory,
            reason:
              candidate.reason,
          }),
        ),
    });
  } catch (error) {
    console.error(
      "Auto Challenge build error:",
      error,
    );

    let details =
      "Unknown error";

    if (
      error &&
      typeof error === "object"
    ) {
      const possibleError =
        error as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        };

      details =
        [
          possibleError.message,
          possibleError.details,
          possibleError.hint,
          possibleError.code,
        ]
          .filter(Boolean)
          .join(" | ") ||
        "Unknown error";
    }

    return NextResponse.json(
      {
        error:
          "Could not build the FamBam Challenge.",
        details,
      },
      { status: 500 },
    );
  }
}
