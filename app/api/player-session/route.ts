import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Supabase server environment variables are missing.",
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}


function verifyGiftSession(playerId: string, token: string) {
  if (!playerId || !token) return Promise.resolve(false);
  return getAdminClient()
    .rpc("verify_player_session", {
      target_player_id: playerId,
      attempted_token: token,
    })
    .then(({ data, error }) => !error && data === true);
}

function giftOccasionName(occasion: string, value: unknown) {
  const name = String(value ?? "").trim();
  return occasion === "other" ? name || "Other" : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("mode") !== "gifts") {
      return NextResponse.json({ error: "Unsupported request." }, { status: 400 });
    }

    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    if (!(await verifyGiftSession(playerId, token))) {
      return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    }

    const db = getAdminClient();
    const [{ data: gifts, error: giftsError }, { data: players, error: playersError },
      { data: recipientBudgets, error: recipientBudgetError },
      { data: occasionBudgets, error: occasionBudgetError }] = await Promise.all([
      db.from("gift_items")
        .select("*, recipient:players!gift_items_recipient_player_id_fkey(id, display_name, initials)")
        .eq("shopper_player_id", playerId)
        .order("occasion_year", { ascending: false }).order("created_at", { ascending: false }),
      db.from("players").select("id, display_name, initials, sort_order").order("sort_order"),
      db.from("gift_budgets")
        .select("*, recipient:players!gift_budgets_recipient_player_id_fkey(id, display_name, initials)")
        .eq("shopper_player_id", playerId).order("occasion_year", { ascending: false }),
      db.from("gift_occasion_budgets").select("*")
        .eq("shopper_player_id", playerId).order("occasion_year", { ascending: false }),
    ]);

    if (giftsError) throw giftsError;
    if (playersError) throw playersError;
    if (recipientBudgetError) throw recipientBudgetError;
    if (occasionBudgetError) throw occasionBudgetError;

    return NextResponse.json({
      gifts: gifts ?? [],
      players: players ?? [],
      recipientBudgets: recipientBudgets ?? [],
      occasionBudgets: occasionBudgets ?? [],
      budgetSetupReady: true,
    });
  } catch (error) {
    console.error("Gifts GET through player-session failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load gifts." },
      { status: 500 },
    );
  }
}

