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
   * CollegeFootballData is intentionally NOT called by
   * the hourly sports sync.
   *
   * FamBam keeps the CFB schedule already stored in
   * Supabase, while CFBD is reserved for a separate
   * low-frequency schedule refresh to protect its
   * monthly API quota.
   */

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
