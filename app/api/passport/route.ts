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

const validStates = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const validContinents = new Set([
  "North America",
  "South America",
  "Europe",
  "Africa",
  "Asia",
  "Oceania",
  "Antarctica",
]);
const passportMetaBucket = "fambam-passport-meta";
const photoBucket = "fambam-photos";
const maxPhotoSize = 4 * 1024 * 1024;
const photoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function ensurePassportMetaBucket(db: ReturnType<typeof admin>) {
  const { data } = await db.storage.getBucket(passportMetaBucket);
  if (data) return;
  const { error } = await db.storage.createBucket(passportMetaBucket, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
}

async function readLocationMeta(
  db: ReturnType<typeof admin>,
  eventIds: string[],
) {
  await ensurePassportMetaBucket(db);
  const entries = await Promise.all(eventIds.map(async (eventId) => {
    const { data } = await db.storage.from(passportMetaBucket).download(`${eventId}.json`);
    if (!data) return [eventId, null] as const;
    try {
      return [eventId, JSON.parse(await data.text())] as const;
    } catch {
      return [eventId, null] as const;
    }
  }));
  return Object.fromEntries(entries);
}

async function writeLocationMeta(
  db: ReturnType<typeof admin>,
  eventId: string,
  country: string,
  continent: string,
) {
  await ensurePassportMetaBucket(db);
  const { error } = await db.storage.from(passportMetaBucket).upload(
    `${eventId}.json`,
    JSON.stringify({ eventId, country, continent, updatedAt: new Date().toISOString() }),
    { contentType: "application/json", upsert: true },
  );
  if (error) throw error;
}

function locationFromDraft(d: any) {
  const country = String(d.country ?? "United States").trim() || "United States";
  const continent = String(d.continent ?? (country === "United States" ? "North America" : "")).trim();
  return { country, continent };
}

async function uploadPassportPhoto(request: Request) {
  const token = request.headers.get("x-fambam-session") ?? "";
  const form = await request.formData();
  const playerId = String(form.get("playerId") ?? "");
  const eventId = String(form.get("eventId") ?? "");
  const file = form.get("file");

  if (!(await verify(playerId, token))) {
    return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
  }
  if (!eventId || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a picture first." }, { status: 400 });
  }

  const extension = photoTypes.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "Please choose a JPG, PNG or WEBP picture." }, { status: 400 });
  }
  if (file.size > maxPhotoSize) {
    return NextResponse.json({ error: "This picture is still too large after processing." }, { status: 400 });
  }

  const db = admin();
  const { data: attendee } = await db
    .from("passport_event_attendees")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!attendee) {
    return NextResponse.json({ error: "Only someone marked as attending can add pictures." }, { status: 403 });
  }

  const { data: existingBucket } = await db.storage.getBucket(photoBucket);
  if (!existingBucket) {
    const { error: bucketError } = await db.storage.createBucket(photoBucket, {
      public: true,
      fileSizeLimit: maxPhotoSize,
      allowedMimeTypes: [...photoTypes.keys()],
    });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) throw bucketError;
  }

  const path = `passport/${eventId}/${playerId}-${crypto.randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await db.storage
    .from(photoBucket)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const url = db.storage.from(photoBucket).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ ok: true, url, path });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = request.headers.get("x-fambam-session") ?? "";
    if (!(await verify(playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });

    const db = admin();
    const { data: attendeeRows, error: attendeeError } = await db
      .from("passport_event_attendees")
      .select("event_id")
      .eq("player_id", playerId);
    if (attendeeError) throw attendeeError;
    const eventIds = (attendeeRows ?? []).map((r: any) => r.event_id);

    let events: any[] = [];
    if (eventIds.length) {
      const { data, error } = await db
        .from("passport_events")
        .select("*")
        .in("id", eventIds)
        .order("event_date", { ascending: false });
      if (error) throw error;
      events = data ?? [];
    }

    let attendees: any[] = [];
    let memories: any[] = [];
    const photos: Record<string, string[]> = {};
    if (eventIds.length) {
      const [a, m] = await Promise.all([
        db.from("passport_event_attendees").select("event_id, player_id, players(id, display_name, initials)").in("event_id", eventIds),
        db.from("passport_memories").select("event_id, player_id, note, updated_at, players(id, display_name, initials)").in("event_id", eventIds),
      ]);
      if (a.error) throw a.error;
      if (m.error) throw m.error;
      attendees = a.data ?? [];
      memories = m.data ?? [];

      const bucket = db.storage.from("fambam-photos");
      await Promise.all(eventIds.map(async (eventId: string) => {
        const { data } = await bucket.list(`passport/${eventId}`, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });

        photos[eventId] = (data ?? []).map((item) =>
          bucket.getPublicUrl(`passport/${eventId}/${item.name}`).data.publicUrl,
        );
      }));
    }

    const [
      { data: states, error: statesError },
      { data: familyPlayers, error: familyPlayersError },
      { data: allVisitedStates, error: allVisitedStatesError },
      { data: allEventAttendees, error: allEventAttendeesError },
      { data: allPassportEvents, error: allPassportEventsError },
    ] = await Promise.all([
      db.from("visited_states").select("state_code").eq("player_id", playerId),
      db.from("players").select("id, display_name, initials, sort_order").order("sort_order"),
      db.from("visited_states").select("player_id, state_code"),
      db.from("passport_event_attendees").select("event_id, player_id"),
      db.from("passport_events").select("id, state_code, away_team"),
    ]);
    if (statesError || familyPlayersError || allVisitedStatesError || allEventAttendeesError || allPassportEventsError) {
      throw statesError ?? familyPlayersError ?? allVisitedStatesError ?? allEventAttendeesError ?? allPassportEventsError;
    }

    const statesByPlayer = new Map<string, Set<string>>();
    for (const row of allVisitedStates ?? []) {
      const statesForPlayer = statesByPlayer.get(row.player_id) ?? new Set<string>();
      if (row.state_code) statesForPlayer.add(row.state_code);
      statesByPlayer.set(row.player_id, statesForPlayer);
    }

    const sportsStateByEvent = new Map(
      (allPassportEvents ?? [])
        .filter((event) => event.state_code && !String(event.away_team ?? "").startsWith("__FAMILY_EVENT__"))
        .map((event) => [event.id, event.state_code]),
    );
    for (const attendee of allEventAttendees ?? []) {
      const stateCode = sportsStateByEvent.get(attendee.event_id);
      if (!stateCode) continue;
      const statesForPlayer = statesByPlayer.get(attendee.player_id) ?? new Set<string>();
      statesForPlayer.add(stateCode);
      statesByPlayer.set(attendee.player_id, statesForPlayer);
    }

    const familyStateCounts = (familyPlayers ?? []).map((player) => ({
      playerId: player.id,
      displayName: player.display_name,
      initials: player.initials ?? "",
      count: statesByPlayer.get(player.id)?.size ?? 0,
    }));

    const locationMeta = await readLocationMeta(db, eventIds);

    return NextResponse.json({ events, attendees, memories, photos, locationMeta, visitedStates: (states ?? []).map((r: any) => r.state_code), familyStateCounts });
  } catch (e) {
    console.error("Passport GET failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load Passport." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      return await uploadPassportPhoto(request);
    }

    const body = await request.json();
    const playerId = String(body.playerId ?? "");
    const token = request.headers.get("x-fambam-session") ?? "";
    if (!(await verify(playerId, token))) return NextResponse.json({ error: "Your FamBam session has expired." }, { status: 401 });
    const db = admin();

    if (body.action === "createFamilyEvent") {
      const event = body.event ?? {};
      const title = String(event.title ?? "").trim();
      const category = String(event.category ?? "Other").trim() || "Other";
      const milestone = String(event.milestone ?? "").trim();
      const location = String(event.location ?? "").trim() || "Family Event";
      const attendees = Array.from(new Set((body.attendeeIds ?? []).map(String)));
      if (!attendees.includes(playerId)) attendees.push(playerId);

      if (!event.date || !title) {
        return NextResponse.json({ error: "Date and event title are required." }, { status: 400 });
      }

      const marker = `__FAMILY_EVENT__|${category.replaceAll("|", "-")}|${milestone.replaceAll("|", "-")}`;
      const { data: created, error } = await db.from("passport_events").insert({
        game_id: null,
        created_by_player_id: playerId,
        sport: "Football",
        event_date: event.date,
        away_team: marker,
        home_team: title,
        venue_name: location,
        city: null,
        state_code: null,
        away_score: null,
        home_score: null,
        result: null,
      }).select("id").single();
      if (error) throw error;

      const { error: attendeeError } = await db.from("passport_event_attendees")
        .insert(attendees.map((id) => ({ event_id: created.id, player_id: id })));
      if (attendeeError) throw attendeeError;

      const note = String(body.myNote ?? "").trim();
      if (note) {
        const { error: memoryError } = await db.from("passport_memories").insert({
          event_id: created.id,
          player_id: playerId,
          note,
          updated_at: new Date().toISOString(),
        });
        if (memoryError) throw memoryError;
      }

      return NextResponse.json({ ok: true, eventId: created.id });
    }

    if (body.action === "createEvent") {
      const d = body.event ?? {};
      const attendees = Array.from(new Set((body.attendeeIds ?? []).map(String)));
      if (!attendees.includes(playerId)) attendees.push(playerId);
      const isTour = d.visitType === "tour" || d.sport === "Tour";
      const isTravel = d.visitType === "travel";
      const { country, continent } = locationFromDraft(d);
      const isUnitedStates = country.toLowerCase() === "united states";
      if (!d.date || !country || !validContinents.has(continent) || (!isTravel && (!d.venue || (isUnitedStates && !validStates.has(String(d.state))) || (!isTour && (!d.away || !d.home))))) {
        return NextResponse.json({ error: isTravel ? "Date, country and continent are required." : isTour ? "Date, stadium, country and continent are required." : "Date, teams, venue, country and continent are required." }, { status: 400 });
      }
      const { data: event, error } = await db.from("passport_events").insert({
        game_id: d.gameId || null,
        created_by_player_id: playerId,
        sport: isTravel || isTour ? "Football" : d.sport === "MLB" ? "MLB" : "Football",
        event_date: d.date,
        away_team: isTravel ? "__TRAVEL_COUNTRY__" : isTour ? "__STADIUM_TOUR__" : d.away,
        home_team: isTravel ? country : isTour ? "" : d.home,
        venue_name: isTravel ? "Country Visit" : d.venue,
        city: isTravel ? null : d.city || null,
        state_code: !isTravel && isUnitedStates ? d.state : null,
        away_score: isTravel || d.awayScore === "" || d.awayScore == null ? null : Number(d.awayScore),
        home_score: isTravel || d.homeScore === "" || d.homeScore == null ? null : Number(d.homeScore),
        result: isTravel ? null : d.result || null,
      }).select("id").single();
      if (error) throw error;
      await writeLocationMeta(db, event.id, country, continent);
      const { error: ae } = await db.from("passport_event_attendees").insert(attendees.map((id) => ({ event_id: event.id, player_id: id })));
      if (ae) throw ae;
      if (String(body.myNote ?? "").trim()) {
        const { error: me } = await db.from("passport_memories").upsert({ event_id: event.id, player_id: playerId, note: String(body.myNote).trim(), updated_at: new Date().toISOString() }, { onConflict: "event_id,player_id" });
        if (me) throw me;
      }
      return NextResponse.json({ ok: true, eventId: event.id });
    }

    if (body.action === "updateEvent") {
      const eventId = String(body.eventId ?? "");
      const d = body.event ?? {};
      const attendees = Array.from(new Set((body.attendeeIds ?? []).map(String)));

      const [{ data: existing }, { data: player }] = await Promise.all([
        db.from("passport_events").select("id, created_by_player_id").eq("id", eventId).maybeSingle(),
        db.from("players").select("is_admin").eq("id", playerId).maybeSingle(),
      ]);

      if (!existing) {
        return NextResponse.json({ error: "Passport entry not found." }, { status: 404 });
      }

      if (existing.created_by_player_id !== playerId && player?.is_admin !== true) {
        return NextResponse.json({ error: "Only the person who created this entry or an admin can edit it." }, { status: 403 });
      }

      if (!attendees.includes(existing.created_by_player_id)) {
        attendees.push(existing.created_by_player_id);
      }

      const isTravel = d.visitType === "travel";
      const isTour = !isTravel && (d.visitType === "tour" || d.sport === "Tour");
      const { country, continent } = locationFromDraft(d);
      const isUnitedStates = country.toLowerCase() === "united states";
      if (!d.date || !country || !validContinents.has(continent) || (!isTravel && (!d.venue || (isUnitedStates && !validStates.has(String(d.state))) || (!isTour && (!d.away || !d.home))))) {
        return NextResponse.json({ error: isTravel ? "Date, country and continent are required." : isTour ? "Date, stadium, country and continent are required." : "Date, teams, venue, country and continent are required." }, { status: 400 });
      }

      const { error: updateError } = await db.from("passport_events").update({
        game_id: isTravel || isTour ? null : d.gameId || null,
        sport: isTravel || isTour ? "Football" : d.sport === "MLB" ? "MLB" : "Football",
        event_date: d.date,
        away_team: isTravel ? "__TRAVEL_COUNTRY__" : isTour ? "__STADIUM_TOUR__" : d.away,
        home_team: isTravel ? country : isTour ? "" : d.home,
        venue_name: isTravel ? "Country Visit" : d.venue,
        city: isTravel ? null : d.city || null,
        state_code: !isTravel && isUnitedStates ? d.state : null,
        away_score: isTravel || isTour || d.awayScore === "" || d.awayScore == null ? null : Number(d.awayScore),
        home_score: isTravel || isTour || d.homeScore === "" || d.homeScore == null ? null : Number(d.homeScore),
        result: isTravel || isTour ? null : d.result || null,
      }).eq("id", eventId);
      if (updateError) throw updateError;
      await writeLocationMeta(db, eventId, country, continent);

      const { error: deleteAttendeesError } = await db
        .from("passport_event_attendees")
        .delete()
        .eq("event_id", eventId);
      if (deleteAttendeesError) throw deleteAttendeesError;

      const { error: insertAttendeesError } = await db
        .from("passport_event_attendees")
        .insert(attendees.map((id) => ({ event_id: eventId, player_id: id })));
      if (insertAttendeesError) throw insertAttendeesError;

      if (typeof body.myNote === "string") {
        const note = body.myNote.trim();
        const { error: memoryError } = await db.from("passport_memories").upsert({
          event_id: eventId,
          player_id: playerId,
          note,
          updated_at: new Date().toISOString(),
        }, { onConflict: "event_id,player_id" });
        if (memoryError) throw memoryError;
      }

      return NextResponse.json({ ok: true, eventId });
    }

    if (body.action === "saveMemory") {
      const eventId = String(body.eventId ?? "");
      const { data: attendee } = await db.from("passport_event_attendees").select("event_id").eq("event_id", eventId).eq("player_id", playerId).maybeSingle();
      if (!attendee) return NextResponse.json({ error: "Only an attendee can add their memory." }, { status: 403 });
      const { error } = await db.from("passport_memories").upsert({ event_id: eventId, player_id: playerId, note: String(body.note ?? "").trim(), updated_at: new Date().toISOString() }, { onConflict: "event_id,player_id" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deletePhoto") {
      const eventId = String(body.eventId ?? "");
      const photoUrl = String(body.photoUrl ?? "");
      const marker = `/storage/v1/object/public/${photoBucket}/`;
      const markerIndex = photoUrl.indexOf(marker);
      const path = markerIndex >= 0
        ? decodeURIComponent(photoUrl.slice(markerIndex + marker.length).split("?")[0])
        : "";

      if (!eventId || !path.startsWith(`passport/${eventId}/`)) {
        return NextResponse.json({ error: "That picture could not be identified." }, { status: 400 });
      }

      const [{ data: attendee }, { data: player }] = await Promise.all([
        db.from("passport_event_attendees").select("event_id").eq("event_id", eventId).eq("player_id", playerId).maybeSingle(),
        db.from("players").select("is_admin").eq("id", playerId).maybeSingle(),
      ]);
      const fileName = path.split("/").pop() ?? "";
      const ownsPhoto = fileName.startsWith(`${playerId}-`);

      if (!attendee || (!ownsPhoto && player?.is_admin !== true)) {
        return NextResponse.json({ error: "You can only delete pictures you added." }, { status: 403 });
      }

      const { error } = await db.storage.from(photoBucket).remove([path]);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "toggleState") {
      const state = String(body.state ?? "");
      if (!validStates.has(state)) return NextResponse.json({ error: "Invalid state." }, { status: 400 });
      if (body.visited) {
        const { error } = await db.from("visited_states").upsert({ player_id: playerId, state_code: state }, { onConflict: "player_id,state_code" });
        if (error) throw error;
      } else {
        const { error } = await db.from("visited_states").delete().eq("player_id", playerId).eq("state_code", state);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown Passport action." }, { status: 400 });
  } catch (e) {
    console.error("Passport POST failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Passport update failed." }, { status: 500 });
  }
}
