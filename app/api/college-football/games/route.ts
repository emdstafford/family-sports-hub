import { NextResponse } from "next/server";

type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeId: number | null;
  homeTeam: string;
  homeConference: string | null;
  homeClassification: string | null;
  homePoints: number | null;
  awayId: number | null;
  awayTeam: string;
  awayConference: string | null;
  awayClassification: string | null;
  awayPoints: number | null;
  notes: string | null;
};

export async function GET(request: Request) {
  try {
    const apiKey = process.env.CFBD_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "CFBD_API_KEY is missing from .env.local" },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);

    const year = searchParams.get("year") ?? "2026";
    const week = searchParams.get("week");
    const team = searchParams.get("team");

    const cfbdUrl = new URL(
      "https://api.collegefootballdata.com/games",
    );

    cfbdUrl.searchParams.set("year", year);
    cfbdUrl.searchParams.set("seasonType", "regular");

    if (week) {
      cfbdUrl.searchParams.set("week", week);
    }

    if (team) {
      cfbdUrl.searchParams.set("team", team);
    }

    const response = await fetch(cfbdUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text();

      console.error("CFBD request failed:", response.status, message);

      return NextResponse.json(
        {
          error: "CollegeFootballData request failed",
          status: response.status,
        },
        { status: response.status },
      );
    }

    const games = (await response.json()) as CfbdGame[];

    const cleanedGames = games.map((game) => ({
      externalId: game.id,
      season: game.season,
      week: game.week,
      seasonType: game.seasonType,

      startsAt: game.startDate,
      startTimeTbd: game.startTimeTBD,

      completed: game.completed,
      neutralSite: game.neutralSite,
      conferenceGame: game.conferenceGame,

      home: {
        externalId: game.homeId,
        name: game.homeTeam,
        conference: game.homeConference,
        classification: game.homeClassification,
        score: game.homePoints,
      },

      away: {
        externalId: game.awayId,
        name: game.awayTeam,
        conference: game.awayConference,
        classification: game.awayClassification,
        score: game.awayPoints,
      },

      notes: game.notes,
    }));

    return NextResponse.json({
      count: cleanedGames.length,
      games: cleanedGames,
    });
  } catch (error) {
    console.error("College football route error:", error);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}