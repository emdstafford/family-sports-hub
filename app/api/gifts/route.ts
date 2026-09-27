import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    if (!(await verify(playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });

    const db = admin();
    const { data: gifts, error } = await db
      .from("gift_items")
      .select("*, recipient:players!gift_items_recipient_player_id_fkey(id, display_name, initials)")
      .eq("shopper_player_id", playerId)
      .order("occasion_year", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: players, error: playersError } = await db
      .from("players")
      .select("id, display_name, initials, sort_order")
      .order("sort_order");
    if (playersError) throw playersError;

    return NextResponse.json({ gifts: gifts ?? [], players: players ?? [] });
  } catch (error) {
    console.error("Gifts GET failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load gifts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-fambam-session") ?? "";
    const body = await request.json();
    const shopperPlayerId = String(body.shopperPlayerId ?? "");
    if (!(await verify(shopperPlayerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });

    const recipientPlayerId = String(body.recipientPlayerId ?? "");
    const title = String(body.title ?? "").trim();
    const occasion = String(body.occasion ?? "christmas");
    const occasionYear = Number(body.occasionYear ?? new Date().getFullYear());
    const status = String(body.status ?? "idea");
    if (!recipientPlayerId || !title) return NextResponse.json({ error: "Recipient and gift name are required." }, { status: 400 });

    const row = {
      shopper_player_id: shopperPlayerId,
      recipient_player_id: recipientPlayerId,
      title,
      occasion,
      occasion_year: occasionYear,
      status,
      source: "shopper",
      price: body.price === "" || body.price == null ? null : Number(body.price),
      store: String(body.store ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
      hiding_spot: String(body.hidingSpot ?? "").trim() || null,
      is_stocking: Boolean(body.isStocking),
    };

    const db = admin();
    const { data, error } = await db.from("gift_items").insert(row).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, gift: data });
  } catch (error) {
    console.error("Gifts POST failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save gift." }, { status: 500 });
  }
}
