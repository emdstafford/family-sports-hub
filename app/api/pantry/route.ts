import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-family-tools";
type StorePrice = {
  id: string;
  store: string;
  price: number;
  packageSize: number;
  packageUnit: string;
  purchasedAt: string;
  purchasedBy: string;
};
type PantryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  lowAt: number;
  expirationDate: string | null;
  frozenAt: string | null;
  packageSize: number;
  packageUnit: string;
  store: string;
  lastPrice: number | null;
  stockUpPrice: number | null;
  rating: "not_tried" | "love" | "okay" | "no_thanks";
  notes: string;
  updatedAt: string;
  priceHistory: StorePrice[];
};
type GroceryLine = { id: string; name: string; pantryItemId: string | null; addedAt: string; addedBy: string };
type PantryStore = { items: PantryItem[]; groceries: GroceryLine[] };

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
async function readStore(db: ReturnType<typeof getAdminClient>, familyId: string): Promise<PantryStore> {
  await ensureBucket(db);
  const { data, error } = await db.storage.from(BUCKET).download(familyId + "/pantry.json");
  if (error || !data) return { items: [], groceries: [] };
  try {
    const parsed = JSON.parse(await data.text());
    return { items: Array.isArray(parsed.items) ? parsed.items.filter((item: unknown): item is PantryItem =>
      typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" && "name" in item && typeof item.name === "string" && "quantity" in item && Number.isFinite(Number(item.quantity))
    ).map((item: PantryItem) => ({ ...item, lowAt: Number.isFinite(Number(item.lowAt)) ? Number(item.lowAt) : 1, expirationDate: typeof item.expirationDate === "string" ? item.expirationDate : null, frozenAt: typeof item.frozenAt === "string" ? item.frozenAt : null })) : [], groceries: Array.isArray(parsed.groceries) ? parsed.groceries : [] };
  } catch { return { items: [], groceries: [] }; }
}
async function writeStore(db: ReturnType<typeof getAdminClient>, familyId: string, store: PantryStore) {
  await ensureBucket(db);
  const { error } = await db.storage.from(BUCKET).upload(familyId + "/pantry.json",
    JSON.stringify(store), { contentType: "application/json", upsert: true });
  if (error) throw error;
}
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const cleanText = (value: unknown, max = 100) => String(value ?? "").trim().slice(0, max);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const familyId = await getFamilyId(db);
    const store = await readStore(db, familyId);
    return NextResponse.json({ items: store.items.sort((a, b) => a.name.localeCompare(b.name)), groceries: store.groceries });
  } catch (error) {
    console.error("Pantry GET failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the pantry." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const playerId = String(body?.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    const db = getAdminClient();
    if (!(await verifySession(db, playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const { data: player, error: playerError } = await db.from("players").select("display_name").eq("id", playerId).maybeSingle();
    if (playerError) throw playerError;
    const familyId = await getFamilyId(db);
    const store = await readStore(db, familyId);
    const action = cleanText(body?.action, 24);

    if (action === "grocery-add") {
      const name = cleanText(body?.name);
      if (!name) return NextResponse.json({ error: "Enter a grocery item." }, { status: 400 });
      let item = store.items.find((row) => row.name.toLowerCase() === name.toLowerCase());
      if (!item) {
        const now = new Date().toISOString();
        item = { id: randomUUID(), name, category: "Pantry", quantity: 0, unit: "packages", lowAt: 1, expirationDate: null, frozenAt: null, packageSize: 1, packageUnit: "count", store: "Not recorded", lastPrice: null, stockUpPrice: null, rating: "not_tried", notes: "", updatedAt: now, priceHistory: [] };
        store.items.push(item);
      }
      if (!store.groceries.some((row) => row.pantryItemId === item!.id || row.name.toLowerCase() === name.toLowerCase())) {
        store.groceries.unshift({ id: randomUUID(), name: item.name, pantryItemId: item.id, addedAt: new Date().toISOString(), addedBy: cleanText(player?.display_name, 60) || "Family" });
      }
    } else if (action === "grocery-bought" || action === "grocery-remove") {
      const line = store.groceries.find((row) => row.id === String(body?.groceryId ?? ""));
      if (line && action === "grocery-bought" && line.pantryItemId) {
        const item = store.items.find((row) => row.id === line.pantryItemId);
        if (item) { item.quantity = Math.round(item.quantity + 1); item.updatedAt = new Date().toISOString(); }
      }
      store.groceries = store.groceries.filter((row) => row.id !== String(body?.groceryId ?? ""));
    } else if (action === "purchase") {
      const name = cleanText(body?.name);
      const category = cleanText(body?.category, 30) || "Freezer";
      const packages = numberOrNull(body?.packages) ?? 0;
      const packageSize = numberOrNull(body?.packageSize) ?? 1;
      const packageUnit = cleanText(body?.packageUnit, 20) || "count";
      const expirationDate = cleanText(body?.expirationDate, 10) || null;
      const frozenAt = cleanText(body?.frozenAt, 10) || null;
      const storeName = cleanText(body?.store, 40) || "Not recorded";
      const price = numberOrNull(body?.price);
      const stockUpPrice = numberOrNull(body?.stockUpPrice);
      const rating = ["not_tried", "love", "okay", "no_thanks"].includes(String(body?.rating))
        ? String(body?.rating) as PantryItem["rating"] : "not_tried";
      if (!name) return NextResponse.json({ error: "Enter a food name." }, { status: 400 });
      if (packages <= 0 || packageSize <= 0) return NextResponse.json({ error: "Enter a package count and package size greater than zero." }, { status: 400 });
      const normalized = name.toLowerCase();
      let item = store.items.find((row) => row.name.toLowerCase() === normalized);
      const now = new Date().toISOString();
      if (!item) {
        item = {
          id: randomUUID(), name, category, quantity: 0, unit: "packages", lowAt: 1, expirationDate, frozenAt, packageSize,
          packageUnit, store: storeName, lastPrice: null, stockUpPrice, rating,
          notes: cleanText(body?.notes, 500), updatedAt: now, priceHistory: [],
        };
        store.items.push(item);
      }
      item.name = name;
      item.category = category;
      item.quantity = Math.round(item.quantity + packages);
      item.packageSize = packageSize;
      if (expirationDate) item.expirationDate = expirationDate;
      if (frozenAt) item.frozenAt = frozenAt;
      item.store = storeName;
      if (price !== null) {
        item.lastPrice = price;
        item.priceHistory.unshift({ id: randomUUID(), store: storeName, price, packageSize, packageUnit, purchasedAt: now, purchasedBy: cleanText(player?.display_name, 60) || "Family" });
        item.priceHistory = item.priceHistory.slice(0, 30);
      }
      if (stockUpPrice !== null) item.stockUpPrice = stockUpPrice;
      if (rating !== "not_tried") item.rating = rating;
      const purchaseNotes = cleanText(body?.notes, 500);
      if (purchaseNotes) item.notes = purchaseNotes;
      item.updatedAt = now;
      store.groceries = store.groceries.filter((row) => row.pantryItemId !== item!.id);
    } else {
      const item = store.items.find((row) => row.id === String(body?.itemId ?? ""));
      if (!item) return NextResponse.json({ error: "That pantry item could not be found." }, { status: 404 });
      if (action === "adjust") {
        const delta = Number(body?.delta);
        if (!Number.isFinite(delta)) return NextResponse.json({ error: "Choose a valid quantity change." }, { status: 400 });
        item.quantity = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
      } else if (action === "edit") {
        const name = cleanText(body?.name);
        if (!name) return NextResponse.json({ error: "Enter a food name." }, { status: 400 });
        item.name = name;
        item.category = cleanText(body?.category, 30) || item.category;
        item.stockUpPrice = numberOrNull(body?.stockUpPrice);
        item.lowAt = Math.max(0, Math.round(numberOrNull(body?.lowAt) ?? 1));
        item.expirationDate = cleanText(body?.expirationDate, 10) || null;
        item.frozenAt = cleanText(body?.frozenAt, 10) || null;
        item.rating = ["not_tried", "love", "okay", "no_thanks"].includes(String(body?.rating)) ? String(body?.rating) as PantryItem["rating"] : item.rating;
        item.notes = cleanText(body?.notes, 500);
      } else if (action === "delete") {
        store.items = store.items.filter((row) => row.id !== item.id);
        store.groceries = store.groceries.filter((row) => row.pantryItemId !== item.id);
      } else {
        return NextResponse.json({ error: "Choose a valid pantry action." }, { status: 400 });
      }
      item.updatedAt = new Date().toISOString();
    }
    await writeStore(db, familyId, store);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Pantry POST failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the pantry." }, { status: 500 });
  }
}
