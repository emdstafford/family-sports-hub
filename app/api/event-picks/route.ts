import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const bucket = "fambam-event-picks";
const validEvents = new Set([
  "mlb-playoffs-world-series",
  "fa-cup",
  "carabao-cup",
  "champions-league",
  "womens-champions-league",
  "subway-players-cup",
  "europa-league",
  "conference-league",
  "efl-trophy",
  "stanley-cup",
]);

const mamaHockeyEventPattern =
  /^mamas-hockey-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAllowedEvent(eventId: string) {
  return validEvents.has(eventId) || mamaHockeyEventPattern.test(eventId);
}

type EventPick = {
  playerId: string;
  gameId: string;
  pickChoice: "home" | "away";
  submittedAt: string;
};

type NhlSchedule = {
  gameWeek?: Array<{
    games?: Array<{
      id: number;
      gameState: string;
      homeTeam: { score?: number };
      awayTeam: { score?: number };
    }>;
  }>;
};

function easternDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifySession(
  supabase: ReturnType<typeof getAdminClient>,
  playerId: string,
  sessionToken: string,
) {
  const { data, error } = await supabase.rpc("verify_player_session", {
    target_player_id: playerId,
    attempted_token: sessionToken,
  });
  return !error && data === true;
}

async function ensureBucket(supabase: ReturnType<typeof getAdminClient>) {
  const { data } = await supabase.storage.getBucket(bucket);
  if (data) return;
  const { error } = await supabase.storage.createBucket(bucket, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}

async function readPicks(
  supabase: ReturnType<typeof getAdminClient>,
  eventId: string,
): Promise<EventPick[]> {
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(`2026-27/${eventId}.json`);
  if (error || !data) return [];
  try {
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed.picks) ? parsed.picks : [];
  } catch {
    return [];
  }
}

async function writePicks(
  supabase: ReturnType<typeof getAdminClient>,
  eventId: string,
  picks: EventPick[],
) {
  await ensureBucket(supabase);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(
      `2026-27/${eventId}.json`,
      JSON.stringify({ eventId, season: "2026-27", picks, updatedAt: new Date().toISOString() }),
      { contentType: "application/json", upsert: true },
    );
  if (error) throw error;
}

