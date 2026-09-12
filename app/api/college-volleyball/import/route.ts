import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type UkEvent = {
  "@type"?: string;
  startDate?: string;
  endDate?: string;
  name?: string;
  location?: {
    name?: string;
  };
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function easternWallTimeToIso(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  );

  if (!match) {
    return new Date(value).toISOString();
  }

  const [, y, m, d, hh, mm] = match;

  const guess = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
  );

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(guess))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const shownAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );

  const offset = shownAsUtc - guess;

  return new Date(guess - offset).toISOString();
}

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      return NextResponse.json(
        { error: "Required Supabase environment variables are missing." },
        { status: 500 },
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: competition, error: competitionError } =
      await supabase
        .from("competitions")
        .select("id, sport_id, name")
        .eq("name", "NCAA Volleyball")
        .single();

    if (competitionError || !competition) {
      return NextResponse.json(
        {
          error: 'Could not find the "NCAA Volleyball" competition.',
          details: competitionError?.message ?? null,
        },
        { status: 500 },
      );
    }

    const scheduleUrl =
      "https://ukathletics.com/sports/wvball/schedule/season/2026/";

    const response = await fetch(scheduleUrl, {
      cache: "no-store",
      headers: {
        "User-Agent": "FamBam Sports Schedule Importer",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Kentucky Athletics schedule request failed.",
          status: response.status,
        },
        { status: response.status },
      );
    }

    const html = await response.text();

    const scriptRegex =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    const events: UkEvent[] = [];

    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);

        const items = Array.isArray(parsed)
          ? parsed
          : [parsed];

        for (const item of items) {
          if (
            item &&
            typeof item === "object" &&
            item["@type"] === "Event"
          ) {
            events.push(item as UkEvent);
          }
        }
      } catch {
        // Ignore unrelated malformed JSON-LD blocks.
      }
    }

    const regularSeasonEvents = events.filter((event) => {
      const name = event.name?.trim() ?? "";

      return (
        event.startDate &&
        name &&
        !name.includes("(EXH)")
      );
    });

    const { data: kentuckyTeam, error: kentuckyError } =
      await supabase
        .from("teams")
        .upsert(
          {
            sport_id: competition.sport_id,
            name: "Kentucky",
            external_provider: "ukathletics",
            external_id: "wvball-kentucky",
          },
          {
            onConflict: "external_provider,external_id",
          },
        )
        .select("id")
        .single();

    if (kentuckyError || !kentuckyTeam) {
      return NextResponse.json(
        {
          error: "Could not create/find Kentucky volleyball team.",
          details: kentuckyError?.message ?? null,
        },
        { status: 500 },
      );
    }

    let gamesImported = 0;
    let gamesSkipped = 0;
    let teamsProcessed = 1;

    const teamCache = new Map<string, string>();

    for (const event of regularSeasonEvents) {
      const rawName = event.name?.trim() ?? "";
      const isAway = rawName.toLowerCase().startsWith("at ");

      const opponentName = rawName
        .replace(/^vs\.\s*/i, "")
        .replace(/^at\s+/i, "")
        .trim();

      if (!opponentName || !event.startDate) {
        gamesSkipped += 1;
        continue;
      }

      let opponentId = teamCache.get(opponentName);

      if (!opponentId) {
        const opponentExternalId =
          `wvball-${slug(opponentName)}`;

        const { data: opponent, error: opponentError } =
          await supabase
            .from("teams")
            .upsert(
              {
                sport_id: competition.sport_id,
                name: opponentName,
                external_provider: "ukathletics",
                external_id: opponentExternalId,
              },
              {
                onConflict: "external_provider,external_id",
              },
            )
            .select("id")
            .single();

        if (opponentError || !opponent) {
          return NextResponse.json(
            {
              error: `Could not import volleyball team ${opponentName}.`,
              details: opponentError?.message ?? null,
            },
            { status: 500 },
          );
        }

        if (!opponent.id) {
          return NextResponse.json(
            {
              error: `Could not determine volleyball team ID for ${opponentName}.`,
            },
            { status: 500 },
          );
        }

        const resolvedOpponentId = opponent.id;

        opponentId = resolvedOpponentId;
        teamCache.set(opponentName, resolvedOpponentId);
        teamsProcessed += 1;
      }

      const startsAt =
        easternWallTimeToIso(event.startDate);

      const datePart =
        event.startDate.slice(0, 10);

      const externalId =
        `kentucky-wvball-2026-${datePart}-${slug(opponentName)}`;

      const { error: gameError } = await supabase
        .from("games")
        .upsert(
          {
            sport_id: competition.sport_id,
            competition_id: competition.id,
            home_team_id: isAway
              ? opponentId
              : kentuckyTeam.id,
            away_team_id: isAway
              ? kentuckyTeam.id
              : opponentId,
            starts_at: startsAt,
            start_time_tbd: false,
            source_notes:
              event.location?.name ?? "Kentucky Volleyball",
            status: "scheduled",
            external_provider: "ukathletics",
            external_id: externalId,
          },
          {
            onConflict: "external_provider,external_id",
          },
        );

      if (gameError) {
        return NextResponse.json(
          {
            error: `Failed importing Kentucky volleyball vs ${opponentName}.`,
            details: gameError.message,
          },
          { status: 500 },
        );
      }

      gamesImported += 1;
    }

    return NextResponse.json({
      success: true,
      source: "Kentucky Athletics",
      competition: competition.name,
      eventsFound: events.length,
      exhibitionGamesSkipped:
        events.length - regularSeasonEvents.length,
      teamsProcessed,
      gamesImported,
      gamesSkipped,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected Kentucky volleyball import error.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}
