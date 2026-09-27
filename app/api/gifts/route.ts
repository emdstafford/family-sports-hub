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

function isMissingRelation(error: { code?: string } | null) {
  return error?.code === "42P01";
}

function normalizedOccasionName(occasion: string, value: unknown) {
  const name = String(value ?? "").trim();
  return occasion === "other" ? name || "Other" : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";

    if (!(await verify(playerId, token))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const db = admin();

    const { data: gifts, error: giftsError } = await db
      .from("gift_items")
      .select("*, recipient:players!gift_items_recipient_player_id_fkey(id, display_name, initials)")
      .eq("shopper_player_id", playerId)
      .order("occasion_year", { ascending: false })
      .order("created_at", { ascending: false });
    if (giftsError) throw giftsError;

    const { data: players, error: playersError } = await db
      .from("players")
      .select("id, display_name, initials, sort_order")
      .order("sort_order");
    if (playersError) throw playersError;

    const { data: recipientBudgets, error: recipientBudgetError } = await db
      .from("gift_budgets")
      .select("*, recipient:players!gift_budgets_recipient_player_id_fkey(id, display_name, initials)")
      .eq("shopper_player_id", playerId)
      .order("occasion_year", { ascending: false });

    const { data: occasionBudgets, error: occasionBudgetError } = await db
      .from("gift_occasion_budgets")
      .select("*")
      .eq("shopper_player_id", playerId)
      .order("occasion_year", { ascending: false });

    if (recipientBudgetError && !isMissingRelation(recipientBudgetError)) {
      console.warn("Gift recipient budgets unavailable", recipientBudgetError);
    }
    if (occasionBudgetError && !isMissingRelation(occasionBudgetError)) {
      console.warn("Gift occasion budgets unavailable", occasionBudgetError);
    }

    return NextResponse.json({
      gifts: gifts ?? [],
      players: players ?? [],
      recipientBudgets: recipientBudgetError ? [] : recipientBudgets ?? [],
      occasionBudgets: occasionBudgetError ? [] : occasionBudgets ?? [],
      budgetSetupReady: !recipientBudgetError && !occasionBudgetError,
    });
  } catch (error) {
    console.error("Gifts GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load gifts." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-fambam-session") ?? "";
    const body = await request.json();
    const shopperPlayerId = String(body.shopperPlayerId ?? "");

    if (!(await verify(shopperPlayerId, token))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const db = admin();
    const action = String(body.action ?? "saveGift");

    if (action === "saveOccasionBudget") {
      const occasion = String(body.occasion ?? "christmas");
      const occasionName = normalizedOccasionName(occasion, body.occasionName);
      const occasionYear = Number(body.occasionYear ?? new Date().getFullYear());
      const budget = Number(body.budget ?? 0);
      const stockingBudget = Number(body.stockingBudget ?? 0);

      if (!Number.isFinite(budget) || budget < 0 || !Number.isFinite(stockingBudget) || stockingBudget < 0) {
        return NextResponse.json({ error: "Budget amounts must be zero or more." }, { status: 400 });
      }

      let findQuery = db
        .from("gift_occasion_budgets")
        .select("id")
        .eq("shopper_player_id", shopperPlayerId)
        .eq("occasion", occasion)
        .eq("occasion_year", occasionYear);

      findQuery = occasionName ? findQuery.eq("occasion_name", occasionName) : findQuery.is("occasion_name", null);
      const { data: existing, error: findError } = await findQuery.maybeSingle();
      if (findError) throw findError;

      const row = {
        shopper_player_id: shopperPlayerId,
        occasion,
        occasion_name: occasionName,
        occasion_year: occasionYear,
        budget,
        stocking_budget: stockingBudget,
        updated_at: new Date().toISOString(),
      };

      const result = existing?.id
        ? await db.from("gift_occasion_budgets").update(row).eq("id", existing.id).select("*").single()
        : await db.from("gift_occasion_budgets").insert(row).select("*").single();

      if (result.error) throw result.error;
      return NextResponse.json({ ok: true, budget: result.data });
    }

    if (action === "saveRecipientBudget") {
      const recipientPlayerId = String(body.recipientPlayerId ?? "").trim();
      const recipientName = String(body.recipientName ?? "").trim();
      const occasion = String(body.occasion ?? "christmas");
      const occasionName = normalizedOccasionName(occasion, body.occasionName);
      const occasionYear = Number(body.occasionYear ?? new Date().getFullYear());
      const budget = Number(body.budget ?? 0);
      const stockingBudget = Number(body.stockingBudget ?? 0);

      if (!recipientPlayerId && !recipientName) {
        return NextResponse.json({ error: "Choose a recipient for this budget." }, { status: 400 });
      }
      if (!Number.isFinite(budget) || budget < 0 || !Number.isFinite(stockingBudget) || stockingBudget < 0) {
        return NextResponse.json({ error: "Budget amounts must be zero or more." }, { status: 400 });
      }

      let findQuery = db
        .from("gift_budgets")
        .select("id")
        .eq("shopper_player_id", shopperPlayerId)
        .eq("occasion", occasion)
        .eq("occasion_year", occasionYear);

      findQuery = occasionName ? findQuery.eq("occasion_name", occasionName) : findQuery.is("occasion_name", null);
      findQuery = recipientPlayerId
        ? findQuery.eq("recipient_player_id", recipientPlayerId)
        : findQuery.is("recipient_player_id", null).eq("recipient_name", recipientName);

      const { data: existing, error: findError } = await findQuery.maybeSingle();
      if (findError) throw findError;

      const row = {
        shopper_player_id: shopperPlayerId,
        recipient_player_id: recipientPlayerId || null,
        recipient_name: recipientPlayerId ? null : recipientName,
        occasion,
        occasion_name: occasionName,
        occasion_year: occasionYear,
        budget,
        stocking_budget: stockingBudget,
        updated_at: new Date().toISOString(),
      };

      const result = existing?.id
        ? await db.from("gift_budgets").update(row).eq("id", existing.id).select("*").single()
        : await db.from("gift_budgets").insert(row).select("*").single();

      if (result.error) throw result.error;
      return NextResponse.json({ ok: true, budget: result.data });
    }

    const recipientPlayerId = String(body.recipientPlayerId ?? "").trim();
    const recipientName = String(body.recipientName ?? "").trim();
    const title = String(body.title ?? "").trim();
    const occasion = String(body.occasion ?? "christmas");
    const occasionName = normalizedOccasionName(occasion, body.occasionName);
    const occasionYear = Number(body.occasionYear ?? new Date().getFullYear());
    const status = String(body.status ?? "idea");

    if ((!recipientPlayerId && !recipientName) || !title) {
      return NextResponse.json({ error: "Recipient and gift name are required." }, { status: 400 });
    }

    const row = {
      shopper_player_id: shopperPlayerId,
      recipient_player_id: recipientPlayerId || null,
      recipient_name: recipientPlayerId ? null : recipientName,
      title,
      occasion,
      occasion_name: occasionName,
      occasion_year: occasionYear,
      status,
      source: "shopper",
      price: body.price === "" || body.price == null ? null : Number(body.price),
      store: String(body.store ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
      hiding_spot: String(body.hidingSpot ?? "").trim() || null,
      is_stocking: Boolean(body.isStocking),
    };

    const { data, error } = await db.from("gift_items").insert(row).select("*").single();
    if (error) throw error;

    return NextResponse.json({ ok: true, gift: data });
  } catch (error) {
    console.error("Gifts POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save gift." },
      { status: 500 },
    );
  }
}
