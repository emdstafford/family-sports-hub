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
      "Player session verification failed:",
      sessionError.message,
    );

    return false;
  }

  return sessionValid === true;
}

export async function GET(
  request: Request,
) {
  try {
    const { searchParams } = new URL(
      request.url,
    );

    const playerId =
      searchParams.get("playerId") ?? "";

    const challengeId =
      searchParams.get("challengeId") ?? "";

    const sessionToken =
      request.headers.get(
        "x-fambam-session",
      ) ?? "";

    if (
      !playerId ||
      !challengeId ||
      !sessionToken
    ) {
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

    const {
      data,
      error,
    } = await supabase.rpc(
      "get_my_challenge_picks_session",
      {
        target_player_id: playerId,
        target_challenge_id:
          challengeId,
      },
    );

    if (error) {
      console.error(
        "Load picks error:",
        error.message,
      );

      return NextResponse.json(
        {
          error:
            "Could not open your picks.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      picks: data ?? [],
    });
  } catch (error) {
    console.error(
      "Player picks GET error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not open your picks.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const body = await request.json();

    const playerId =
      typeof body.playerId === "string"
        ? body.playerId
        : "";

    const challengeId =
      typeof body.challengeId === "string"
        ? body.challengeId
        : "";

    const gameId =
      typeof body.gameId === "string"
        ? body.gameId
        : "";

    const pickChoice =
      typeof body.pickChoice === "string"
        ? body.pickChoice
        : "";

    const sessionToken =
      request.headers.get(
        "x-fambam-session",
      ) ?? "";

    if (
      !playerId ||
      !challengeId ||
      !gameId ||
      !pickChoice ||
      !sessionToken
    ) {
      return NextResponse.json(
        {
          error:
            "Pick information and a remembered FamBam session are required.",
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

    const supabase = getAdminClient();

    const {
      data,
      error,
    } = await supabase.rpc(
      "save_player_pick_session",
      {
        target_player_id: playerId,
        target_game_id: gameId,
        target_challenge_id:
          challengeId,
        target_pick_choice:
          pickChoice,
      },
    );

    if (error) {
      console.error(
        "Save pick error:",
        error.message,
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not save your pick.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: data === true,
    });
  } catch (error) {
    console.error(
      "Player picks POST error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not save your pick.",
      },
      { status: 500 },
    );
  }
}
