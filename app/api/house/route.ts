import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { validHouseDate, type HouseRecord } from "@/lib/house-records";
import { HOUSE_HISTORY } from "@/lib/house-history";
type HouseStore = { records: HouseRecord[]; imports: string[] };
const BUCKET = "fambam-family-tools";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function session(db: ReturnType<typeof admin>, playerId: string, token: string) {
  if (!playerId || !token) return false;
  const { data, error } = await db.rpc("verify_player_session", { target_player_id: playerId, attempted_token: token });
  return !error && data === true;
}
async function family(db: ReturnType<typeof admin>) {
  const { data, error } = await db.from("challenges").select("family_id").not("family_id", "is", null).order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.family_id) throw new Error("Could not find the FamBam family.");
  return String(data.family_id);
}
async function read(db: ReturnType<typeof admin>, familyId: string): Promise<HouseStore> {
  const { data: bucket } = await db.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false });
    if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  }
  const { data, error } = await db.storage.from(BUCKET).download(`${familyId}/house.json`);
  if (error) {
    if (["404", "400"].includes(String(error.statusCode)) && /not found|does not exist/i.test(error.message)) return { records: [], imports: [] };
    throw new Error("Could not read House records. Please try again.");
  }
  if (!data) throw new Error("House records could not be read.");
  const parsed = JSON.parse(await data.text());
  if (!Array.isArray(parsed.records)) throw new Error("House records could not be read.");
  return { records: parsed.records, imports: Array.isArray(parsed.imports) ? parsed.imports : [] };
}
const clean = (value: unknown, max = 100) => String(value ?? "").trim().slice(0, max);
function number(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("Enter a number zero or greater.");
  return result;
}
export async function GET(request: Request) {
  try {
    const db = admin(), playerId = new URL(request.url).searchParams.get("playerId") ?? "";
    if (!await session(db, playerId, request.headers.get("x-fambam-session") ?? "")) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    return NextResponse.json({ records: (await read(db, await family(db))).records });
  } catch (error) { console.error("House GET failed", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load House." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json(), db = admin(), playerId = clean(body.playerId);
    if (!await session(db, playerId, request.headers.get("x-fambam-session") ?? "")) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const familyId = await family(db), store = await read(db, familyId), records = store.records;
    if (body.action === "import-history") {
      const marker = "google-house-history-2026-10-20-v1";
      if (store.imports.includes(marker)) return NextResponse.json({ ok: true });
      const now = new Date().toISOString();
      for (const entry of HOUSE_HISTORY) if (!records.some((row) => row.id === entry.id)) records.push({ ...entry, createdAt: now, updatedAt: now });
      store.imports.push(marker);
    } else if (body.action === "delete") {
      const index = records.findIndex((record) => record.id === body.id);
      if (index === -1) return NextResponse.json({ error: "That record could not be found." }, { status: 404 });
      records.splice(index, 1);
    } else if (body.action === "save") {
      if (!["filter", "propane", "electricity"].includes(body.kind) || !validHouseDate(body.date)) return NextResponse.json({ error: "Choose a record type and a valid date." }, { status: 400 });
      let cost: number | null, percentage: number | null, gallons: number | null, kwh: number | null;
      try { cost = number(body.cost); percentage = body.kind === "propane" ? number(body.percentage) : null; gallons = body.kind === "propane" ? number(body.gallons) : null; kwh = body.kind === "electricity" ? number(body.kwh) : null; }
      catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
      const nextDue = body.kind === "filter" ? clean(body.nextDue, 10) || null : null;
      if ((percentage !== null && percentage > 100) || (nextDue && (nextDue.length !== 10 || !validHouseDate(nextDue)))) return NextResponse.json({ error: "Propane must be 0–100%. Use a valid next-change date." }, { status: 400 });
      if (body.kind === "filter" && !clean(body.label)) return NextResponse.json({ error: "Name the filter or its location." }, { status: 400 });
      if (body.kind === "propane" && percentage === null && cost === null && gallons === null) return NextResponse.json({ error: "Enter a tank percentage, purchase cost, or gallons." }, { status: 400 });
      if (body.kind === "electricity" && cost === null && kwh === null) return NextResponse.json({ error: "Enter the bill amount or electricity usage." }, { status: 400 });
      const existing = body.id ? records.find((record) => record.id === body.id) : null;
      if (body.id && !existing) return NextResponse.json({ error: "That record could not be found." }, { status: 404 });
      const { data: player, error } = await db.from("players").select("display_name").eq("id", playerId).maybeSingle();
      if (error) throw error;
      const now = new Date().toISOString();
      const record: HouseRecord = { id: existing?.id ?? randomUUID(), kind: body.kind, date: body.date, label: clean(body.label), cost: cost === null ? null : Math.round(cost * 100) / 100, percentage, gallons, kwh, nextDue, notes: clean(body.notes, 1000), createdAt: existing?.createdAt ?? now, updatedAt: now, addedBy: existing?.addedBy ?? player?.display_name ?? "Family", sourceUrl: existing?.sourceUrl };
      if (existing) records.splice(records.indexOf(existing), 1, record); else records.push(record);
    } else return NextResponse.json({ error: "Choose a valid House action." }, { status: 400 });
    const { error } = await db.storage.from(BUCKET).upload(`${familyId}/house.json`, JSON.stringify(store), { contentType: "application/json", upsert: true });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("House POST failed", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save House records." }, { status: 500 }); }
}
