import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Fixture = {
  id: string;
  startsAt: string;
  away: string;
  home: string;
  venue: string;
  timeTbd?: boolean;
  awayScore?: number;
  homeScore?: number;
  status?: "scheduled" | "final";
};

const UK_FIXTURES: Fixture[] = [
  { id: "uk-2026-09-04-mckendree", startsAt: "2026-09-04T23:59:00-04:00", away: "McKendree Bearcats", home: "Kentucky Hockey", venue: "Lexington Ice Center", awayScore: 4, homeScore: 6, status: "final" },
  { id: "uk-2026-09-05-mckendree", startsAt: "2026-09-05T23:59:00-04:00", away: "McKendree Bearcats", home: "Kentucky Hockey", venue: "Lexington Ice Center", awayScore: 1, homeScore: 4, status: "final" },
  { id: "uk-2026-09-11-illinois-state", startsAt: "2026-09-11T23:59:00-04:00", away: "Illinois State Redbirds", home: "Kentucky Hockey", venue: "Lexington Ice Center", awayScore: 3, homeScore: 5, status: "final" },
  { id: "uk-2026-09-12-illinois-state", startsAt: "2026-09-12T23:59:00-04:00", away: "Illinois State Redbirds", home: "Kentucky Hockey", venue: "Lexington Ice Center", awayScore: 2, homeScore: 6, status: "final" },
  { id: "uk-2026-10-02-purdue", startsAt: "2026-10-02T19:30:00-04:00", away: "Kentucky Hockey", home: "Purdue Boilermakers", venue: "Kube Sports Complex" },
  { id: "uk-2026-10-03-purdue", startsAt: "2026-10-03T19:30:00-04:00", away: "Kentucky Hockey", home: "Purdue Boilermakers", venue: "Kube Sports Complex" },
  { id: "uk-2026-10-10-cincinnati", startsAt: "2026-10-10T23:59:00-04:00", away: "Cincinnati Bearcats", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2026-10-11-cincinnati", startsAt: "2026-10-11T17:00:00-04:00", away: "Kentucky Hockey", home: "Cincinnati Bearcats", venue: "Queen City Sportsplex" },
  { id: "uk-2026-10-16-central-oklahoma", startsAt: "2026-10-16T23:59:00-04:00", away: "Central Oklahoma Bronchos", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2026-10-17-central-oklahoma", startsAt: "2026-10-17T23:59:00-04:00", away: "Central Oklahoma Bronchos", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2026-11-06-louisville", startsAt: "2026-11-06T23:59:00-05:00", away: "Kentucky Hockey", home: "Louisville Cardinals", venue: "Iceland Sports Complex" },
  { id: "uk-2026-11-07-louisville", startsAt: "2026-11-07T23:59:00-05:00", away: "Louisville Cardinals", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2026-11-12-maryville", startsAt: "2026-11-12T20:45:00-05:00", away: "Kentucky Hockey", home: "Maryville Saints", venue: "Maryville University Hockey Center" },
  { id: "uk-2026-11-13-mckendree", startsAt: "2026-11-13T19:45:00-05:00", away: "Kentucky Hockey", home: "McKendree Bearcats", venue: "McKendree Metro Rec Plex" },
  { id: "uk-2026-11-14-mckendree", startsAt: "2026-11-14T17:00:00-05:00", away: "Kentucky Hockey", home: "McKendree Bearcats", venue: "McKendree Metro Rec Plex" },
  { id: "uk-2026-11-20-oregon", startsAt: "2026-11-20T22:30:00-05:00", away: "Kentucky Hockey", home: "Oregon Ducks", venue: "Canlan Ice Arena" },
  { id: "uk-2026-11-21-indiana-tech", startsAt: "2026-11-21T19:10:00-05:00", away: "Kentucky Hockey", home: "Indiana Tech Warriors", venue: "Canlan Ice Arena" },
  { id: "uk-2026-11-22-roosevelt", startsAt: "2026-11-22T12:00:00-05:00", away: "Kentucky Hockey", home: "Roosevelt Lakers", venue: "Canlan Ice Arena", timeTbd: true },
  { id: "uk-2026-12-04-alabama", startsAt: "2026-12-04T21:50:00-05:00", away: "Kentucky Hockey", home: "Alabama Frozen Tide", venue: "Pelham Civic Complex" },
  { id: "uk-2026-12-05-alabama", startsAt: "2026-12-05T20:00:00-05:00", away: "Kentucky Hockey", home: "Alabama Frozen Tide", venue: "Pelham Civic Complex" },
  { id: "uk-2026-12-11-kent-state", startsAt: "2026-12-11T23:59:00-05:00", away: "Kent State Golden Flashes", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2026-12-12-kent-state", startsAt: "2026-12-12T23:59:00-05:00", away: "Kent State Golden Flashes", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-01-15-duquesne", startsAt: "2027-01-15T23:59:00-05:00", away: "Duquesne Dukes", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-01-16-duquesne", startsAt: "2027-01-16T23:59:00-05:00", away: "Duquesne Dukes", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-01-22-nc-state", startsAt: "2027-01-22T23:59:00-05:00", away: "NC State Icepack", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-01-23-nc-state", startsAt: "2027-01-23T23:59:00-05:00", away: "NC State Icepack", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-01-29-illinois", startsAt: "2027-01-29T23:59:00-05:00", away: "Illinois Fighting Illini", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-01-30-illinois", startsAt: "2027-01-30T23:59:00-05:00", away: "Illinois Fighting Illini", home: "Kentucky Hockey", venue: "Lexington Ice Center" },
  { id: "uk-2027-02-06-louisville", startsAt: "2027-02-06T23:59:00-05:00", away: "Kentucky Hockey", home: "Louisville Cardinals", venue: "Iceland Sports Complex" },
  { id: "uk-2027-02-12-liberty", startsAt: "2027-02-12T23:59:00-05:00", away: "Kentucky Hockey", home: "Liberty Flames", venue: "LaHaye Ice Center" },
  { id: "uk-2027-02-13-liberty", startsAt: "2027-02-13T19:00:00-05:00", away: "Kentucky Hockey", home: "Liberty Flames", venue: "LaHaye Ice Center" },
];

const ROCK_LOBSTERS_RAW = `
5827|2026-10-16T19:05:00-04:00|Macon Mayhem|Athens Rock Lobsters|Akins Ford Arena
5838|2026-10-23T19:05:00-04:00|Macon Mayhem|Athens Rock Lobsters|Akins Ford Arena
5843|2026-10-24T19:05:00-04:00|Athens Rock Lobsters|Roanoke Rail Yard Dawgs|Berglund Center
5850|2026-10-30T19:00:00-05:00|Athens Rock Lobsters|Birmingham Bulls|Pelham Civic Complex
5860|2026-11-06T19:05:00-05:00|Fayetteville Marksmen|Athens Rock Lobsters|Akins Ford Arena
5868|2026-11-07T19:05:00-05:00|Birmingham Bulls|Athens Rock Lobsters|Akins Ford Arena
5875|2026-11-13T19:05:00-05:00|Athens Rock Lobsters|Roanoke Rail Yard Dawgs|Berglund Center
5881|2026-11-14T19:05:00-05:00|Athens Rock Lobsters|Roanoke Rail Yard Dawgs|Berglund Center
5886|2026-11-15T15:00:00-05:00|Athens Rock Lobsters|Fayetteville Marksmen|Crown Coliseum
5889|2026-11-20T19:05:00-05:00|Pensacola Ice Flyers|Athens Rock Lobsters|Akins Ford Arena
5894|2026-11-21T19:05:00-05:00|Pensacola Ice Flyers|Athens Rock Lobsters|Akins Ford Arena
5899|2026-11-22T15:00:00-05:00|Athens Rock Lobsters|Macon Mayhem|Macon Coliseum
5903|2026-11-25T19:05:00-05:00|Birmingham Bulls|Athens Rock Lobsters|Akins Ford Arena
5908|2026-11-26T19:00:00-06:00|Athens Rock Lobsters|Huntsville Havoc|Von Braun Center
5909|2026-11-27T18:00:00-05:00|Athens Rock Lobsters|Knoxville Ice Bears|Knoxville Civic Coliseum
5922|2026-12-04T19:15:00-05:00|Athens Rock Lobsters|Pee Dee IceCats|Florence Center
5928|2026-12-05T19:05:00-05:00|Quad City Storm|Athens Rock Lobsters|Akins Ford Arena
5932|2026-12-06T16:05:00-05:00|Quad City Storm|Athens Rock Lobsters|Akins Ford Arena
5933|2026-12-11T19:05:00-05:00|Macon Mayhem|Athens Rock Lobsters|Akins Ford Arena
5938|2026-12-12T19:05:00-05:00|Macon Mayhem|Athens Rock Lobsters|Akins Ford Arena
5953|2026-12-18T19:10:00-06:00|Athens Rock Lobsters|Quad City Storm|Vibrant Arena
5958|2026-12-19T19:10:00-06:00|Athens Rock Lobsters|Quad City Storm|Vibrant Arena
5964|2026-12-23T19:05:00-06:00|Athens Rock Lobsters|Pensacola Ice Flyers|Pensacola Bay Center
5970|2026-12-26T19:05:00-06:00|Athens Rock Lobsters|Pensacola Ice Flyers|Pensacola Bay Center
5975|2026-12-27T16:05:00-06:00|Athens Rock Lobsters|Pensacola Ice Flyers|Pensacola Bay Center
5978|2026-12-31T19:05:00-05:00|Fayetteville Marksmen|Athens Rock Lobsters|Akins Ford Arena
5988|2027-01-02T19:05:00-05:00|Roanoke Rail Yard Dawgs|Athens Rock Lobsters|Akins Ford Arena
5993|2027-01-08T19:00:00-05:00|Athens Rock Lobsters|Fayetteville Marksmen|Crown Coliseum
5998|2027-01-09T18:00:00-05:00|Athens Rock Lobsters|Fayetteville Marksmen|Crown Coliseum
6005|2027-01-10T16:05:00-05:00|Evansville Thunderbolts|Athens Rock Lobsters|Akins Ford Arena
6010|2027-01-15T19:00:00-06:00|Athens Rock Lobsters|Huntsville Havoc|Von Braun Center
6016|2027-01-16T19:00:00-06:00|Athens Rock Lobsters|Huntsville Havoc|Von Braun Center
6023|2027-01-22T19:05:00-05:00|Pee Dee IceCats|Athens Rock Lobsters|Akins Ford Arena
6029|2027-01-23T19:30:00-05:00|Athens Rock Lobsters|Knoxville Ice Bears|Knoxville Civic Coliseum
6035|2027-01-24T16:05:00-05:00|Knoxville Ice Bears|Athens Rock Lobsters|Akins Ford Arena
6039|2027-01-29T19:05:00-05:00|Roanoke Rail Yard Dawgs|Athens Rock Lobsters|Akins Ford Arena
6045|2027-01-30T19:05:00-05:00|Roanoke Rail Yard Dawgs|Athens Rock Lobsters|Akins Ford Arena
6054|2027-02-05T19:05:00-05:00|Peoria Rivermen|Athens Rock Lobsters|Akins Ford Arena
6060|2027-02-06T19:05:00-05:00|Peoria Rivermen|Athens Rock Lobsters|Akins Ford Arena
6066|2027-02-07T16:05:00-05:00|Peoria Rivermen|Athens Rock Lobsters|Akins Ford Arena
6068|2027-02-12T19:15:00-05:00|Athens Rock Lobsters|Pee Dee IceCats|Florence Center
6074|2027-02-13T19:15:00-05:00|Athens Rock Lobsters|Pee Dee IceCats|Florence Center
6082|2027-02-17T10:35:00-05:00|Macon Mayhem|Athens Rock Lobsters|Akins Ford Arena
6086|2027-02-19T19:05:00-05:00|Birmingham Bulls|Athens Rock Lobsters|Akins Ford Arena
6092|2027-02-20T19:05:00-05:00|Birmingham Bulls|Athens Rock Lobsters|Akins Ford Arena
6098|2027-02-24T10:30:00-05:00|Athens Rock Lobsters|Macon Mayhem|Macon Coliseum
6103|2027-02-26T19:05:00-06:00|Athens Rock Lobsters|Pensacola Ice Flyers|Pensacola Bay Center
6108|2027-02-27T19:05:00-06:00|Athens Rock Lobsters|Pensacola Ice Flyers|Pensacola Bay Center
6115|2027-03-04T10:30:00-05:00|Athens Rock Lobsters|Macon Mayhem|Macon Coliseum
6120|2027-03-05T19:00:00-06:00|Athens Rock Lobsters|Huntsville Havoc|Von Braun Center
6126|2027-03-06T19:00:00-06:00|Athens Rock Lobsters|Huntsville Havoc|Von Braun Center
6134|2027-03-12T19:05:00-05:00|Knoxville Ice Bears|Athens Rock Lobsters|Akins Ford Arena
6140|2027-03-13T19:05:00-05:00|Knoxville Ice Bears|Athens Rock Lobsters|Akins Ford Arena
6145|2027-03-14T16:05:00-04:00|Quad City Storm|Athens Rock Lobsters|Akins Ford Arena
6149|2027-03-19T19:15:00-04:00|Athens Rock Lobsters|Pee Dee IceCats|Florence Center
6154|2027-03-20T19:05:00-04:00|Pee Dee IceCats|Athens Rock Lobsters|Akins Ford Arena
6164|2027-03-26T19:05:00-04:00|Huntsville Havoc|Athens Rock Lobsters|Akins Ford Arena
6170|2027-03-27T19:05:00-04:00|Huntsville Havoc|Athens Rock Lobsters|Akins Ford Arena
6176|2027-04-02T19:00:00-04:00|Athens Rock Lobsters|Macon Mayhem|Macon Coliseum
6181|2027-04-03T18:00:00-04:00|Athens Rock Lobsters|Macon Mayhem|Macon Coliseum
`;

const ROCK_LOBSTERS_FIXTURES: Fixture[] = ROCK_LOBSTERS_RAW.trim()
  .split("\n")
  .map((line) => {
    const [id, startsAt, away, home, venue] = line.split("|");
    return { id: `sphl-${id}`, startsAt, away, home, venue };
  });

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Required Supabase environment variables are missing." }, { status: 500 });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: hockey, error: sportError } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "Hockey")
      .single();
    if (sportError || !hockey) throw sportError ?? new Error("Hockey sport was not found.");
    const hockeySportId = hockey.id;

    async function ensureCompetition(name: string) {
      const existing = await supabase.from("competitions").select("id").eq("name", name).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return existing.data.id;
      const created = await supabase.from("competitions").insert({ sport_id: hockeySportId, name }).select("id").single();
      if (created.error || !created.data) throw created.error ?? new Error(`Could not create ${name}.`);
      return created.data.id;
    }

    const achaCompetitionId = await ensureCompetition("ACHA Men’s Division I");
    const sphlCompetitionId = await ensureCompetition("SPHL");
    const teamCache = new Map<string, string>();

    async function ensureTeam(name: string, provider: "ukhockey" | "sphl") {
      const externalId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const cacheKey = `${provider}:${externalId}`;
      const cached = teamCache.get(cacheKey);
      if (cached) return cached;
      const featuredLogo = name === "Kentucky Hockey"
        ? "/uniforms/kentucky-hockey.png"
        : name === "Athens Rock Lobsters"
          ? "/uniforms/athens-rock-lobsters.png"
          : null;
      const result = await supabase.from("teams").upsert({
        sport_id: hockeySportId,
        name,
        short_name: name === "Kentucky Hockey" ? "UK Hockey" : name === "Athens Rock Lobsters" ? "Rock Lobsters" : name,
        abbreviation: name === "Kentucky Hockey" ? "UK" : name === "Athens Rock Lobsters" ? "ATH" : null,
        logo_url: featuredLogo,
        external_provider: provider,
        external_id: externalId,
      }, { onConflict: "external_provider,external_id" }).select("id").single();
      if (result.error || !result.data) throw result.error ?? new Error(`Could not import ${name}.`);
      teamCache.set(cacheKey, result.data.id);
      return result.data.id;
    }

    async function importFixtures(fixtures: Fixture[], provider: "ukhockey" | "sphl", competitionId: string) {
      let imported = 0;
      for (const fixture of fixtures) {
        const [awayTeamId, homeTeamId] = await Promise.all([
          ensureTeam(fixture.away, provider),
          ensureTeam(fixture.home, provider),
        ]);
        const source = provider === "sphl"
          ? `SPHL 2026–27 · ${fixture.venue}`
          : `ACHA Division I 2026–27 · ${fixture.venue}`;
        const result = await supabase.from("games").upsert({
          sport_id: hockeySportId,
          competition_id: competitionId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          starts_at: new Date(fixture.startsAt).toISOString(),
          start_time_tbd: fixture.timeTbd === true,
          source_notes: source,
          home_score: fixture.homeScore ?? null,
          away_score: fixture.awayScore ?? null,
          status: fixture.status ?? "scheduled",
          season: "2026",
          external_provider: provider,
          external_id: fixture.id,
        }, { onConflict: "external_provider,external_id" });
        if (result.error) throw result.error;
        imported += 1;
      }
      return imported;
    }

    const ukGames = await importFixtures(UK_FIXTURES, "ukhockey", achaCompetitionId);
    const rockLobstersGames = await importFixtures(ROCK_LOBSTERS_FIXTURES, "sphl", sphlCompetitionId);

    return NextResponse.json({
      success: true,
      teams: ["Kentucky Hockey", "Athens Rock Lobsters"],
      competitions: ["ACHA Men’s Division I", "SPHL"],
      gamesImported: ukGames + rockLobstersGames,
      ukGames,
      rockLobstersGames,
    });
  } catch (error) {
    console.error("Local hockey import error:", error);
    return NextResponse.json({
      error: "Could not import the UK Hockey and Athens Rock Lobsters schedules.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
