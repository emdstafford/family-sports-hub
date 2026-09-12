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

    return NextResponse.json({
      player: playerResult.data,
      sports: sportsResult.data ?? [],
      teams: teamsResult.data ?? [],
      playerSports:
        playerSportsResult.data ?? [],
      favoriteTeams:
        favoriteTeamsResult.data ?? [],
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
