import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";

type StoredItem = {
  id: string;
  label: string;
  repeatWeekly: boolean;
  weekOf: string | null;
  checkedWeekStart: string | null;
  createdAt: string;
};

type PackingStore = { items: StoredItem[] };

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function currentWeekStart() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

async function verifySession(db: ReturnType<typeof getAdminClient>, playerId: string, token: string) {
  if (!playerId || !token) return false;
  const { data, error } = await db.rpc("verify_player_session", {
    target_player_id: playerId,
    attempted_token: token,
  });
  return !error && data === true;
}

async function getFamilyId(db: ReturnType<typeof getAdminClient>) {
  const { data, error } = await db.from("challenges")
    .select("family_id")
    .not("family_id", "is", null)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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

async function readStore(db: ReturnType<typeof getAdminClient>, familyId: string): Promise<PackingStore> {
  await ensureBucket(db);
  const { data, error } = await db.storage.from(BUCKET).download(familyId + "/packing-list.json");
  if (error || !data) return { items: [] };
  try {
    const parsed = JSON.parse(await data.text());
    return { items: Array.isArray(parsed.items) ? parsed.items.filter((item: any) =>
      item && typeof item.id === "string" && typeof item.label === "string"
    ) : [] };
  } catch {
    return { items: [] };
  }
}

async function writeStore(db: ReturnType<typeof getAdminClient>, familyId: string, store: PackingStore) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(
    familyId + "/packing-list.json",
    JSON.stringify({ items: store.items }),
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

function visibleThisWeek(item: StoredItem, weekStart: string) {
  return item.repeatWeekly || item.weekOf === weekStart;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }
    const familyId = await getFamilyId(db);
    const weekStart = currentWeekStart();
    const store = await readStore(db, familyId);
    const items = store.items
      .filter((item) => visibleThisWeek(item, weekStart))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((item) => ({
        id: item.id,
        label: item.label,
        repeatWeekly: item.repeatWeekly,
        checked: item.checkedWeekStart === weekStart,
      }));
    return NextResponse.json({ weekStart, items });
  } catch (error) {
    console.error("Family packing list GET failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the list." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as {
      playerId?: string;
      action?: string;
      itemId?: string;
      label?: string;
      checked?: boolean;
      repeatWeekly?: boolean;
    } | null;
    const playerId = String(body?.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const familyId = await getFamilyId(db);
    const weekStart = currentWeekStart();
    const store = await readStore(db, familyId);
    const action = String(body?.action ?? "");

    if (action === "add") {
      const label = String(body?.label ?? "").trim().slice(0, 100);
      if (!label) return NextResponse.json({ error: "Add an item name first." }, { status: 400 });
      const repeatWeekly = body?.repeatWeekly !== false;
      store.items.push({
        id: randomUUID(),
        label,
        repeatWeekly,
        weekOf: repeatWeekly ? null : weekStart,
        checkedWeekStart: null,
        createdAt: new Date().toISOString(),
      });
    } else {
      const item = store.items.find((row) => row.id === String(body?.itemId ?? ""));
      if (!item) return NextResponse.json({ error: "That list item could not be found." }, { status: 404 });
      if (action === "toggle") {
        item.checkedWeekStart = body?.checked === true ? weekStart : null;
      } else if (action === "edit") {
        const label = String(body?.label ?? "").trim().slice(0, 100);
        if (!label) return NextResponse.json({ error: "Add an item name first." }, { status: 400 });
        item.label = label;
      } else if (action === "repeat") {
        item.repeatWeekly = body?.repeatWeekly === true;
        item.weekOf = item.repeatWeekly ? null : weekStart;
      } else if (action === "delete") {
        store.items = store.items.filter((row) => row.id !== item.id);
      } else {
        return NextResponse.json({ error: "Choose a valid list action." }, { status: 400 });
      }
    }

    await writeStore(db, familyId, store);
    return NextResponse.json({ ok: true, weekStart });
  } catch (error) {
    console.error("Family packing list POST failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the list." }, { status: 500 });
  }
}
