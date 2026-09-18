import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/push";

const BUCKET = "fambam-notifications";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verify(playerId: string, token: string) {
  if (!playerId || !token) return false;
  const { data, error } = await admin().rpc("verify_player_session", {
    target_player_id: playerId,
    attempted_token: token,
  });
  return !error && data === true;
}

async function ensureBucket() {
  const db = admin();
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}

async function readJson(path: string) {
  const { data, error } = await admin().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()); } catch { return null; }
}

export async function GET(request: Request) {
  try {
    const playerId = new URL(request.url).searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    if (!(await verify(playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    await ensureBucket();
    const db = admin();
    const { data: subscriptions } = await db.storage.from(BUCKET).list("subscriptions", { limit: 100, search: `${playerId}-` });
    const preferences = await readJson(`preferences/${playerId}.json`) ?? {
      pickReminders: true,
      bigGameAlerts: true,
      trophyAlerts: true,
    };
    return NextResponse.json({
      publicKey: getVapidKeys().publicKey,
      subscribed: (subscriptions ?? []).length > 0,
      preferences,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load notifications." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const playerId = String(body.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    if (!(await verify(playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    await ensureBucket();
    const db = admin();
    const bucket = db.storage.from(BUCKET);

    if (body.action === "subscribe") {
      const subscription = body.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return NextResponse.json({ error: "The phone did not return a valid notification subscription." }, { status: 400 });
      }
      const hash = createHash("sha256").update(subscription.endpoint).digest("hex").slice(0, 24);
      const record = JSON.stringify({ playerId, subscription, updatedAt: new Date().toISOString() });
      const { error } = await bucket.upload(`subscriptions/${playerId}-${hash}.json`, record, { contentType: "application/json", upsert: true });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "preferences") {
      const preferences = {
        pickReminders: body.preferences?.pickReminders !== false,
        bigGameAlerts: body.preferences?.bigGameAlerts !== false,
        trophyAlerts: body.preferences?.trophyAlerts !== false,
      };
      const { error } = await bucket.upload(`preferences/${playerId}.json`, JSON.stringify(preferences), { contentType: "application/json", upsert: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, preferences });
    }

    if (body.action === "unsubscribe") {
      const endpoint = String(body.endpoint ?? "");
      const hash = endpoint ? createHash("sha256").update(endpoint).digest("hex").slice(0, 24) : "";
      const { data } = await bucket.list("subscriptions", { limit: 100, search: `${playerId}-` });
      const paths = (data ?? [])
        .filter((file) => !hash || file.name === `${playerId}-${hash}.json`)
        .map((file) => `subscriptions/${file.name}`);
      if (paths.length) await bucket.remove(paths);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown notification action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update notifications." }, { status: 500 });
  }
}
