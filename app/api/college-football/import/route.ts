import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  homeId: number | null;
  homeTeam: string;
  homeClassification: string | null;
  homePoints: number | null;
  awayId: number | null;
  awayTeam: string;
  awayClassification: string | null;
  awayPoints: number | null;
  notes: string | null;
};

function isFamilyTeam(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === "georgia" || normalized === "kentucky";
}

function shouldKeepGame(game: CfbdGame) {
  // Permanent FamBam college-football rule:
  // 1. ALWAYS keep every Georgia and Kentucky game.
  // 2. Otherwise keep only FBS-vs-FBS games.
  if (isFamilyTeam(game.homeTeam) || isFamilyTeam(game.awayTeam)) {
    return true;
  }

  return (
    game.homeClassification?.toLowerCase() === "fbs" &&
    game.awayClassification?.toLowerCase() === "fbs"
  );
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    const cfbdApiKey = process.env.CFBD_API_KEY;

    if (!supabaseUrl || !supabaseSecretKey || !cfbdApiKey) {
      return NextResponse.json(
        { error: "Required server environment variables are missing." },
        { status: 500 },
      );
    }

    const requestUrl = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    const queryYear = requestUrl.searchParams.get("year");
    const queryWeek = requestUrl.searchParams.get("week");
    const queryTeam = requestUrl.searchParams.get("team");

    const year =
      queryYear && !Number.isNaN(Number(queryYear))
        ? Number(queryYear)
        : typeof body.year === "number"
          ? body.year
          : new Date().getFullYear();

    const week =
      queryWeek && !Number.isNaN(Number(queryWeek))
        ? Number(queryWeek)
        : typeof body.week === "number"
          ? body.week
          : undefined;

    const team =
      queryTeam?.trim() ||
      (typeof body.team === "string" && body.team.trim()
        ? body.team.trim()
        : undefined);

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: competition, error: competitionError } =
      await supabase
        .from("competitions")
        .select("id, sport_id, name")
        .eq("name", "NCAA Football")
        .single();

    if (competitionError || !competition) {
      return NextResponse.json(
        {
          error: 'Could not find the "NCAA Football" competition.',
          details: competitionError?.message ?? null,
        },
        { status: 500 },
      );
    }
      const competitionSportId = competition.sport_id;

    /*
     * IMPORTANT:
     * We intentionally do NOT send classification=fbs here.
     *
     * We need CFBD to return Georgia/Kentucky games against FCS
     * opponents too. We fetch the week, then apply FamBam's rule
     * locally with shouldKeepGame().
     */
    const cfbdUrl = new URL(
      "https://api.collegefootballdata.com/games",
    );

    cfbdUrl.searchParams.set("year", String(year));
    cfbdUrl.searchParams.set("seasonType", "regular");

    if (week !== undefined) {
      cfbdUrl.searchParams.set("week", String(week));
    }

    if (team) {
      cfbdUrl.searchParams.set("team", team);
    }

    const cfbdResponse = await fetch(cfbdUrl, {
      headers: {
        Authorization: `Bearer ${cfbdApiKey}`,
      },
      cache: "no-store",
    });

    if (!cfbdResponse.ok) {
      const message = await cfbdResponse.text();

      return NextResponse.json(
        {
          error: "CollegeFootballData request failed.",
          status: cfbdResponse.status,
          details: message,
        },
        { status: cfbdResponse.status },
      );
    }

    const receivedGames =
      (await cfbdResponse.json()) as CfbdGame[];

    const games = receivedGames.filter(shouldKeepGame);
    const excludedGames = receivedGames.filter(
      (game) => !shouldKeepGame(game),
    );

    /*
     * Clean up lower-division matchups previously imported,
     * but NEVER delete a Georgia or Kentucky game.
     */
    const excludedIds = excludedGames.map((game) => String(game.id));

    if (excludedIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from("games")
        .delete()
        .eq("external_provider", "cfbd")
        .in("external_id", excludedIds);

      if (cleanupError) {
        return NextResponse.json(
          {
            error: "Could not clean up excluded college-football games.",
            details: cleanupError.message,
            hint:
              "Run: grant delete on public.games to service_role;",
          },
          { status: 500 },
        );
      }
    }

    let teamsProcessed = 0;
    let gamesImported = 0;
    let gamesSkipped = 0;

    const teamCache = new Map<string, string>();

    async function getOrCreateTeam(
      externalId: number,
      name: string,
    ) {
      const key = String(externalId);
      const cached = teamCache.get(key);

      if (cached) return cached;

      const { data: importedTeam, error: teamError } =
        await supabase
          .from("teams")
          .upsert(
            {
              sport_id: competitionSportId,
              name,
              external_provider: "cfbd",
              external_id: key,
            },
            {
              onConflict: "external_provider,external_id",
            },
          )
          .select("id")
          .single();

      if (teamError || !importedTeam) {
        throw new Error(
          `Failed importing team ${name}: ${
            teamError?.message ?? "Unknown error"
          }`,
        );
      }

      teamCache.set(key, importedTeam.id);
      teamsProcessed += 1;
      return importedTeam.id;
    }

    for (const game of games) {
      if (
        game.homeId === null ||
        game.awayId === null ||
        !game.homeTeam ||
        !game.awayTeam
      ) {
        gamesSkipped += 1;
        continue;
      }

      const homeTeamId = await getOrCreateTeam(
        game.homeId,
        game.homeTeam,
      );
      const awayTeamId = await getOrCreateTeam(
        game.awayId,
        game.awayTeam,
      );

      const { error: gameError } = await supabase
        .from("games")
        .upsert(
          {
            sport_id: competitionSportId,
            competition_id: competition.id,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            starts_at: game.startDate,
            start_time_tbd: game.startTimeTBD,
            source_notes: game.notes,
            home_score: game.homePoints,
            away_score: game.awayPoints,
            status: game.completed ? "final" : "scheduled",
            external_provider: "cfbd",
            external_id: String(game.id),
          },
          {
            onConflict: "external_provider,external_id",
          },
        );

      if (gameError) {
        return NextResponse.json(
          {
            error: `Failed importing ${game.awayTeam} at ${game.homeTeam}.`,
            details: gameError.message,
          },
          { status: 500 },
        );
      }

      gamesImported += 1;
    }

    const familyGames = games.filter(
      (game) =>
        isFamilyTeam(game.homeTeam) ||
        isFamilyTeam(game.awayTeam),
    ).map((game) => `${game.awayTeam} at ${game.homeTeam}`);

    return NextResponse.json({
      success: true,
      source: "cfbd",
      year,
      week: week ?? null,
      team: team ?? null,
      scope: "FBS-vs-FBS plus all Georgia/Kentucky games",
      gamesReceived: receivedGames.length,
      gamesKept: games.length,
      excludedGamesRemoved: excludedGames.length,
      gamesImported,
      gamesSkipped,
      teamsProcessed,
      familyGames,
    });
  } catch (error) {
    console.error("College football import error:", error);

    return NextResponse.json(
      {
        error: "Unexpected import error.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 },
    );
  }
}
