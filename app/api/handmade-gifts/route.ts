import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";
type HandmadePlan = { id: string; recipient: string; occasion: string; year: number; product: string; quantity: number; made: number; addedBy: string; addedById: string; createdAt: string; sourceBatchId?: string };
type Store = { items: HandmadePlan[] };

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
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
  const { data, error } = await db.storage.from(BUCKET).download(`${id}/handmade-gifts.json`);
  if (error) {
    const status = Number((error as { statusCode?: number | string }).statusCode);
    if ((status === 400 || status === 404) && /not found|not_found|does not exist/i.test(error.message)) return { items: [] };
    throw new Error("Could not read the gift plan. Please try again.");
  }
  if (!data) throw new Error("Could not read the gift plan. Please try again.");
  const parsed = JSON.parse(await data.text());
  if (!Array.isArray(parsed.items)) throw new Error("Gift plan data could not be read.");
  return { items: parsed.items };
}
async function write(db: ReturnType<typeof admin>, id: string, store: Store) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(`${id}/handmade-gifts.json`, JSON.stringify(store), { contentType: "application/json", upsert: true });
  if (error) throw error;
}
const clean = (value: unknown, max = 100) => String(value ?? "").trim().slice(0, max);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const playerId = url.searchParams.get("playerId") ?? "";
    const db = admin();
    if (!(await verify(db, playerId, request.headers.get("x-fambam-session") ?? ""))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const store = await read(db, await familyId(db));
    return NextResponse.json({ items: store.items.sort((a, b) => a.product.localeCompare(b.product) || a.recipient.localeCompare(b.recipient)) });
  } catch (error) { console.error("Handmade gift GET failed:", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the gift plan." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const playerId = String(body?.playerId ?? ""); const db = admin();
    if (!(await verify(db, playerId, request.headers.get("x-fambam-session") ?? ""))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const { data: player, error } = await db.from("players").select("display_name").eq("id", playerId).maybeSingle();
    if (error) throw error;
    const id = await familyId(db); const store = await read(db, id); const action = clean(body?.action, 20);
    if (action === "add") {
      const recipient = clean(body?.recipient); const product = clean(body?.product); const occasion = clean(body?.occasion, 60) || "Year-round";
      const year = Number(body?.year ?? new Date().getFullYear()); const quantity = Number(body?.quantity ?? 1);
      if (!recipient || !product) return NextResponse.json({ error: "Add both a recipient and what you plan to make." }, { status: 400 });
      if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) return NextResponse.json({ error: "Enter a valid year and quantity." }, { status: 400 });
      const sourceBatchId = clean(body?.sourceBatchId);
      if (sourceBatchId) {
        const { data, error: stockError } = await db.storage.from(BUCKET).download(`${id}/pantry.json`);
        if (stockError || !data) return NextResponse.json({ error: "Could not check the homemade batch. Please refresh." }, { status: 400 });
        const pantry = JSON.parse(await data.text());
        const batch = Array.isArray(pantry.canning) ? pantry.canning.find((row: { id: string }) => row.id === sourceBatchId) : null;
        if (!batch) return NextResponse.json({ error: "That homemade batch is no longer available." }, { status: 400 });
      }
      store.items.unshift({ sourceBatchId: sourceBatchId || undefined, id: randomUUID(), recipient, occasion, year, product, quantity, made: 0, addedBy: clean(player?.display_name, 60) || "Family", addedById: playerId, createdAt: new Date().toISOString() });
    } else {
      const item = store.items.find((row) => row.id === String(body?.itemId ?? ""));
      if (!item) return NextResponse.json({ error: "That gift plan could not be found." }, { status: 404 });
      if (action === "quantity" || action === "made") {
        const delta = Number(body?.delta);
        if (!Number.isInteger(delta) || Math.abs(delta) !== 1) return NextResponse.json({ error: "Change the count one at a time." }, { status: 400 });
        if (action === "quantity") item.quantity = Math.max(item.made, Math.min(500, item.quantity + delta));
        else item.made = Math.max(0, Math.min(item.quantity, item.made + delta));
      }
      else if (action === "delete") store.items = store.items.filter((row) => row.id !== item.id);
      else return NextResponse.json({ error: "Choose a valid gift-plan action." }, { status: 400 });
    }
    await write(db, id, store);
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Handmade gift POST failed:", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the gift plan." }, { status: 500 }); }
}
