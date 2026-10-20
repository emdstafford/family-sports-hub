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
  stockUpUnitPrice?: number | null;
  rating: "not_tried" | "love" | "okay" | "no_thanks";
  notes: string;
  updatedAt: string;
  priceHistory: StorePrice[];
};
type GroceryLine = { id: string; name: string; pantryItemId: string | null; addedAt: string; addedBy: string };
type CanningBatch = { id: string; name: string; cannedAt: string; jarSize: string; jarsMade: number; jarsUsed: number; ingredients: { name: string; cost: number }[]; totalCost: number; costPerJar: number; notes?: string; needsCount?: boolean; costYield?: number; costUnknown?: boolean };
type PantryStore = { items: PantryItem[]; groceries: GroceryLine[]; canning: CanningBatch[]; imports?: string[]; canningUsage?: { batchId: string; name: string; jarSize: string; amount: number; usedAt: string }[] };

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
  if (error || !data) return { items: [], groceries: [], canning: [] };
  try {
    const parsed = JSON.parse(await data.text());
    return { canningUsage: Array.isArray(parsed.canningUsage) ? parsed.canningUsage : [], imports: Array.isArray(parsed.imports) ? parsed.imports : [], canning: Array.isArray(parsed.canning) ? parsed.canning.filter((batch: unknown) => typeof batch === "object" && batch !== null && "id" in batch && "name" in batch) : [], items: Array.isArray(parsed.items) ? parsed.items.filter((item: unknown): item is PantryItem =>
      typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" && "name" in item && typeof item.name === "string" && "quantity" in item && Number.isFinite(Number(item.quantity))
    ).map((item: PantryItem) => ({ ...item, lowAt: Number.isFinite(Number(item.lowAt)) ? Number(item.lowAt) : 1, expirationDate: typeof item.expirationDate === "string" ? item.expirationDate : null, frozenAt: typeof item.frozenAt === "string" ? item.frozenAt : null })) : [], groceries: Array.isArray(parsed.groceries) ? parsed.groceries : [] };
  } catch { return { items: [], groceries: [], canning: [] }; }
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
    return NextResponse.json({ items: store.items.sort((a, b) => a.name.localeCompare(b.name)), groceries: store.groceries, canning: store.canning, canningUsage: store.canningUsage ?? [] });
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

    if (action === "canning-import-2025") {
      const importId = "emily-canning-notes-2025-v1";
      if (store.imports?.includes(importId)) return NextResponse.json({ ok: true });
      const rows: [string, string, number, number, number | null, number | null, { name: string; cost: number }[], string][] = [
        ["Green beans", "quart", 70, 24, 80, 50, [{ name: "Green beans — 2 bushels", cost: 80 }], "2025 annual total: 70 quarts. Cost note covers a separate 50-quart yield, not all 70 jars."],
        ["Vegetable soup", "quart", 39, 5, 89.50, 38, [{ name: "Corn", cost: 16 }, { name: "Okra (quantity recorded as 12)", cost: 10 }, { name: "Canning tomatoes — 2 boxes", cost: 32 }, { name: "Green beans", cost: 15 }, { name: "Carrots — Costco and Ingles", cost: 10 }, { name: "Potatoes — Costco", cost: 4 }, { name: "Onion — Costco", cost: 2.50 }], "Annual total says 39 quarts; cost note says 38-quart yield. Corn note also lists an alternative 3 dozen for $25; saved cost uses the recorded $89.50 total."],
        ["Squash", "quart", 9, 7, null, null, [], "Ingredient costs not recorded."],
        ["Sweet potatoes", "quart", 10, 1, null, null, [], "Ingredient costs not recorded."],
        ["Carrots", "pint", 50, 9, null, null, [], "Ingredient costs not recorded."],
        ["Tomatoes", "pint", 6, 0, null, null, [], "Ate zero in the source note. Ingredient costs not recorded."],
        ["Corn", "pint", 4, 0, null, null, [], "Ate zero in the source note. Ingredient costs not recorded."],
        ["Blueberry jam", "half-pint", 35, 16, 8.41, 35, [{ name: "Blueberries — free from Kayla’s bushes", cost: 0 }, { name: "Sugar — one 4 lb bag", cost: 3.46 }, { name: "Sure-Jell — 3 at $1.65", cost: 4.95 }], "Blueberries were free from Kayla’s bushes. Ingredient costs exclude jars and lids."],
        ["Peach jam", "half-pint", 46, 28, 51.82, 46, [{ name: "Peaches — half bushel", cost: 35 }, { name: "Sugar — two 4 lb bags", cost: 6.92 }, { name: "Sure-Jell — 6 at $1.65", cost: 9.90 }], "Ingredient costs exclude jars and lids."],
        ["Peach concentrate", "pint", 5, 0, null, null, [], "Five pints made; amount eaten was not recorded. Remaining count needs checking."],
      ];
      for (const [name, jarSize, jarsMade, jarsUsed, cost, yieldCount, ingredients, notes] of rows) {
        const id = `${importId}-${name.toLowerCase().replaceAll(" ", "-")}`;
        if (!store.canning.some((batch) => batch.id === id)) store.canning.push({ id, name, jarSize, cannedAt: "2025", jarsMade, jarsUsed, ingredients, totalCost: cost ?? 0, costPerJar: cost !== null && yieldCount ? Math.round(cost / yieldCount * 100) / 100 : 0, costYield: yieldCount ?? undefined, costUnknown: cost === null, needsCount: true, notes: `Imported from your 2025 notes; not a current shelf count. ${notes}` });
      }
      store.imports = [...(store.imports ?? []), importId];
    } else if (action === "canning-count") {
      const batch = store.canning.find((entry) => entry.id === String(body?.batchId ?? ""));
      if (!batch) return NextResponse.json({ error: "That batch could not be found." }, { status: 404 });
      const remaining = numberOrNull(body?.remaining);
      if (remaining === null || !Number.isInteger(remaining) || remaining > batch.jarsMade) return NextResponse.json({ error: "Enter whole jars left between zero and the number made." }, { status: 400 });
      batch.jarsUsed = batch.jarsMade - remaining;
      batch.needsCount = false;
    } else if (action === "canning-add") {
      const name = cleanText(body?.name, 100);
      const jarsMade = numberOrNull(body?.jarsMade) ?? 0;
      const jarSize = cleanText(body?.jarSize, 30);
      const cannedAt = cleanText(body?.cannedAt, 10) || new Date().toISOString().slice(0, 10);
      const ingredients = Array.isArray(body?.ingredients) ? body.ingredients.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return { name: cleanText(row.name, 100), cost: numberOrNull(row.cost) ?? -1 };
      }).filter((entry) => entry.name && entry.cost >= 0) : [];
      if (!name || !jarSize || !Number.isInteger(jarsMade) || jarsMade < 1 || !ingredients.length) return NextResponse.json({ error: "Add a name, jar size, number of jars, and ingredient costs." }, { status: 400 });
      const totalCost = Math.round(ingredients.reduce((sum, entry) => sum + entry.cost, 0) * 100) / 100;
      store.canning.unshift({ id: randomUUID(), name, cannedAt, jarSize, jarsMade, jarsUsed: 0, ingredients, totalCost, costPerJar: Math.round(totalCost / jarsMade * 100) / 100 });
    } else if (action === "canning-use" || action === "canning-delete") {
      const batch = store.canning.find((entry) => entry.id === String(body?.batchId ?? ""));
      if (!batch) return NextResponse.json({ error: "That canning batch could not be found." }, { status: 404 });
      if (action === "canning-use") {
        const amount = numberOrNull(body?.amount) ?? 0;
        if (!Number.isInteger(amount) || amount < 1 || batch.jarsUsed + amount > batch.jarsMade) return NextResponse.json({ error: "Enter a valid number of jars used." }, { status: 400 });
        batch.jarsUsed += amount;
        (store.canningUsage ??= []).push({ batchId: batch.id, name: batch.name, jarSize: batch.jarSize, amount, usedAt: new Date().toISOString() });
      } else store.canning = store.canning.filter((entry) => entry.id !== batch.id);
    } else if (action === "grocery-add") {
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
      const stockUpUnitPrice = numberOrNull(body?.stockUpUnitPrice);
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
          packageUnit, store: storeName, lastPrice: null, stockUpPrice: null, stockUpUnitPrice, rating,
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
      if (stockUpUnitPrice !== null) {
        item.stockUpUnitPrice = stockUpUnitPrice;
        item.stockUpPrice = null;
      }
      if (rating !== "not_tried") item.rating = rating;
      const purchaseNotes = cleanText(body?.notes, 500);
      if (purchaseNotes) item.notes = purchaseNotes;
      item.updatedAt = now;
      store.groceries = store.groceries.filter((row) => row.pantryItemId !== item!.id);
    } else if (action === "price-record") {
      const item = store.items.find((row) => row.id === String(body?.itemId ?? ""));
      if (!item) return NextResponse.json({ error: "That pantry item could not be found." }, { status: 404 });
      const price = numberOrNull(body?.price);
      const packageSize = numberOrNull(body?.packageSize);
      const packageUnit = cleanText(body?.packageUnit, 20) || "count";
      if (price === null || price <= 0 || packageSize === null || packageSize <= 0) return NextResponse.json({ error: "Enter a price and package size greater than zero." }, { status: 400 });
      item.priceHistory.unshift({ id: randomUUID(), store: cleanText(body?.store, 40) || "Other", price, packageSize, packageUnit, purchasedAt: new Date().toISOString(), purchasedBy: cleanText(player?.display_name, 60) || "Family" });
      item.priceHistory = item.priceHistory.slice(0, 30);
      item.updatedAt = new Date().toISOString();
    } else {
      const item = store.items.find((row) => row.id === String(body?.itemId ?? ""));
      if (!item) return NextResponse.json({ error: "That pantry item could not be found." }, { status: 404 });
      if (action === "adjust") {
        const delta = Number(body?.delta);
        if (!Number.isFinite(delta)) return NextResponse.json({ error: "Choose a valid quantity change." }, { status: 400 });
        item.quantity = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
      } else if (action === "use") {
        const amount = Number(body?.amount);
        const quantityUnit = cleanText(body?.quantityUnit, 20);
        if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
        let packagesUsed = amount;
        if (quantityUnit === "lb") {
          const poundsPerPackage = item.packageUnit === "lb"
            ? item.packageSize
            : item.packageUnit === "oz" ? item.packageSize / 16 : null;
          if (!poundsPerPackage || poundsPerPackage <= 0) {
            return NextResponse.json({ error: "This food is tracked by packages. Edit its package size and choose lb or oz to subtract by weight." }, { status: 400 });
          }
          packagesUsed = amount / poundsPerPackage;
        } else if (quantityUnit !== "packages") {
          return NextResponse.json({ error: "Choose packages or pounds." }, { status: 400 });
        }
        if (packagesUsed > item.quantity + 0.0001) {
          return NextResponse.json({ error: `There isn’t that much ${item.name} recorded. Please choose a smaller amount.` }, { status: 400 });
        }
        item.quantity = Math.max(0, Math.round((item.quantity - packagesUsed) * 10000) / 10000);
      } else if (action === "edit") {
        const name = cleanText(body?.name);
        if (!name) return NextResponse.json({ error: "Enter a food name." }, { status: 400 });
        item.name = name;
        item.category = cleanText(body?.category, 30) || item.category;
        item.stockUpUnitPrice = numberOrNull(body?.stockUpUnitPrice);
        item.stockUpPrice = null;
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
