import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AddChallengeGameBody = {
  playerId?: string;
  challengeId?: string;
  gameId?: string;
  pin?: string;
};

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        {
          error: "Server configuration is incomplete.",
        },
        { status: 500 },
      );
    }

    const body =
      (await request.json().catch(() => null)) as
        | AddChallengeGameBody
        | null;

    if (
      !body?.playerId ||
      !body.challengeId ||
      !body.gameId ||
      !body.pin
    ) {
      return NextResponse.json(
        {
          error: "Missing required information.",
        },
        { status: 400 },
      );
    }

    if (!/^\d{4}$/.test(body.pin)) {
      return NextResponse.json(
        {
          error: "A valid 4-digit PIN is required.",
        },
        { status: 400 },
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

    const { data, error } = await supabase.rpc(
      "admin_add_game_to_challenge",
      {
        target_player_id: body.playerId,
        target_challenge_id: body.challengeId,
        target_game_id: body.gameId,
        attempted_pin: body.pin,
      },
    );

    if (error) {
      console.error(
        "Add challenge game error:",
        error,
      );

      const message = error.message ?? "";

      if (
        message.includes("Invalid PIN") ||
        message.includes("Admin access required")
      ) {
        return NextResponse.json(
          {
            error: "Admin verification failed.",
          },
          { status: 403 },
        );
      }

      if (message.includes("Challenge is not open")) {
        return NextResponse.json(
          {
            error: "That Challenge is no longer open.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: "Could not add the game to the Challenge.",
          details: message,
        },
        { status: 500 },
      );
    }

    if (data === "already_added") {
      return NextResponse.json({
        success: true,
        status: "already_added",
        message: "That game is already in the Challenge.",
      });
    }

    return NextResponse.json({
      success: true,
      status: "added",
      message: "Game added to the FamBam Challenge!",
    });
  } catch (error) {
    console.error(
      "Challenge game route error:",
      error,
    );

    return NextResponse.json(
      {
        error: "Unexpected error adding the game.",
      },
      { status: 500 },
    );
  }
}