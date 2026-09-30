import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase server environment variables");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { playerId?: string; sessionToken?: string }
      | null;

    const playerId = body?.playerId?.trim() ?? "";
    const sessionToken = body?.sessionToken?.trim() ?? "";

    if (!playerId || !sessionToken) {
      return NextResponse.json(
        { error: "A signed-in FamBam player is required." },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();
    const { data: sessionValid, error: sessionError } = await supabase.rpc(
      "verify_player_session",
      {
        target_player_id: playerId,
        attempted_token: sessionToken,
      },
    );

    if (sessionError || !sessionValid) {
      return NextResponse.json(
        { error: "Your FamBam session has expired." },
        { status: 401 },
      );
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const weekday = todayUtc.getUTCDay();
    const weekStart = new Date(todayUtc);
    weekStart.setUTCDate(
      weekStart.getUTCDate() - (weekday === 0 ? 6 : weekday - 1),
    );
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const { data: challenge, error: challengeError } = await supabase
      .from("challenges")
      .select("id")
      .gte("starts_at", weekStart.toISOString())
      .lte("starts_at", weekEnd.toISOString())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError) throw challengeError;

    if (challenge?.id) {
      const { count, error: picksError } = await supabase
        .from("player_picks")
        .select("game_id", { count: "exact", head: true })
        .eq("challenge_id", challenge.id);

      if (picksError) throw picksError;

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: "This week's Challenge is locked because picks have already been made.",
            locked: true,
          },
          { status: 409 },
        );
      }
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      throw new Error("CRON_SECRET is not configured");
    }

    const buildUrl = new URL("/api/challenge/auto-build?reset=true", request.url);
    const buildResponse = await fetch(buildUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });

    const result = await buildResponse.json().catch(() => null);

    if (!buildResponse.ok) {
      return NextResponse.json(
        {
          error: result?.error ?? "Could not refresh this week's Challenge.",
          details: result?.details,
        },
        { status: buildResponse.status },
      );
    }

    return NextResponse.json({
      success: true,
      message: "This week's Challenge was refreshed.",
      ...result,
    });
  } catch (error) {
    console.error("Challenge refresh error:", error);
    return NextResponse.json(
      {
        error: "Could not refresh this week's Challenge.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
