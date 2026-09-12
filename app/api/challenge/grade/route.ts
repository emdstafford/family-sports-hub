import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabasePublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      return NextResponse.json(
        {
          error:
            "Missing Supabase configuration.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();

    const challengeId =
      typeof body?.challengeId === "string"
        ? body.challengeId.trim()
        : "";

    if (!challengeId) {
      return NextResponse.json(
        {
          error: "challengeId is required.",
        },
        { status: 400 },
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabasePublishableKey,
    );

    const {
      data,
      error,
    } = await supabase.rpc(
      "grade_challenge_picks",
      {
        target_challenge_id: challengeId,
      },
    );

    if (error) {
      return NextResponse.json(
        {
          error:
            "Could not grade Challenge picks.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    const result =
      Array.isArray(data) && data.length > 0
        ? data[0]
        : {
            picks_graded: 0,
            correct: 0,
            incorrect: 0,
          };

    return NextResponse.json({
      success: true,
      challengeId,
      ...result,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Could not grade Challenge picks.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error.",
      },
      { status: 500 },
    );
  }
}