function hashToken(token: string) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function POST(
  request: Request,
) {
  try {
    const body = await request.json();

    if (body?.mode === "gifts") {
      const shopperPlayerId = String(body.shopperPlayerId ?? "");
      const token = request.headers.get("x-fambam-session") ?? "";
      if (!(await verifyGiftSession(shopperPlayerId, token))) {
        return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
      }
      const db = getAdminClient();
      const action = String(body.action ?? "saveGift");
      const occasion = String(body.occasion ?? "christmas");
      const occasionName = giftOccasionName(occasion, body.occasionName);
      const occasionYear = Number(body.occasionYear ?? 2026);

      if (action === "saveOccasionBudget") {
        const budget = Number(body.budget ?? 0);
        const stockingBudget = Number(body.stockingBudget ?? 0);
        let query = db.from("gift_occasion_budgets").select("id")
          .eq("shopper_player_id", shopperPlayerId).eq("occasion", occasion).eq("occasion_year", occasionYear);
        query = occasionName ? query.eq("occasion_name", occasionName) : query.is("occasion_name", null);
        const { data: existing, error: findError } = await query.maybeSingle();
        if (findError) throw findError;
        const row = { shopper_player_id: shopperPlayerId, occasion, occasion_name: occasionName,
          occasion_year: occasionYear, budget, stocking_budget: stockingBudget, updated_at: new Date().toISOString() };
        const result = existing?.id
          ? await db.from("gift_occasion_budgets").update(row).eq("id", existing.id).select("*").single()
          : await db.from("gift_occasion_budgets").insert(row).select("*").single();
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true, budget: result.data });
      }

      if (action === "saveRecipientBudget") {
        const recipientPlayerId = String(body.recipientPlayerId ?? "").trim();
        const recipientName = String(body.recipientName ?? "").trim();
        let query = db.from("gift_budgets").select("id")
          .eq("shopper_player_id", shopperPlayerId).eq("occasion", occasion).eq("occasion_year", occasionYear);
        query = occasionName ? query.eq("occasion_name", occasionName) : query.is("occasion_name", null);
        query = recipientPlayerId ? query.eq("recipient_player_id", recipientPlayerId)
          : query.is("recipient_player_id", null).eq("recipient_name", recipientName);
        const { data: existing, error: findError } = await query.maybeSingle();
        if (findError) throw findError;
        const row = { shopper_player_id: shopperPlayerId, recipient_player_id: recipientPlayerId || null,
          recipient_name: recipientPlayerId ? null : recipientName, occasion, occasion_name: occasionName,
          occasion_year: occasionYear, budget: Number(body.budget ?? 0), stocking_budget: Number(body.stockingBudget ?? 0),
          updated_at: new Date().toISOString() };
        const result = existing?.id ? await db.from("gift_budgets").update(row).eq("id", existing.id).select("*").single()
          : await db.from("gift_budgets").insert(row).select("*").single();
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true, budget: result.data });
      }

      const recipientPlayerId = String(body.recipientPlayerId ?? "").trim();
      const recipientName = String(body.recipientName ?? "").trim();
      const title = String(body.title ?? "").trim();
      if ((!recipientPlayerId && !recipientName) || !title) {
        return NextResponse.json({ error: "Recipient and gift name are required." }, { status: 400 });
      }
      const { data, error } = await db.from("gift_items").insert({
        shopper_player_id: shopperPlayerId, recipient_player_id: recipientPlayerId || null,
        recipient_name: recipientPlayerId ? null : recipientName, title, occasion, occasion_name: occasionName,
        occasion_year: occasionYear, status: String(body.status ?? "idea"), source: "shopper",
        price: body.price === "" || body.price == null ? null : Number(body.price),
        store: String(body.store ?? "").trim() || null, notes: String(body.notes ?? "").trim() || null,
        hiding_spot: String(body.hidingSpot ?? "").trim() || null, is_stocking: Boolean(body.isStocking),
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, gift: data });
    }

    const playerId =
      typeof body.playerId === "string"
        ? body.playerId
        : "";

    const pin =
      typeof body.pin === "string"
        ? body.pin
        : "";

    if (
      !playerId ||
      !/^\d{4}$/.test(pin)
    ) {
      return NextResponse.json(
        {
          error:
            "Player and 4-digit PIN are required.",
        },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const {
      data: pinValid,
      error: pinError,
    } = await supabase.rpc(
      "verify_player_pin",
      {
        target_player_id: playerId,
        attempted_pin: pin,
      },
    );

    // TEMPORARY DEBUGGING:
    // Return the Supabase error details so we can see
    // exactly why the RPC call is failing locally.
    if (pinError) {
      return NextResponse.json(
        {
          error:
            pinError.message ||
            "Supabase PIN verification failed.",
          code:
            pinError.code ?? null,
          details:
            pinError.details ?? null,
          hint:
            pinError.hint ?? null,
        },
        { status: 500 },
      );
    }

    if (!pinValid) {
      return NextResponse.json(
        {
          error:
            "That PIN wasn't right. Try again.",
        },
        { status: 401 },
      );
    }

    const sessionToken =
      randomBytes(32).toString("hex");

    const tokenHash =
      hashToken(sessionToken);

    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 90,
    );

    const { error: sessionError } =
      await supabase
        .from("player_device_sessions")
        .insert({
          player_id: playerId,
          token_hash: tokenHash,
          expires_at:
            expiresAt.toISOString(),
        });

    if (sessionError) {
      return NextResponse.json(
        {
          error:
            sessionError.message ||
            "Could not remember this device.",
          code:
            sessionError.code ?? null,
          details:
            sessionError.details ?? null,
          hint:
            sessionError.hint ?? null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      playerId,
      sessionToken,
      expiresAt:
        expiresAt.toISOString(),
    });
  } catch (error) {
    console.error(
      "Player session error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create player session.",
      },
      { status: 500 },
    );
  }
}