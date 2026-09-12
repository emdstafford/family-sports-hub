import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getCollegeFootballWeek(now = new Date()) {
  const year = now.getUTCFullYear();

  /*
   * FamBam only needs regular-season CFB syncing
   * during the late-summer/fall season.
   */
  const month = now.getUTCMonth();

  if (month < 7 || month > 11) {
    return null;
  }

  /*
   * Treat the Monday on or immediately before
   * September 1 as the start of Week 1.
   *
   * For 2026:
   * Aug 31 = Week 1
   * Sep 7  = Week 2
   */
  const septemberFirst = new Date(
    Date.UTC(year, 8, 1),
  );

  const dayOfWeek =
    septemberFirst.getUTCDay();

  const daysBackToMonday =
    dayOfWeek === 0
      ? 6
      : dayOfWeek - 1;

  const weekOneStart = new Date(
    septemberFirst,
  );

  weekOneStart.setUTCDate(
    septemberFirst.getUTCDate() -
      daysBackToMonday,
  );

  const millisecondsPerDay =
    24 * 60 * 60 * 1000;

  const daysSinceWeekOne = Math.floor(
    (
      now.getTime() -
      weekOneStart.getTime()
    ) / millisecondsPerDay,
  );

  const week =
    Math.floor(daysSinceWeekOne / 7) + 1;

  return {
    year,
    week: Math.max(1, week),
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
   * Soccer can happen throughout the week, so refresh
   * both supported soccer competitions every sync.
   */
  results.push(
    await callInternalRoute(
      request,
      "/api/soccer/premier-league/import?season=2026",
    ),
  );

  results.push(
    await callInternalRoute(
      request,
      "/api/soccer/league-one/import?season=2026",
    ),
  );

  /*
   * College football changes heavily on game days.
   * Refresh the current week plus the previous week
   * so late finals/delays still get picked up.
   */
  const collegeFootball =
    getCollegeFootballWeek();

  if (collegeFootball) {
    const weeks = [
      collegeFootball.week,
      collegeFootball.week - 1,
    ].filter(
      (week, index, values) =>
        week >= 1 &&
        values.indexOf(week) === index,
    );

    for (const week of weeks) {
      results.push(
        await callInternalRoute(
          request,
          `/api/college-football/import?year=${collegeFootball.year}&week=${week}`,
        ),
      );
    }
  }

  /*
   * Grade every currently open Challenge after the
   * provider results have been refreshed.
   */
  const supabase = createClient(
    supabaseUrl,
    supabasePublishableKey,
  );

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

  /*
   * League One may be unavailable on the current
   * football-data.org plan. Treat that specific 403
   * as a warning so it does not break the rest of sync.
   */
  const warnings = results.filter(
    (result) =>
      result.name.includes(
        "/api/soccer/league-one/import",
      ) &&
      !result.ok &&
      result.status === 502 &&
      typeof result.data === "object" &&
      result.data !== null &&
      "status" in result.data &&
      (result.data as { status?: number }).status === 403,
  );

  const failures = [
    ...results.filter(
      (result) =>
        !result.ok &&
        !warnings.includes(result),
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
