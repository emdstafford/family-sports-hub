import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CfbdRank = {
  rank: number;
  school: string;
  conference?: string | null;
  firstPlaceVotes?: number | null;
  points?: number | null;
};

type CfbdPoll = {
  poll: string;
  ranks: CfbdRank[];
};

type CfbdRankingWeek = {
  season: number;
  seasonType: string;
  week: number;
  polls: CfbdPoll[];
};

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    const cfbdApiKey = process.env.CFBD_API_KEY;

    if (!supabaseUrl || !supabaseSecretKey || !cfbdApiKey) {
      return NextResponse.json(
        { error: "Required server environment variables are missing." },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
    const requestedWeek = url.searchParams.get("week");
    const week = requestedWeek ? Number(requestedWeek) : undefined;

    if (!Number.isInteger(year) || (week !== undefined && !Number.isInteger(week))) {
      return NextResponse.json(
        { error: "year and week must be integers." },
        { status: 400 },
      );
    }

    const cfbdUrl = new URL("https://api.collegefootballdata.com/rankings");
    cfbdUrl.searchParams.set("year", String(year));
    cfbdUrl.searchParams.set("seasonType", "regular");

    if (week !== undefined) {
      cfbdUrl.searchParams.set("week", String(week));
    }

    const response = await fetch(cfbdUrl, {
      headers: {
        Authorization: `Bearer ${cfbdApiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "CollegeFootballData rankings request failed.",
          status: response.status,
          details: await response.text(),
        },
        { status: response.status },
      );
    }

    const rankingWeeks = (await response.json()) as CfbdRankingWeek[];

    /*
     * CFBD can occasionally have no poll object for an exact requested week.
     * If that happens, retry the season without the week filter and use the
     * latest available poll at or before the requested week. This prevents
     * FamBam's "Games to Watch" logic from going blind just because the poll
     * endpoint lags the schedule.
     */
    let availableRankingWeeks = rankingWeeks;

    if (!availableRankingWeeks.length && week !== undefined) {
      const fallbackUrl = new URL(
        "https://api.collegefootballdata.com/rankings",
      );
      fallbackUrl.searchParams.set("year", String(year));
      fallbackUrl.searchParams.set("seasonType", "regular");

      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          Authorization: `Bearer ${cfbdApiKey}`,
        },
        cache: "no-store",
      });

      if (!fallbackResponse.ok) {
        return NextResponse.json(
          {
            error: "CollegeFootballData rankings fallback request failed.",
            status: fallbackResponse.status,
            details: await fallbackResponse.text(),
          },
          { status: fallbackResponse.status },
        );
      }

      availableRankingWeeks =
        (await fallbackResponse.json()) as CfbdRankingWeek[];
    }

    if (!availableRankingWeeks.length) {
      return NextResponse.json({
        success: true,
        year,
        requestedWeek: week ?? null,
        imported: 0,
        message: "CFBD has no poll rankings available for this season yet.",
      });
    }

    const sortedWeeks = [...availableRankingWeeks].sort(
      (a, b) => b.week - a.week,
    );

    const target =
      week !== undefined
        ? sortedWeeks.find((item) => item.week <= week) ?? sortedWeeks[0]
        : sortedWeeks[0];

    const apPoll =
      target.polls.find((poll) =>
        poll.poll.toLowerCase().includes("ap top 25"),
      ) ??
      target.polls.find((poll) =>
        poll.poll.toLowerCase().includes("associated press"),
      );

    if (!apPoll) {
      return NextResponse.json(
        {
          error: "No AP Top 25 poll was found in the CFBD response.",
          availablePolls: target.polls.map((poll) => poll.poll),
        },
        { status: 404 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Match rankings to existing CFBD-imported team rows by name.
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("external_provider", "cfbd");

    if (teamsError) {
      return NextResponse.json(
        { error: "Could not load CFBD teams.", details: teamsError.message },
        { status: 500 },
      );
    }

    const teamIdByName = new Map(
      (teams ?? []).map((team) => [team.name.trim().toLowerCase(), team.id]),
    );

    const rows = apPoll.ranks.map((rank) => ({
      season: target.season,
      week: target.week,
      season_type: target.seasonType ?? "regular",
      poll: "AP Top 25",
      rank: rank.rank,
      team_name: rank.school,
      team_id: teamIdByName.get(rank.school.trim().toLowerCase()) ?? null,
      first_place_votes: rank.firstPlaceVotes ?? null,
      points: rank.points ?? null,
      external_provider: "cfbd",
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("college_football_rankings")
      .upsert(rows, {
        onConflict: "season,week,season_type,poll,team_name",
      });

    if (upsertError) {
      return NextResponse.json(
        { error: "Could not save rankings.", details: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      source: "cfbd",
      season: target.season,
      week: target.week,
      requestedWeek: week ?? null,
      usedFallbackWeek:
        week !== undefined && target.week !== week,
      poll: "AP Top 25",
      imported: rows.length,
      rankings: rows.map((row) => ({
        rank: row.rank,
        team: row.team_name,
        matchedTeam: Boolean(row.team_id),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected rankings import error.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
