import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

type SyncResult = { name: string; ok: boolean; status: number; data: unknown };

async function callInternalRoute(request: NextRequest, path: string, method: "POST" | "GET" = "POST"): Promise<SyncResult> {
  const url = new URL(path, request.url);
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  let data: unknown = null;
  try { data = await response.json(); } catch { data = await response.text(); }
  return { name: path, ok: response.ok, status: response.status, data };
}

async function runSync(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) return NextResponse.json({ error: "Missing Supabase configuration." }, { status: 500 });

  const results: SyncResult[] = [];
  const currentYear = new Date().getUTCFullYear();

  // ESPN is the primary current-week college-football source. It avoids CFBD's
  // monthly quota becoming a single point of failure for UK/UGA and Challenge picks.
  results.push(await callInternalRoute(request, "/api/college-football/espn/import"));

  // Keep CFBD as a best-effort secondary source for its historical coverage/rankings.
  // A quota error here no longer prevents ESPN data from reaching FamBam.
  results.push(await callInternalRoute(request, `/api/college-football/import?year=${currentYear}`));
  results.push(await callInternalRoute(request, `/api/college-football/rankings/import?year=${currentYear}`));

  // Men's Division-I basketball is season-aware. ESPN supplies the live D-I slate,
  // while Kentucky Athletics supplies preseason exhibitions such as Big Blue Madness.
  results.push(await callInternalRoute(request, "/api/college-basketball/import"));

  results.push(await callInternalRoute(request, "/api/nhl/import"));
  results.push(await callInternalRoute(request, "/api/soccer/premier-league/import?season=2026"));
  results.push(await callInternalRoute(request, "/api/soccer/espn/import"));
  results.push(await callInternalRoute(request, "/api/college-volleyball/import"));
  results.push(await callInternalRoute(request, "/api/local-hockey/import"));

  for (let daysAgo = 0; daysAgo <= 3; daysAgo += 1) {
    const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    results.push(await callInternalRoute(request, `/api/mlb/import?date=${date}`));
  }

  const today = new Date();
  const seasonYear = today.getUTCFullYear();
  if (today >= new Date(Date.UTC(seasonYear, 8, 20)) && today <= new Date(Date.UTC(seasonYear, 10, 2))) {
    const start = new Date(today.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    results.push(await callInternalRoute(request, `/api/mlb/import?postseason=1&startDate=${start}&endDate=${end}`));
  }

  // Use the service-role key here: hourly sync needs to read Challenge links even
  // when RLS correctly hides them from the public client.
  const supabase = createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const challengeLinks = await supabase.from("challenge_games").select("game_id");
  const selectedIds = [...new Set((challengeLinks.data ?? []).map((row) => row.game_id))];
  if (challengeLinks.error) {
    results.push({ name: "Read Challenge games", ok: false, status: 500, data: { error: challengeLinks.error.message } });
  } else if (selectedIds.length) {
    const pending = await supabase.from("games").select("id, status").in("id", selectedIds)
      .gte("starts_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).lte("starts_at", new Date().toISOString());
    if (pending.error) results.push({ name: "Read Challenge results", ok: false, status: 500, data: { error: pending.error.message } });
    else {
      const games = (pending.data ?? []).filter((game) => !["final", "finished", "complete", "closed", "cancelled", "canceled"].some((status) => game.status.toLowerCase().includes(status)));
      for (let offset = 0; offset < games.length; offset += 3) {
        const batch = await Promise.allSettled(games.slice(offset, offset + 3).map((game) => callInternalRoute(request, `/api/game-room/live?gameId=${encodeURIComponent(game.id)}`, "GET")));
        for (const result of batch) results.push(result.status === "fulfilled" ? result.value : { name: "Refresh Challenge result", ok: false, status: 502, data: { error: String(result.reason) } });
      }
    }
  }

  const { data: gradingData, error: gradingError } = await supabase.rpc("grade_open_challenges");
  const gradingResults: SyncResult[] = gradingError
    ? [{ name: "Grade open Challenges", ok: false, status: 500, data: { error: gradingError.message } }]
    : [{ name: "Grade open Challenges", ok: true, status: 200, data: gradingData ?? [] }];

  // CFBD quota failures are warnings now because ESPN is the primary live source.
  const warnings = results.filter((r) => !r.ok && r.name.includes("/api/college-football/") && !r.name.includes("/espn/"));
  const failures = [...results.filter((r) => !r.ok && !warnings.includes(r)), ...gradingResults.filter((r) => !r.ok)];

  return NextResponse.json({ success: failures.length === 0, syncedAt: new Date().toISOString(), imports: results, grading: gradingResults, warnings, failures: failures.length }, { status: failures.length === 0 ? 200 : 207 });
}

export async function POST(request: NextRequest) { return runSync(request); }
export async function GET(request: NextRequest) { return runSync(request); }
