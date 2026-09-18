import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
  const [
    { data: players, error: playerError },
    { data: challengeGames, error: challengeGamesError },
    { data: picks, error: picksError },
  ] = await Promise.all([
    supabase.from("players").select("id, display_name, initials, sort_order").order("sort_order"),
    supabase.from("challenge_games").select("challenge_id, game_id"),
    supabase.from("player_picks").select("challenge_id, game_id, player_id, pick_choice"),
  ]);

  if (playerError || challengeGamesError || picksError) {
    console.error("Record Book setup failed:", playerError?.message ?? challengeGamesError?.message ?? picksError?.message);
    return [];
  }

  const gameIds = [...new Set((challengeGames ?? []).map((row) => row.game_id))];
  const { data: games, error: gamesError } = gameIds.length
    ? await supabase.from("games").select("id, status, home_score, away_score").in("id", gameIds)
    : { data: [], error: null };
  if (gamesError) {
    console.error("Record Book games failed:", gamesError.message);
    return [];
  }

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
      total_picks: (challengeGames ?? []).length,
      accuracy: 0,
    });
  }

  const gameById = new Map((games ?? []).map((game) => [game.id, game]));
  const includedPickKeys = new Set((challengeGames ?? []).map((row) => `${row.challenge_id}:${row.game_id}`));

  for (const pick of picks ?? []) {
    if (!includedPickKeys.has(`${pick.challenge_id}:${pick.game_id}`)) continue;
    const total = totals.get(pick.player_id);
    const game = gameById.get(pick.game_id);
    if (!total || !game) continue;

    const finalStatus = String(game.status ?? "").toLowerCase();
    const isFinal = ["final", "finished", "complete", "completed", "closed"].some((value) => finalStatus.includes(value));
    if (!isFinal || game.home_score == null || game.away_score == null) continue;

    total.completed_picks += 1;
    const winningChoice = game.home_score > game.away_score
      ? "home"
      : game.away_score > game.home_score
        ? "away"
        : "draw";
    if (pick.pick_choice === winningChoice) {
      total.correct += 1;
      total.points += 1;
    }
  }

  return [...totals.values()].map((row) => ({
    ...row,
    accuracy: row.completed_picks > 0 ? (row.correct / row.completed_picks) * 100 : 0,
  }));
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

    const [recordBookLeaderboard, { data: playerAvatars, error: playerAvatarsError }] = await Promise.all([
      getRecordBookLeaderboard(supabase),
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
      recordBookLeaderboard,
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
