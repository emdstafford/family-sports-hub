import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TeamRow = {
  name: string;
};

type CompetitionRow = {
  name: string;
};

type SportRow = {
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
  sport: SportRow | SportRow[] | null;
};

function getName(
  value:
    | TeamRow
    | CompetitionRow
    | SportRow
    | TeamRow[]
    | CompetitionRow[]
    | SportRow[]
    | null,
) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value.name;
}

const SELECT_FIELDS = `
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
`;

const SELECT_FIELDS_WITH_SPORT_FILTER = `
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
  sport:sports!games_sport_id_fkey!inner(name)
`;

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
    const gameId = searchParams.get("gameId");

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

    const rows: GameRow[] = [];

    // When a specific Game Room asks for one game,
    // avoid loading the entire sports database.
    if (gameId) {
      let query = supabase
        .from("games")
        .select(
          sport
            ? SELECT_FIELDS_WITH_SPORT_FILTER
            : SELECT_FIELDS,
        )
        .eq("id", gameId);

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

      rows.push(...((data ?? []) as unknown as GameRow[]));
    } else {
      // Supabase/PostgREST limits a response to 1,000 rows.
      // Page through all games so later-season sports such as
      // NHL and MLB are not silently cut off.
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        let query = supabase
          .from("games")
          .select(
            sport
              ? SELECT_FIELDS_WITH_SPORT_FILTER
              : SELECT_FIELDS,
          )
          .order("starts_at", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

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

        const page =
          (data ?? []) as unknown as GameRow[];

        rows.push(...page);

        if (page.length < PAGE_SIZE) {
          break;
        }

        from += PAGE_SIZE;
      }
    }

    const games = rows.map((row) => ({
      id: row.id,
      sport: getName(row.sport) ?? "Sports",
      competition:
        getName(row.competition) ?? "Game",
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
    }));

    return NextResponse.json({
      games,
    });
  } catch (error) {
    console.error(
      "Games API unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error: "Unexpected error loading games.",
      },
      { status: 500 },
    );
  }
}
