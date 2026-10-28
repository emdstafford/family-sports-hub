import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";
type FeedEvent = { id: string; fedAt: string; fedBy: string };
type WaterEvent = { id: string; changedAt: string; changedBy: string };
type FeedStore = { latestFeed: FeedEvent | null; latestWater: WaterEvent | null };

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function verifySession(db: ReturnType<typeof getAdminClient>, playerId: string, token: string) {
  if (!playerId || !token) return false;
  const { data, error } = await db.rpc("verify_player_session", { target_player_id: playerId, attempted_token: token });
  return !error && data === true;
}
async function getFamilyId(db: ReturnType<typeof getAdminClient>) {
  const { data, error } = await db.from("challenges").select("family_id").not("family_id", "is", null)
    .order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.family_id) throw new Error("Could not find the FamBam family.");
  return String(data.family_id);
}
async function ensureBucket(db: ReturnType<typeof getAdminClient>) {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}
async function readStore(db: ReturnType<typeof getAdminClient>, familyId: string): Promise<FeedStore> {
  await ensureBucket(db);
  const { data, error } = await db.storage.from(BUCKET).download(familyId + "/daisy-feed.json");
  if (error || !data) return { latestFeed: null, latestWater: null };
  try {
    const parsed = JSON.parse(await data.text());
    const events = Array.isArray(parsed.events) ? parsed.events.filter((event: unknown): event is FeedEvent =>
      typeof event === "object" && event !== null && "id" in event && typeof event.id === "string" && "fedAt" in event && typeof event.fedAt === "string" && "fedBy" in event && typeof event.fedBy === "string"
    ).sort((a: FeedEvent, b: FeedEvent) => b.fedAt.localeCompare(a.fedAt)) : [];
    return {
      latestFeed: parsed.latestFeed && typeof parsed.latestFeed.fedAt === "string" ? parsed.latestFeed : (events[0] ?? null),
      latestWater: parsed.latestWater && typeof parsed.latestWater.changedAt === "string" ? parsed.latestWater : null,
    };
  } catch { return { latestFeed: null, latestWater: null }; }
}
async function writeStore(db: ReturnType<typeof getAdminClient>, familyId: string, store: FeedStore) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(familyId + "/daisy-feed.json",
    JSON.stringify(store), { contentType: "application/json", upsert: true });
  if (error) throw error;
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const familyId = await getFamilyId(db);
    const store = await readStore(db, familyId);
    return NextResponse.json({ latest: store.latestFeed, latestWater: store.latestWater });
  } catch (error) {
    console.error("Daisy feed GET failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Daisy's feeding log." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { playerId?: string; action?: string } | null;
    const playerId = String(body?.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const { data: player, error: playerError } = await db.from("players").select("display_name").eq("id", playerId).maybeSingle();
    if (playerError) throw playerError;
    if (!player?.display_name) return NextResponse.json({ error: "Could not identify who is logging the feeding." }, { status: 404 });
    const familyId = await getFamilyId(db);
    const store = await readStore(db, familyId);
    const now = new Date().toISOString();
    const action = body?.action === "water" ? "water" : "feed";
    if (action === "water") {
      store.latestWater = { id: randomUUID(), changedAt: now, changedBy: String(player.display_name) };
    } else {
      store.latestFeed = { id: randomUUID(), fedAt: now, fedBy: String(player.display_name) };
    }
    await writeStore(db, familyId, store);
    return NextResponse.json({ ok: true, latest: store.latestFeed, latestWater: store.latestWater });
  } catch (error) {
    console.error("Daisy feed POST failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not log Daisy's feeding." }, { status: 500 });
  }
}
