import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";
type PrayerRequest = { id: string; whoFor: string; request: string; details: string; createdBy: string; createdById: string; createdAt: string; prayingBy: { playerId: string; name: string }[]; answered: boolean; answeredAt: string | null };
type Store = { requests: PrayerRequest[] };
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function verify(db: ReturnType<typeof admin>, playerId: string, token: string) {
  if (!playerId || !token) return false;
  const { data, error } = await db.rpc("verify_player_session", { target_player_id: playerId, attempted_token: token });
  return !error && data === true;
}
async function familyId(db: ReturnType<typeof admin>) {
  const { data, error } = await db.from("challenges").select("family_id").not("family_id", "is", null).order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.family_id) throw new Error("Could not find the FamBam family.");
  return String(data.family_id);
}
async function ensureBucket(db: ReturnType<typeof admin>) {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}
async function read(db: ReturnType<typeof admin>, id: string): Promise<Store> {
  await ensureBucket(db);
  const { data, error } = await db.storage.from(BUCKET).download(`${id}/family-prayers.json`);
  if (error || !data) return { requests: [] };
  try { const parsed = JSON.parse(await data.text()); return { requests: Array.isArray(parsed.requests) ? parsed.requests : [] }; }
  catch { return { requests: [] }; }
}
async function write(db: ReturnType<typeof admin>, id: string, store: Store) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(`${id}/family-prayers.json`, JSON.stringify(store), { contentType: "application/json", upsert: true });
  if (error) throw error;
}
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const playerId = url.searchParams.get("playerId") ?? ""; const db = admin();
    if (!(await verify(db, playerId, request.headers.get("x-fambam-session") ?? ""))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const store = await read(db, await familyId(db));
    return NextResponse.json({ requests: store.requests.sort((a, b) => Number(a.answered) - Number(b.answered) || b.createdAt.localeCompare(a.createdAt)) });
  } catch (error) { console.error("Family prayers GET failed:", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load prayer requests." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const playerId = String(body?.playerId ?? ""); const db = admin();
    if (!(await verify(db, playerId, request.headers.get("x-fambam-session") ?? ""))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const { data: player, error: playerError } = await db.from("players").select("display_name,is_admin").eq("id", playerId).maybeSingle();
    if (playerError) throw playerError;
    const storeId = await familyId(db); const store = await read(db, storeId); const action = clean(body?.action, 20);
    if (action === "add") {
      const text = clean(body?.request);
      if (!text) return NextResponse.json({ error: "Write a prayer request first." }, { status: 400 });
      store.requests.unshift({ id: randomUUID(), whoFor: clean(body?.whoFor, 80), request: text, details: clean(body?.details), createdBy: clean(player?.display_name, 60) || "Family", createdById: playerId, createdAt: new Date().toISOString(), prayingBy: [], answered: false, answeredAt: null });
    } else {
      const item = store.requests.find((row) => row.id === String(body?.requestId ?? ""));
      if (!item) return NextResponse.json({ error: "That prayer request could not be found." }, { status: 404 });
      if (action === "praying") {
        const name = clean(player?.display_name, 60) || "Family";
        const current = Array.isArray(item.prayingBy) ? item.prayingBy.filter((person) => person && typeof person === "object" && typeof person.playerId === "string") : [];
        item.prayingBy = current.some((person) => person.playerId === playerId) ? current.filter((person) => person.playerId !== playerId) : [...current, { playerId, name }];
      } else if (action === "answered") {
        if (item.createdById !== playerId && !player?.is_admin) return NextResponse.json({ error: "Only the person who added this request can update its answer status." }, { status: 403 });
        item.answered = Boolean(body?.answered); item.answeredAt = item.answered ? new Date().toISOString() : null;
      } else if (action === "delete") {
        if (item.createdById !== playerId && !player?.is_admin) return NextResponse.json({ error: "Only the person who added this request can remove it." }, { status: 403 });
        store.requests = store.requests.filter((row) => row.id !== item.id);
      } else return NextResponse.json({ error: "Choose a valid prayer action." }, { status: 400 });
    }
    await write(db, storeId, store);
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Family prayers POST failed:", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update prayer requests." }, { status: 500 }); }
}
