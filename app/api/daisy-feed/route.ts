import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";
type FeedEvent = { id: string; fedAt: string; fedBy: string };
type FeedStore = { events: FeedEvent[] };

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
  if (error || !data) return { events: [] };
  try {
    const parsed = JSON.parse(await data.text());
    return { events: Array.isArray(parsed.events) ? parsed.events.filter((event: any) =>
      event && typeof event.id === "string" && typeof event.fedAt === "string" && typeof event.fedBy === "string"
    ) : [] };
  } catch { return { events: [] }; }
}
async function writeStore(db: ReturnType<typeof getAdminClient>, familyId: string, store: FeedStore) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(familyId + "/daisy-feed.json",
    JSON.stringify({ events: store.events.slice(-100) }), { contentType: "application/json", upsert: true });
  if (error) throw error;
}
function dateInEastern(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
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
    const events = store.events.sort((a, b) => b.fedAt.localeCompare(a.fedAt));
    const today = dateInEastern(new Date().toISOString());
    return NextResponse.json({ latest: events[0] ?? null, today: events.filter(event => dateInEastern(event.fedAt) === today) });
  } catch (error) {
    console.error("Daisy feed GET failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Daisy's feeding log." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { playerId?: string } | null;
    const playerId = String(body?.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const { data: player, error: playerError } = await db.from("players").select("display_name").eq("id", playerId).maybeSingle();
    if (playerError) throw playerError;
    if (!player?.display_name) return NextResponse.json({ error: "Could not identify who is logging the feeding." }, { status: 404 });
    const familyId = await getFamilyId(db);
    const store = await readStore(db, familyId);
    const event: FeedEvent = { id: randomUUID(), fedAt: new Date().toISOString(), fedBy: String(player.display_name) };
    store.events.push(event);
    await writeStore(db, familyId, store);
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    console.error("Daisy feed POST failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not log Daisy's feeding." }, { status: 500 });
  }
}
