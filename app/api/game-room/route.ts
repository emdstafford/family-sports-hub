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
    const playerId = request.nextUrl.searchParams.get("playerId");
    const gameId = request.nextUrl.searchParams.get("gameId");
    const sessionToken = request.headers.get("x-fambam-session");

    console.log("GAME ROOM DEBUG", {
      playerId,
      gameId,
      hasSessionToken: Boolean(sessionToken),
      playerIdLength: playerId?.length ?? null,
      gameIdLength: gameId?.length ?? null,
    });

    if (!playerId || !gameId || !sessionToken) {
      return NextResponse.json(
        { error: "Missing Game Room session information" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase.rpc(
      "get_game_messages_session",
      {
        target_player_id: playerId,
        target_game_id: gameId,
        attempted_token: sessionToken,
      },
    );

    if (error) {
      console.error("Game Room GET error:", error);

      return NextResponse.json(
        { error: "Unable to load Game Room messages" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      messages: data ?? [],
    });
  } catch (error) {
    console.error("Game Room GET exception:", error);

    return NextResponse.json(
      { error: "Unable to load Game Room" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.headers.get("x-fambam-session");

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Missing FamBam session" },
        { status: 401 },
      );
    }

    const body = await request.json();

    const playerId =
      typeof body?.playerId === "string"
        ? body.playerId
        : "";

    const gameId =
      typeof body?.gameId === "string"
        ? body.gameId
        : "";

    const action =
      typeof body?.action === "string"
        ? body.action
        : "message";

    if (!playerId || !gameId) {
      return NextResponse.json(
        { error: "Missing Game Room information" },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    if (action === "typing") {
      const { data: sessionValid, error: sessionError } =
        await supabase.rpc(
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

      const { error: typingError } =
        await supabase
          .from("game_room_events")
          .insert({
            game_id: gameId,
            event_type: "typing",
            player_id: playerId,
          });

      if (typingError) {
        console.error(
          "Game Room typing signal error:",
          typingError,
        );

        return NextResponse.json(
          { error: "Unable to send typing signal" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        action: "typing",
      });
    }

    const message =
      typeof body?.message === "string"
        ? body.message
        : "";

    const cleanedMessage = message.trim();

    if (!cleanedMessage) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 },
      );
    }

    if (cleanedMessage.length > 500) {
      return NextResponse.json(
        { error: "Message is too long" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc(
      "send_game_message_session",
      {
        target_player_id: playerId,
        target_game_id: gameId,
        attempted_token: sessionToken,
        new_message: cleanedMessage,
      },
    );

    if (error) {
      console.error("Game Room POST error:", error);

      return NextResponse.json(
        { error: "Unable to send message" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      action: "message",
      messageId: data,
    });
  } catch (error) {
    console.error("Game Room POST exception:", error);

    return NextResponse.json(
      { error: "Unable to send Game Room action" },
      { status: 500 },
    );
  }
}

