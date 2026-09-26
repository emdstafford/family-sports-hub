import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

type SyncResult = {
  name: string;
  ok: boolean;
  status: number;
  data: unknown;
};

async function callInternalRoute(
  request: NextRequest,
  path: string,
): Promise<SyncResult> {
  const url = new URL(path, request.url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  return {
    name: path,
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function runSync(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  const authorization =
    request.headers.get("authorization");

  if (
    !cronSecret ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.json(
      {
        error: "Missing Supabase configuration.",
      },
      { status: 500 },
    );
  }

  const results: SyncResult[] = [];

  /*
   * NHL's schedule response includes the current week.
   * Refresh it on each sync for upcoming games, live scores,
   * final results, and Stanley Cup playoff fixtures.
   */
  results.push(
    await callInternalRoute(
      request,
      "/api/nhl/import",
    ),
  );


  /*
   * Soccer can happen throughout the week, so refresh
   * both supported soccer competitions every sync.
   */
  results.push(
    await callInternalRoute(
      request,
      "/api/soccer/premier-league/import?season=2026",
    ),
  );

  /*
   * ESPN covers the English competitions that are not
   * available on our football-data.org plan:
   * League One, Carabao Cup, FA Cup, and EFL Trophy.
   *
   * The ESPN importer refreshes recent results and
   * upcoming fixtures using daily scoreboard requests.
   */
  results.push(
    await callInternalRoute(
      request,
      "/api/soccer/espn/import",
    ),
  );

  /*
   * Keep Kentucky volleyball dates and opponents current.
   * Existing live/final scores are preserved by the schedule
   * importer and updated from ESPN on the Home page.
   */
  results.push(
    await callInternalRoute(
      request,
      "/api/college-volleyball/import",
    ),
  );

  /*
   * Keep UK Hockey and the Athens Rock Lobsters on the family calendar.
   * The importer is idempotent, so published schedule corrections are
   * safely applied without creating duplicate games.
   */
  results.push(
    await callInternalRoute(
      request,
      "/api/local-hockey/import",
    ),
  );

  // Recover missed final scores as well as today's regular-season games.
  for (let daysAgo = 0; daysAgo <= 3; daysAgo += 1) {
    const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    results.push(await callInternalRoute(request, `/api/mlb/import?date=${date}`));
  }

  // Refresh known MLB playoff matchups and results as each round is set.
  // Bracket placeholders without named teams are ignored by the importer.
  const today = new Date();
  const seasonYear = today.getUTCFullYear();
  if (today >= new Date(Date.UTC(seasonYear, 8, 20)) &&
      today <= new Date(Date.UTC(seasonYear, 10, 2))) {
    const start = new Date(today.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    results.push(await callInternalRoute(request,
      `/api/mlb/import?postseason=1&startDate=${start}&endDate=${end}`));
  }

  const supabase = createClient(
    supabaseUrl,
    supabasePublishableKey,
  );

  /*
   * Keep college-football RESULTS current without turning the hourly
   * sync into a full-season schedule refresh. Once games from the last
   * few days exist in FamBam, refresh only the CFBD weeks represented by
   * those games so final scores/statuses can grade Challenge picks.
   */
  const recentCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const recentCfbdGames = await supabase
    .from("games")
    .select("external_id, starts_at")
    .eq("external_provider", "cfbd")
    .gte("starts_at", recentCutoff)
    .lte("starts_at", new Date().toISOString());

  if (!recentCfbdGames.error && (recentCfbdGames.data ?? []).length > 0) {
    // A targeted current-year refresh updates completed/status/score data.
    // This is intentionally one call per hourly sync, not a season-wide loop.
    results.push(
      await callInternalRoute(
        request,
        `/api/college-football/import?year=${new Date().getUTCFullYear()}`,
      ),
    );
  }

  /*
   * Grade every currently open Challenge after the
   * provider results have been refreshed.
   */
  const {
    data: gradingData,
    error: gradingError,
  } = await supabase.rpc(
    "grade_open_challenges",
  );

  const gradingResults: SyncResult[] =
    gradingError
      ? [
          {
            name: "Grade open Challenges",
            ok: false,
            status: 500,
            data: {
              error: gradingError.message,
            },
          },
        ]
      : [
          {
            name: "Grade open Challenges",
            ok: true,
            status: 200,
            data: gradingData ?? [],
          },
        ];

  const warnings: SyncResult[] = [];

  const failures = [
    ...results.filter(
      (result) => !result.ok,
    ),
    ...gradingResults.filter(
      (result) => !result.ok,
    ),
  ];

  return NextResponse.json(
    {
      success: failures.length === 0,
      syncedAt: new Date().toISOString(),
      imports: results,
      grading: gradingResults,
      warnings,
      failures: failures.length,
    },
    {
      status:
        failures.length === 0 ? 200 : 207,
    },
  );
}

export async function POST(request: NextRequest) {
  return runSync(request);
}

export async function GET(request: NextRequest) {
  return runSync(request);
}
