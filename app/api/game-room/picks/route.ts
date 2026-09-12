import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase server environment variables");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const playerId =
      request.nextUrl.searchParams.get("playerId") ?? "";

    const gameId =
      request.nextUrl.searchParams.get("gameId") ?? "";

    const challengeId =
      request.nextUrl.searchParams.get("challengeId") ?? "";

    const sessionToken =
      request.headers.get("x-fambam-session") ?? "";

    if (
      !playerId ||
      !gameId ||
      !challengeId ||
      !sessionToken
    ) {
      return NextResponse.json(
        { error: "Missing Game Room pick information" },
        { status: 400 },
      );
    }

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

    if (sessionError || !sessionValid) {
      return NextResponse.json(
        { error: "Your FamBam session has expired" },
        { status: 401 },
      );
    }

    const [
      gameResult,
      playersResult,
      picksResult,
    ] = await Promise.all([
      supabase
        .from("games")
        .select("id, starts_at, start_time_tbd, status")
        .eq("id", gameId)
        .single(),

      supabase
        .from("players")
        .select("id, display_name, initials, sort_order")
        .order("sort_order", { ascending: true }),

      supabase
        .from("player_picks")
        .select("player_id, pick_choice")
        .eq("game_id", gameId)
        .eq("challenge_id", challengeId),
    ]);

    if (gameResult.error || !gameResult.data) {
      return NextResponse.json(
        { error: "Game not found" },
        { status: 404 },
      );
    }

    if (playersResult.error) {
      throw playersResult.error;
    }

    if (picksResult.error) {
      throw picksResult.error;
    }

    const game = gameResult.data;

    const normalizedStatus =
      String(game.status ?? "").toLowerCase();

    const statusHasStarted = [
      "live",
      "in_progress",
      "in progress",
      "inprogress",
      "halftime",
      "final",
      "completed",
      "complete",
    ].includes(normalizedStatus);

    const scheduledStartHasPassed =
      Boolean(game.starts_at) &&
      !game.start_time_tbd &&
      new Date(game.starts_at).getTime() <= Date.now();

    const revealed =
      statusHasStarted || scheduledStartHasPassed;

    const players = playersResult.data ?? [];
    const picks = picksResult.data ?? [];

    const pickedPlayerIds =
      new Set(
        picks.map((pick) => pick.player_id),
      );

    const revealedPicks = revealed
      ? players.map((player) => {
          const pick =
            picks.find(
              (item) =>
                item.player_id === player.id,
            ) ?? null;

          return {
            player_id: player.id,
            display_name: player.display_name,
            initials: player.initials,
            pick_choice:
              pick?.pick_choice ?? null,
          };
        })
      : [];

    return NextResponse.json({
      revealed,
      pickedCount: pickedPlayerIds.size,
      totalPlayers: players.length,
      picks: revealedPicks,
    });
  } catch (error) {
    console.error(
      "Game Room picks GET error:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load FamBam picks" },
      { status: 500 },
    );
  }
}
