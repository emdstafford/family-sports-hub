import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const profileSettingsBucket = "fambam-profile-settings";

type ProfileSettings = {
  lockerTeamOrder: string[];
  hiddenEventIds: string[];
  updatedAt?: string;
};

async function ensureProfileSettingsBucket(supabase: ReturnType<typeof getAdminClient>) {
  const { data } = await supabase.storage.getBucket(profileSettingsBucket);
  if (data) return;
  const { error } = await supabase.storage.createBucket(profileSettingsBucket, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}

async function readProfileSettings(
  supabase: ReturnType<typeof getAdminClient>,
  playerId: string,
): Promise<ProfileSettings> {
  await ensureProfileSettingsBucket(supabase);
  const { data, error } = await supabase.storage.from(profileSettingsBucket).download(`${playerId}.json`);
  if (error || !data) {
    return { lockerTeamOrder: [], hiddenEventIds: [] };
  }

  try {
    const parsed = JSON.parse(await data.text());
    return {
      lockerTeamOrder: Array.isArray(parsed.lockerTeamOrder)
        ? parsed.lockerTeamOrder.filter((value: unknown) => typeof value === "string")
        : [],
      hiddenEventIds: Array.isArray(parsed.hiddenEventIds)
        ? parsed.hiddenEventIds.filter((value: unknown) => typeof value === "string")
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { lockerTeamOrder: [], hiddenEventIds: [] };
  }
}

async function writeLockerOrder(supabase: ReturnType<typeof getAdminClient>, playerId: string, lockerTeamOrder: string[]) {
  await ensureProfileSettingsBucket(supabase);
  const current = await readProfileSettings(supabase, playerId);
  const { error } = await supabase.storage.from(profileSettingsBucket).upload(
    `${playerId}.json`,
    JSON.stringify({
      ...current,
      lockerTeamOrder,
      updatedAt: new Date().toISOString(),
    }),
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

async function writeHiddenEventIds(
  supabase: ReturnType<typeof getAdminClient>,
  playerId: string,
  hiddenEventIds: string[],
) {
  await ensureProfileSettingsBucket(supabase);
  const current = await readProfileSettings(supabase, playerId);
  const { error } = await supabase.storage.from(profileSettingsBucket).upload(
    `${playerId}.json`,
    JSON.stringify({
      ...current,
      hiddenEventIds: [...new Set(hiddenEventIds)].slice(0, 100),
      updatedAt: new Date().toISOString(),
    }),
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Supabase server environment variables are missing.",
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

async function verifySession(
  playerId: string,
  sessionToken: string,
) {
  const supabase = getAdminClient();

  const {
    data: sessionValid,
    error: sessionError,
  } = await supabase.rpc(
    "verify_player_session",
    {
      target_player_id: playerId,
      attempted_token: sessionToken,
    },
  );

  if (sessionError) {
    console.error(
      "Profile session verification failed:",
      sessionError.message,
    );
    return false;
  }

  return sessionValid === true;
}

async function getRecordBookLeaderboard(supabase: ReturnType<typeof getAdminClient>) {
  // The real FamBam weekly competition began Sep. 7, 2026.
  // Older rows are setup/test Challenges and must never count in the Record Book.
  const recordBookStart = "2026-09-07T00:00:00.000Z";
  const [
    { data: players, error: playerError },
    { data: challenges, error: challengesError },
    { data: challengeGames, error: challengeGamesError },
    { data: picks, error: picksError },
  ] = await Promise.all([
    supabase.from("players").select("id, display_name, initials, sort_order").order("sort_order"),
    supabase.from("challenges").select("id, starts_at").gte("starts_at", recordBookStart),
    supabase.from("challenge_games").select("challenge_id, game_id"),
    supabase.from("player_picks").select("challenge_id, game_id, player_id, pick_choice"),
  ]);

  if (playerError || challengesError || challengeGamesError || picksError) {
    console.error("Record Book setup failed:", playerError?.message ?? challengesError?.message ?? challengeGamesError?.message ?? picksError?.message);
    return { leaderboard: [], achievements: {} };
  }

  type SupplementalPick = {
    playerId: string;
    gameId: string;
    pickChoice: "home" | "away";
  };

  const supplementalHockeyPicks: SupplementalPick[] = [];
  try {
    const { data: eventFiles } = await supabase.storage
      .from("fambam-event-picks")
      .list("2026-27", { limit: 1000 });
    const mamaHockeyFiles = (eventFiles ?? []).filter((file) =>
      /^mamas-hockey-.*\.json$/i.test(file.name),
    );

    const eventDocuments = await Promise.all(
      mamaHockeyFiles.map(async (file) => {
        const { data } = await supabase.storage
          .from("fambam-event-picks")
          .download(`2026-27/${file.name}`);
        if (!data) return [];
        try {
          const parsed = JSON.parse(await data.text());
          return Array.isArray(parsed.picks) ? parsed.picks : [];
        } catch {
          return [];
        }
      }),
    );

    for (const pick of eventDocuments.flat()) {
      if (
        typeof pick?.playerId === "string" &&
        typeof pick?.gameId === "string" &&
        (pick?.pickChoice === "home" || pick?.pickChoice === "away")
      ) {
        supplementalHockeyPicks.push(pick as SupplementalPick);
      }
    }
  } catch (error) {
    console.error("Hockey achievement history failed:", error);
  }

  const eligibleChallengeIds = new Set((challenges ?? []).map((challenge) => challenge.id));
  const eligibleChallengeGames = (challengeGames ?? []).filter((row) => eligibleChallengeIds.has(row.challenge_id));
  const gameIds = [...new Set([
    ...eligibleChallengeGames.map((row) => row.game_id),
    ...supplementalHockeyPicks.map((pick) => pick.gameId),
  ])];
  const { data: games, error: gamesError } = gameIds.length
    ? await supabase.from("games").select("id, sport, starts_at, status, home_score, away_score").in("id", gameIds)
    : { data: [], error: null };
  if (gamesError) {
    console.error("Record Book games failed:", gamesError.message);
    return { leaderboard: [], achievements: {} };
  }

  const isFinalGame = (game: { status: string | null; home_score: number | null; away_score: number | null }) => {
    const status = String(game.status ?? "").toLowerCase();
    return ["final", "finished", "complete", "completed", "closed"].some((value) => status.includes(value))
      && game.home_score != null
      && game.away_score != null;
  };
  const gameById = new Map((games ?? []).map((game) => [game.id, game]));
  const finalGameCounts = new Map<string, number>();
  const scoredGameCount = eligibleChallengeGames.filter((row) => {
    const game = gameById.get(row.game_id);
    const final = Boolean(game && isFinalGame(game));
    if (final) finalGameCounts.set(row.challenge_id, (finalGameCounts.get(row.challenge_id) ?? 0) + 1);
    return final;
  }).length;

  const totals = new Map<string, {
    player_id: string;
    display_name: string;
    initials: string;
    points: number;
    correct: number;
    completed_picks: number;
    total_picks: number;
    accuracy: number;
  }>();

  for (const player of players ?? []) {
    totals.set(player.id, {
      player_id: player.id,
      display_name: player.display_name,
      initials: player.initials ?? "",
      points: 0,
      correct: 0,
      completed_picks: 0,
      total_picks: scoredGameCount,
      accuracy: 0,
    });
  }

  const includedPickKeys = new Set(eligibleChallengeGames.map((row) => `${row.challenge_id}:${row.game_id}`));
  const weeklyScores = new Map<string, Map<string, { completed: number; correct: number }>>();
  const correctGamesByPlayer = new Map<string, Map<string, { sport: string; achievedAt: string }>>();

  const rememberCorrectGame = (
    playerId: string,
    game: { id: string; sport?: string | null; starts_at?: string | null },
  ) => {
    const correctGames = correctGamesByPlayer.get(playerId) ?? new Map();
    if (!correctGames.has(game.id)) {
      correctGames.set(game.id, {
        sport: String(game.sport ?? "Other"),
        achievedAt: game.starts_at ?? new Date().toISOString(),
      });
    }
    correctGamesByPlayer.set(playerId, correctGames);
  };

  for (const pick of picks ?? []) {
    if (!includedPickKeys.has(`${pick.challenge_id}:${pick.game_id}`)) continue;
    const total = totals.get(pick.player_id);
    const game = gameById.get(pick.game_id);
    if (!total || !game) continue;

    if (!isFinalGame(game)) continue;

    total.completed_picks += 1;
    const challengeScores = weeklyScores.get(pick.challenge_id) ?? new Map<string, { completed: number; correct: number }>();
    const playerWeek = challengeScores.get(pick.player_id) ?? { completed: 0, correct: 0 };
    playerWeek.completed += 1;
    const homeScore = Number(game.home_score);
    const awayScore = Number(game.away_score);
    const winningChoice = homeScore > awayScore
      ? "home"
      : awayScore > homeScore
        ? "away"
        : "draw";
    if (pick.pick_choice === winningChoice) {
      total.correct += 1;
      total.points += 1;
      playerWeek.correct += 1;
      rememberCorrectGame(pick.player_id, game);
    }
    challengeScores.set(pick.player_id, playerWeek);
    weeklyScores.set(pick.challenge_id, challengeScores);
  }

  for (const pick of supplementalHockeyPicks) {
    const game = gameById.get(pick.gameId);
    if (!game || !isFinalGame(game)) continue;
    const winningChoice = Number(game.home_score) > Number(game.away_score)
      ? "home"
      : Number(game.away_score) > Number(game.home_score)
        ? "away"
        : "draw";
    if (pick.pickChoice === winningChoice) {
      rememberCorrectGame(pick.playerId, game);
    }
  }

  const achievements: Record<string, {
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
  }> = {};
  const winStreaks = new Map<string, number>();
  for (const player of players ?? []) {
    achievements[player.id] = {
      weeklyWins: 0,
      fullCards: 0,
      perfectTens: 0,
      bestWeekCorrect: 0,
      bestWeekAccuracy: 0,
      maxWinStreak: 0,
      backToBack: false,
      correctPickCount: 0,
      correctPickMilestones: {},
      sportCorrect: {},
      sportMilestones: {},
    };
    winStreaks.set(player.id, 0);
  }

  const orderedChallenges = [...(challenges ?? [])].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  for (const challenge of orderedChallenges) {
    const cardSize = finalGameCounts.get(challenge.id) ?? 0;
    if (cardSize === 0) continue;
    const scores = weeklyScores.get(challenge.id) ?? new Map();
    let winningScore = 0;
    for (const score of scores.values()) winningScore = Math.max(winningScore, score.correct);

    for (const player of players ?? []) {
      const score = scores.get(player.id) ?? { completed: 0, correct: 0 };
      const stats = achievements[player.id];
      stats.bestWeekCorrect = Math.max(stats.bestWeekCorrect, score.correct);
      if (score.completed > 0) {
        stats.bestWeekAccuracy = Math.max(
          stats.bestWeekAccuracy,
          (score.correct / score.completed) * 100,
        );
      }
      if (score.completed === cardSize) stats.fullCards += 1;
      if (cardSize >= 10 && score.completed >= 10 && score.correct >= 10) stats.perfectTens += 1;

      const won = winningScore > 0 && score.correct === winningScore;
      const streak = won ? (winStreaks.get(player.id) ?? 0) + 1 : 0;
      winStreaks.set(player.id, streak);
      stats.maxWinStreak = Math.max(stats.maxWinStreak, streak);
      if (won) stats.weeklyWins += 1;
      if (streak >= 2) stats.backToBack = true;
    }
  }


  const achievementTargets = [5, 10, 25];
  for (const player of players ?? []) {
    const stats = achievements[player.id];
    const correctGames = [...(correctGamesByPlayer.get(player.id)?.values() ?? [])]
      .sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
    stats.correctPickCount = correctGames.length;

    for (const target of achievementTargets) {
      const achievement = correctGames[target - 1];
      if (achievement) stats.correctPickMilestones[String(target)] = achievement.achievedAt;
    }

    const gamesBySport = new Map<string, typeof correctGames>();
    for (const game of correctGames) {
      const sportGames = gamesBySport.get(game.sport) ?? [];
      sportGames.push(game);
      gamesBySport.set(game.sport, sportGames);
    }

    for (const [sport, sportGames] of gamesBySport) {
      stats.sportCorrect[sport] = sportGames.length;
      stats.sportMilestones[sport] = {};
      for (const target of achievementTargets) {
        const achievement = sportGames[target - 1];
        if (achievement) {
          stats.sportMilestones[sport][String(target)] = achievement.achievedAt;
        }
      }
    }
  }

  const leaderboard = [...totals.values()].map((row) => ({
    ...row,
    accuracy: row.completed_picks > 0 ? (row.correct / row.completed_picks) * 100 : 0,
  }));
  return { leaderboard, achievements };
}

const photoBucket = "fambam-photos";
const maxPhotoSize = 4 * 1024 * 1024;
const photoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function uploadProfilePhoto(request: Request) {
  const sessionToken = request.headers.get("x-fambam-session") ?? "";
  const form = await request.formData();
  const playerId = String(form.get("playerId") ?? "");
  const file = form.get("file");

  if (!(await verifySession(playerId, sessionToken))) {
    return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a picture first." }, { status: 400 });
  }

  const extension = photoTypes.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "Please choose a JPG, PNG or WEBP picture." }, { status: 400 });
  }
  if (file.size > maxPhotoSize) {
    return NextResponse.json({ error: "This picture is still too large after processing." }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { data: existingBucket } = await supabase.storage.getBucket(photoBucket);
  if (!existingBucket) {
    const { error: bucketError } = await supabase.storage.createBucket(photoBucket, {
      public: true,
      fileSizeLimit: maxPhotoSize,
      allowedMimeTypes: [...photoTypes.keys()],
    });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) throw bucketError;
  }

  const path = `profiles/${playerId}/avatar-${Date.now()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(photoBucket)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const url = supabase.storage.from(photoBucket).getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await supabase.from("players").update({ avatar_url: url }).eq("id", playerId);
  if (updateError) throw updateError;

  const { data: oldFiles } = await supabase.storage.from(photoBucket).list(`profiles/${playerId}`, { limit: 100 });
  const currentName = path.split("/").pop();
  const oldPaths = (oldFiles ?? [])
    .filter((item) => item.name !== currentName)
    .map((item) => `profiles/${playerId}/${item.name}`);
  if (oldPaths.length) await supabase.storage.from(photoBucket).remove(oldPaths);

  return NextResponse.json({ ok: true, url, path });
}

export async function GET(
  request: Request,
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const playerId =
      searchParams.get("playerId") ?? "";

    const sessionToken =
      request.headers.get(
        "x-fambam-session",
      ) ?? "";

    if (!playerId || !sessionToken) {
      return NextResponse.json(
        {
          error:
            "A remembered FamBam session is required.",
        },
        { status: 401 },
      );
    }

    const sessionValid =
      await verifySession(
        playerId,
        sessionToken,
      );

    if (!sessionValid) {
      return NextResponse.json(
        {
          error:
            "Your FamBam session has expired. Please switch players and sign in again.",
        },
        { status: 401 },
      );
    }

    const supabase = getAdminClient();

    const [
      playerResult,
      sportsResult,
      teamsResult,
      playerSportsResult,
      favoriteTeamsResult,
    ] = await Promise.all([
      supabase
        .from("players")
        .select(
          "id, display_name, initials, avatar_url",
        )
        .eq("id", playerId)
        .single(),

      supabase
        .from("sports")
        .select(
          "id, slug, name, emoji, active",
        )
        .eq("active", true)
        .order("name"),

      supabase
        .from("teams")
        .select(
          "id, sport_id, name, short_name, abbreviation, logo_url",
        )
        .eq("active", true)
        .order("name"),

      supabase
        .from("player_sports")
        .select(
          "sport_id, interest_type",
        )
        .eq("player_id", playerId),

      supabase
        .from("player_favorite_teams")
        .select(`
          team_id,
          is_primary,
          teams (
            id,
            sport_id,
            name,
            short_name,
            abbreviation,
            logo_url
          )
        `)
        .eq("player_id", playerId),
    ]);

    if (playerResult.error) {
      throw playerResult.error;
    }

    if (sportsResult.error) {
      throw sportsResult.error;
    }

    if (teamsResult.error) {
      throw teamsResult.error;
    }

    if (playerSportsResult.error) {
      throw playerSportsResult.error;
    }

    if (favoriteTeamsResult.error) {
      throw favoriteTeamsResult.error;
    }

    const [recordBook, profileSettings, { data: playerAvatars, error: playerAvatarsError }] = await Promise.all([
      getRecordBookLeaderboard(supabase),
      readProfileSettings(supabase, playerId),
      supabase.from("players").select("id, avatar_url"),
    ]);
    if (playerAvatarsError) {
      console.error("Player avatar list failed:", playerAvatarsError.message);
    }

    return NextResponse.json({
      player: playerResult.data,
      sports: sportsResult.data ?? [],
      teams: teamsResult.data ?? [],
      playerSports:
        playerSportsResult.data ?? [],
      favoriteTeams:
        favoriteTeamsResult.data ?? [],
      lockerTeamOrder: profileSettings.lockerTeamOrder,
      hiddenEventIds: profileSettings.hiddenEventIds,
      recordBookLeaderboard: recordBook.leaderboard,
      recordBookAchievements: recordBook.achievements,
      playerAvatars: playerAvatars ?? [],
    });
  } catch (error) {
    console.error(
      "Player profile GET error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not load your profile.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      return await uploadProfilePhoto(request);
    }

    const body = await request.json();

    const playerId =
      typeof body.playerId === "string"
        ? body.playerId
        : "";

    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : "";

    const initials =
      typeof body.initials === "string"
        ? body.initials.trim().slice(0, 4)
        : "";

    const playerSports =
      Array.isArray(body.playerSports)
        ? body.playerSports
        : [];

    const favoriteTeamIds =
      Array.isArray(body.favoriteTeamIds)
        ? body.favoriteTeamIds.filter(
            (value: unknown) =>
              typeof value === "string",
          )
        : [];

    const primaryTeamIds =
      Array.isArray(body.primaryTeamIds)
        ? body.primaryTeamIds.filter(
            (value: unknown) =>
              typeof value === "string",
          )
        : typeof body.primaryTeamId === "string"
          ? [body.primaryTeamId]
          : [];

    const lockerTeamOrder = Array.isArray(body.lockerTeamOrder)
      ? body.lockerTeamOrder.filter((value: unknown) => typeof value === "string")
      : favoriteTeamIds;

    const sessionToken =
      request.headers.get(
        "x-fambam-session",
      ) ?? "";

    if (body.action === "deletePhoto") {
      if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
        return NextResponse.json(
          { error: "Your FamBam session has expired. Please switch players and sign in again." },
          { status: 401 },
        );
      }

      const supabase = getAdminClient();
      const { data: files, error: listError } = await supabase.storage
        .from(photoBucket)
        .list(`profiles/${playerId}`, { limit: 100 });
      if (listError) throw listError;

      const paths = (files ?? []).map((file) => `profiles/${playerId}/${file.name}`);
      if (paths.length) {
        const { error: removeError } = await supabase.storage.from(photoBucket).remove(paths);
        if (removeError) throw removeError;
      }

      const { error: updateError } = await supabase
        .from("players")
        .update({ avatar_url: null })
        .eq("id", playerId);
      if (updateError) throw updateError;

      return NextResponse.json({ ok: true });
    }

    if (body.action === "hiddenEvents") {
      if (!playerId || !sessionToken || !(await verifySession(playerId, sessionToken))) {
        return NextResponse.json(
          { error: "Your FamBam session has expired. Please switch players and sign in again." },
          { status: 401 },
        );
      }

      const hiddenEventIds = Array.isArray(body.hiddenEventIds)
        ? body.hiddenEventIds.filter(
            (value: unknown): value is string =>
              typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value),
          )
        : [];

      await writeHiddenEventIds(getAdminClient(), playerId, hiddenEventIds);

      return NextResponse.json({ ok: true, hiddenEventIds });
    }

    if (
      !playerId ||
      !displayName ||
      !sessionToken
    ) {
      return NextResponse.json(
        {
          error:
            "Profile information and a remembered FamBam session are required.",
        },
        { status: 400 },
      );
    }

    const sessionValid =
      await verifySession(
        playerId,
        sessionToken,
      );

    if (!sessionValid) {
      return NextResponse.json(
        {
          error:
            "Your FamBam session has expired. Please switch players and sign in again.",
        },
        { status: 401 },
      );
    }

    const normalizedSports =
      playerSports
        .filter(
          (item: unknown) =>
            typeof item === "object" &&
            item !== null &&
            typeof (
              item as {
                sportId?: unknown;
              }
            ).sportId === "string" &&
            typeof (
              item as {
                interestType?: unknown;
              }
            ).interestType === "string",
        )
        .map((item: unknown) => {
          const typedItem =
            item as {
              sportId: string;
              interestType: string;
            };

          return {
            sport_id:
              typedItem.sportId,
            interest_type:
              typedItem.interestType,
          };
        });

    const supabase = getAdminClient();

    const {
      error: playerUpdateError,
    } = await supabase
      .from("players")
      .update({
        display_name: displayName,
        initials:
          initials.length > 0
            ? initials
            : null,
      })
      .eq("id", playerId);

    if (playerUpdateError) {
      throw playerUpdateError;
    }

    const {
      error: deleteSportsError,
    } = await supabase
      .from("player_sports")
      .delete()
      .eq("player_id", playerId);

    if (deleteSportsError) {
      throw deleteSportsError;
    }

    if (normalizedSports.length > 0) {
      const {
        error: insertSportsError,
      } = await supabase
        .from("player_sports")
        .insert(
          normalizedSports.map(
            (sport: {
              sport_id: string;
              interest_type: string;
            }) => ({
              player_id: playerId,
              sport_id:
                sport.sport_id,
              interest_type:
                sport.interest_type,
            }),
          ),
        );

      if (insertSportsError) {
        throw insertSportsError;
      }
    }

    const {
      error: deleteTeamsError,
    } = await supabase
      .from("player_favorite_teams")
      .delete()
      .eq("player_id", playerId);

    if (deleteTeamsError) {
      throw deleteTeamsError;
    }

    if (favoriteTeamIds.length > 0) {
      const {
        error: insertTeamsError,
      } = await supabase
        .from("player_favorite_teams")
        .insert(
          favoriteTeamIds.map(
            (teamId: string) => ({
              player_id: playerId,
              team_id: teamId,
              is_primary:
                primaryTeamIds.includes(
                  teamId,
                ),
            }),
          ),
        );

      if (insertTeamsError) {
        throw insertTeamsError;
      }
    }

    await writeLockerOrder(
      supabase,
      playerId,
      lockerTeamOrder.filter((teamId: string) => favoriteTeamIds.includes(teamId)),
    );

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Player profile POST error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save your profile.",
      },
      { status: 500 },
    );
  }
}