export async function GET(request: NextRequest) {
  try {
    const playerId = request.nextUrl.searchParams.get("playerId") ?? "";
    const eventId = request.nextUrl.searchParams.get("eventId") ?? "";
    const sessionToken = request.headers.get("x-fambam-session") ?? "";

    if (!playerId || !isAllowedEvent(eventId) || !sessionToken) {
      return NextResponse.json({ error: "Missing event pick information." }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!(await verifySession(supabase, playerId, sessionToken))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const picks = await readPicks(supabase, eventId);
    const gameIds = [...new Set(picks.map((pick) => pick.gameId))];
    const { data: games, error: gamesError } = gameIds.length
      ? await supabase
          .from("games")
          .select("id, status, home_score, away_score, starts_at, external_provider, external_id")
          .in("id", gameIds)
      : { data: [], error: null };
    if (gamesError) throw gamesError;

    // The daily sports import can lag a late NHL finish. Check selected games
    // directly with the NHL before grading this week's hockey event.
    if (mamaHockeyEventPattern.test(eventId)) {
      const stale = (games ?? []).filter((game) =>
        game.external_provider === "nhl" && game.external_id && game.starts_at &&
        new Date(game.starts_at).getTime() < Date.now() - 3 * 60 * 60 * 1000 &&
        (game.home_score === null || game.away_score === null ||
          !["final", "finished", "complete", "completed", "closed"].some((status) =>
            String(game.status ?? "").toLowerCase().includes(status))));
      const dates = [...new Set(stale.map((game) => easternDate(game.starts_at!)))];
      await Promise.all(dates.map(async (date) => {
        try {
          const response = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, { cache: "no-store" });
          if (!response.ok) return;
          const schedule = (await response.json()) as NhlSchedule;
          const providerGames = schedule.gameWeek?.flatMap((day) => day.games ?? []) ?? [];
          for (const game of stale.filter((candidate) => easternDate(candidate.starts_at!) === date)) {
            const latest = providerGames.find((candidate) => String(candidate.id) === game.external_id);
            if (!latest || !["OFF", "FINAL"].includes(latest.gameState.toUpperCase()) ||
                typeof latest.homeTeam.score !== "number" || typeof latest.awayTeam.score !== "number") continue;
            const update = { status: "final", home_score: latest.homeTeam.score, away_score: latest.awayTeam.score };
            const { error } = await supabase.from("games").update(update).eq("id", game.id);
            if (error) { console.error("Could not refresh NHL event result:", error); continue; }
            Object.assign(game, update);
          }
        } catch (error) {
          console.error("Could not check NHL event results:", error);
        }
      }));
    }

    const gameById = new Map((games ?? []).map((game) => [game.id, game]));
    const playerPicks = picks.filter((pick) => pick.playerId === playerId);
    let completed = 0;
    let correct = 0;

    const outcomes: Array<{
      gameId: string;
      result: "correct" | "incorrect" | "draw";
      homeScore: number;
      awayScore: number;
    }> = [];

    for (const pick of playerPicks) {
      const game = gameById.get(pick.gameId);
      if (!game || game.home_score === null || game.away_score === null) continue;
      const status = String(game.status ?? "").toLowerCase();
      const final = ["final", "finished", "complete", "completed", "closed"]
        .some((value) => status.includes(value));
      if (!final) continue;
      const homeScore = Number(game.home_score);
      const awayScore = Number(game.away_score);
      if (homeScore === awayScore) {
        outcomes.push({ gameId: pick.gameId, result: "draw", homeScore, awayScore });
        continue;
      }
      completed += 1;
      const winner = homeScore > awayScore ? "home" : "away";
      const result = pick.pickChoice === winner ? "correct" : "incorrect";
      if (result === "correct") correct += 1;
      outcomes.push({ gameId: pick.gameId, result, homeScore, awayScore });
    }

    return NextResponse.json({
      eventId,
      picks: playerPicks.map((pick) => ({
        gameId: pick.gameId,
        pickChoice: pick.pickChoice,
        submittedAt: pick.submittedAt,
      })),
      outcomes,
      progress: {
        made: playerPicks.length,
        completed,
        correct,
        accuracy: completed > 0 ? Math.round((correct / completed) * 100) : 0,
      },
      trophies: {
        firstEventPick: playerPicks.length > 0,
        cupExpert: correct >= 3,
        perfectRound: completed >= 3 && correct === completed,
      },
    });
  } catch (error) {
    console.error("Event picks GET failed:", error);
    return NextResponse.json({ error: "Could not load event picks." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const pickChoice = body.pickChoice === "home" || body.pickChoice === "away"
      ? body.pickChoice
      : null;
    const sessionToken = typeof body.sessionToken === "string"
      ? body.sessionToken.trim()
      : request.headers.get("x-fambam-session")?.trim() ?? "";

    if (!playerId || !isAllowedEvent(eventId) || !gameId || !pickChoice || !sessionToken) {
      return NextResponse.json({ error: "Choose a team before saving." }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!(await verifySession(supabase, playerId, sessionToken))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, starts_at, start_time_tbd, status")
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: "That event game could not be found." }, { status: 404 });
    }

    const status = String(game.status ?? "").toLowerCase();
    const started = ["live", "in_progress", "in progress", "halftime", "final", "finished", "complete", "completed", "closed"]
      .some((value) => status.includes(value));
    const kickoffPassed = Boolean(game.starts_at) &&
      !game.start_time_tbd &&
      new Date(game.starts_at).getTime() <= Date.now();

    if (started || kickoffPassed) {
      return NextResponse.json({ error: "This pick locked at kickoff." }, { status: 409 });
    }

    const picks = await readPicks(supabase, eventId);
    const nextPick: EventPick = {
      playerId,
      gameId,
      pickChoice,
      submittedAt: new Date().toISOString(),
    };
    const nextPicks = [
      ...picks.filter((pick) => !(pick.playerId === playerId && pick.gameId === gameId)),
      nextPick,
    ];
    await writePicks(supabase, eventId, nextPicks);

    return NextResponse.json({ ok: true, pick: nextPick });
  } catch (error) {
    console.error("Event picks POST failed:", error);
    return NextResponse.json({ error: "Could not save this event pick." }, { status: 500 });
  }
}
