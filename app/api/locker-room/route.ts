import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function verifySession(playerId: string, sessionToken: string) {
  const supabase = getAdminClient();

  const { data: sessionValid, error: sessionError } = await supabase.rpc(
    "verify_player_session",
    {
      target_player_id: playerId,
      attempted_token: sessionToken,
    },
  );

  if (sessionError) {
    console.error(
      "Locker Room session verification failed:",
      sessionError.message,
    );
    return false;
  }

  return sessionValid === true;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get("playerId") ?? "";
    const sessionToken =
      request.headers.get("x-fambam-session") ?? "";

    if (!playerId || !sessionToken) {
      return NextResponse.json(
        { error: "A remembered FamBam session is required." },
        { status: 401 },
      );
    }

    if (!(await verifySession(playerId, sessionToken))) {
      return NextResponse.json(
        { error: "Your FamBam session has expired." },
        { status: 401 },
      );
    }

    const supabase = getAdminClient();

    const [
      playerResult,
      sportsResult,
      favoritesResult,
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, display_name, initials, sort_order")
        .eq("id", playerId)
        .single(),

      supabase
        .from("sports")
        .select("id, name")
        .eq("active", true),

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

    if (playerResult.error) throw playerResult.error;
    if (sportsResult.error) throw sportsResult.error;
    if (favoritesResult.error) throw favoritesResult.error;

    const sportNames = new Map(
      (sportsResult.data ?? []).map((sport) => [
        sport.id,
        sport.name,
      ]),
    );

    const teams = (favoritesResult.data ?? [])
      .map((favorite: any) => {
        const team = Array.isArray(favorite.teams)
          ? favorite.teams[0]
          : favorite.teams;

        if (!team?.id || !team?.name) return null;

        return {
          id: team.id,
          name: team.name,
          short_name: team.short_name ?? team.abbreviation ?? null,
          logo_url: team.logo_url ?? null,
          sport: sportNames.get(team.sport_id) ?? "Other",
          is_primary: favorite.is_primary === true,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      players: [
        {
          id: playerResult.data.id,
          display_name: playerResult.data.display_name,
          initials: playerResult.data.initials,
          teams,
        },
      ],
    });
  } catch (error) {
    console.error("Locker Room GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the Locker Room.",
      },
      { status: 500 },
    );
  }
}
