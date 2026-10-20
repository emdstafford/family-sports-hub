import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";
const MEALS = ["breakfast", "lunch", "dinner"] as const;
type MealName = (typeof MEALS)[number];
type DayPlan = { breakfast: string; lunch: string; dinner: string; dinnerSides: string };
type MealStore = { days: Record<string, DayPlan> };

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function localDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentSunday() {
  const date = new Date(`${localDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
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

async function readStore(db: ReturnType<typeof getAdminClient>, familyId: string): Promise<MealStore> {
  await ensureBucket(db);
  const { data, error } = await db.storage.from(BUCKET).download(`${familyId}/meal-plan.json`);
  if (error || !data) return { days: {} };
  try {
    const parsed = JSON.parse(await data.text());
    return parsed && typeof parsed.days === "object" && parsed.days ? { days: parsed.days } : { days: {} };
  } catch {
    return { days: {} };
  }
}

async function writeStore(db: ReturnType<typeof getAdminClient>, familyId: string, store: MealStore) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(`${familyId}/meal-plan.json`, JSON.stringify(store), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw error;
}

function blankDay(): DayPlan {
  return { breakfast: "", lunch: "", dinner: "", dinnerSides: "" };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });

    const familyId = await getFamilyId(db);
    const weekStart = currentSunday();
    const store = await readStore(db, familyId);
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(`${weekStart}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      return { date: key, ...blankDay(), ...(store.days[key] ?? {}) };
    });
    return NextResponse.json({ weekStart, days });
  } catch (error) {
    console.error("Family meal plan GET failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the meal plan." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as {
      playerId?: string;
      date?: string;
      dinnerSides?: string;
      meals?: Partial<Record<MealName, string>>;
    } | null;
    const playerId = String(body?.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });

    const date = String(body?.date ?? "");
    const start = currentSunday();
    const last = new Date(`${start}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 6);
    const end = last.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end) {
      return NextResponse.json({ error: "Choose a day in this Sunday-to-Saturday meal plan." }, { status: 400 });
    }
    const meals = Object.fromEntries(MEALS.map((meal) => [meal, String(body?.meals?.[meal] ?? "").trim().slice(0, 120)])) as Pick<DayPlan, MealName>;
    const dinnerSides = String(body?.dinnerSides ?? "").trim().slice(0, 240);
    const familyId = await getFamilyId(db);
    const store = await readStore(db, familyId);
    store.days[date] = { ...meals, dinnerSides };
    await writeStore(db, familyId, store);
    return NextResponse.json({ ok: true, date });
  } catch (error) {
    console.error("Family meal plan POST failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the meal plan." }, { status: 500 });
  }
}
