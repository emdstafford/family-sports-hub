import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
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

function hashToken(token: string) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
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

    const pin =
      typeof body.pin === "string"
        ? body.pin
        : "";

    if (
      !playerId ||
      !/^\d{4}$/.test(pin)
    ) {
      return NextResponse.json(
        {
          error:
            "Player and 4-digit PIN are required.",
        },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const {
      data: pinValid,
      error: pinError,
    } = await supabase.rpc(
      "verify_player_pin",
      {
        target_player_id: playerId,
        attempted_pin: pin,
      },
    );

    // TEMPORARY DEBUGGING:
    // Return the Supabase error details so we can see
    // exactly why the RPC call is failing locally.
    if (pinError) {
      return NextResponse.json(
        {
          error:
            pinError.message ||
            "Supabase PIN verification failed.",
          code:
            pinError.code ?? null,
          details:
            pinError.details ?? null,
          hint:
            pinError.hint ?? null,
        },
        { status: 500 },
      );
    }

    if (!pinValid) {
      return NextResponse.json(
        {
          error:
            "That PIN wasn't right. Try again.",
        },
        { status: 401 },
      );
    }

    const sessionToken =
      randomBytes(32).toString("hex");

    const tokenHash =
      hashToken(sessionToken);

    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 90,
    );

    const { error: sessionError } =
      await supabase
        .from("player_device_sessions")
        .insert({
          player_id: playerId,
          token_hash: tokenHash,
          expires_at:
            expiresAt.toISOString(),
        });

    if (sessionError) {
      return NextResponse.json(
        {
          error:
            sessionError.message ||
            "Could not remember this device.",
          code:
            sessionError.code ?? null,
          details:
            sessionError.details ?? null,
          hint:
            sessionError.hint ?? null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      playerId,
      sessionToken,
      expiresAt:
        expiresAt.toISOString(),
    });
  } catch (error) {
    console.error(
      "Player session error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create player session.",
      },
      { status: 500 },
    );
  }
}