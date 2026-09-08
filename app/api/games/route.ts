import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TeamRow = {
  name: string;
};

type CompetitionRow = {
  name: string;
};

type GameRow = {
  id: string;
  starts_at: string | null;
  start_time_tbd: boolean;
  source_notes: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  external_provider: string | null;
  external_id: string | null;
  home_team: TeamRow | TeamRow[] | null;
  away_team: TeamRow | TeamRow[] | null;
  competition: CompetitionRow | CompetitionRow[] | null;
};

function getName(
  value: TeamRow | CompetitionRow | TeamRow[] | CompetitionRow[] | null,
) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value.name;
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);

    const sport = searchParams.get("sport");

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let query = supabase
      .from("games")
      .select(`
        id,
        starts_at,
        start_time_tbd,
        source_notes,
        home_score,
        away_score,
        status,
        external_provider,
        external_id,
        home_team:teams!games_home_team_id_fkey(name),
        away_team:teams!games_away_team_id_fkey(name),
        competition:competitions!games_competition_id_fkey(name),
        sport:sports!games_sport_id_fkey(name)
      `)
      .order("starts_at", { ascending: true });

    if (sport) {
      query = query.eq("sport.name", sport);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Games API error:", error);

      return NextResponse.json(
        {
          error: "Could not load games.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    const games = (data ?? []).map((game) => {
      const row = game as unknown as GameRow & {
        sport:
          | {
              name: string;
            }
          | {
              name: string;
            }[]
          | null;
      };

      return {
        id: row.id,
        sport: getName(row.sport) ?? "Sports",
        competition: getName(row.competition) ?? "Game",
        home: getName(row.home_team) ?? "TBD",
        away: getName(row.away_team) ?? "TBD",
        startsAt: row.starts_at,
        startTimeTbd: row.start_time_tbd,
        sourceNotes: row.source_notes,
        homeScore: row.home_score,
        awayScore: row.away_score,
        status: row.status,
        externalProvider: row.external_provider,
        externalId: row.external_id,
      };
    });

    return NextResponse.json({
      games,
    });
  } catch (error) {
    console.error("Games API unexpected error:", error);

    return NextResponse.json(
      { error: "Unexpected error loading games." },
      { status: 500 },
    );
  }
}