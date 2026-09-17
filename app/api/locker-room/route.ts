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
      "Locker Room session verification failed:",
      sessionError.message,
    );
    return false;
  }

  return sessionValid === true;
}

export async function GET(request: Request) {
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
            "Your FamBam session has expired.",
        },
        { status: 401 },
      );
    }

    const supabase = getAdminClient();

    const [
      playersResult,
      favoritesResult,
    ] = await Promise.all([
      supabase
        .from("players")
        .select(
          "id, display_name, initials, sort_order",
        )
        .order("sort_order"),

      supabase
        .from("player_favorite_teams")
        .select(`
          player_id,
          is_primary,
          teams (
            id,
            name,
            short_name,
            logo_url,
            sports (
              name
            )
          )
        `),
    ]);

    if (playersResult.error) {
      throw playersResult.error;
    }

    if (favoritesResult.error) {
      throw favoritesResult.error;
    }

    const favorites =
      favoritesResult.data ?? [];

    const players =
      (playersResult.data ?? []).map(
        (player) => ({
          id: player.id,
          display_name:
            player.display_name,
          initials: player.initials,
          teams: favorites
            .filter(
              (favorite: any) =>
                favorite.player_id ===
                player.id,
            )
            .map((favorite: any) => {
              const team =
                Array.isArray(
                  favorite.teams,
                )
                  ? favorite.teams[0]
                  : favorite.teams;

              const sport =
                Array.isArray(
                  team?.sports,
                )
                  ? team?.sports?.[0]
                  : team?.sports;

              return {
                id: team?.id ?? "",
                name: team?.name ?? "",
                short_name:
                  team?.short_name ?? null,
                logo_url:
                  team?.logo_url ?? null,
                sport:
                  sport?.name ?? "Other",
                is_primary:
                  favorite.is_primary ===
                  true,
              };
            })
            .filter(
              (team: any) =>
                team.id && team.name,
            ),
        }),
      );

    return NextResponse.json({
      players,
    });
  } catch (error) {
    console.error(
      "Locker Room GET error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Could not load the Locker Room.",
      },
      { status: 500 },
    );
  }
}
