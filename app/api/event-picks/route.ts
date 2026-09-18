import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const bucket = "fambam-event-picks";
const validEvents = new Set([
  "fa-cup",
  "carabao-cup",
  "champions-league",
  "efl-trophy",
]);

type EventPick = {
  playerId: string;
  gameId: string;
  pickChoice: "home" | "away";
  submittedAt: string;
};

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

    if (!playerId || !validEvents.has(eventId) || !sessionToken) {
      return NextResponse.json({ error: "Missing event pick information." }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!(await verifySession(supabase, playerId, sessionToken))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const picks = await readPicks(supabase, eventId);
    return NextResponse.json({
      eventId,
      picks: picks
        .filter((pick) => pick.playerId === playerId)
        .map((pick) => ({
          gameId: pick.gameId,
          pickChoice: pick.pickChoice,
          submittedAt: pick.submittedAt,
        })),
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
    const sessionToken = request.headers.get("x-fambam-session") ?? "";

    if (!playerId || !validEvents.has(eventId) || !gameId || !pickChoice || !sessionToken) {
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
