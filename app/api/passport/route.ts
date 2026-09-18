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
const photoBucket = "fambam-photos";
const maxPhotoSize = 4 * 1024 * 1024;
const photoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

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

    const { data: states, error: statesError } = await db.from("visited_states").select("state_code").eq("player_id", playerId);
    if (statesError) throw statesError;

    return NextResponse.json({ events, attendees, memories, photos, visitedStates: (states ?? []).map((r: any) => r.state_code) });
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

    if (body.action === "createEvent") {
      const d = body.event ?? {};
      const attendees = Array.from(new Set((body.attendeeIds ?? []).map(String)));
      if (!attendees.includes(playerId)) attendees.push(playerId);
      const isTour = d.visitType === "tour" || d.sport === "Tour";
      if (!d.date || !d.venue || !validStates.has(String(d.state)) || (!isTour && (!d.away || !d.home))) {
        return NextResponse.json({ error: isTour ? "Date, stadium and state are required." : "Date, teams, venue and state are required." }, { status: 400 });
      }
      const { data: event, error } = await db.from("passport_events").insert({
        game_id: d.gameId || null,
        created_by_player_id: playerId,
        sport: isTour ? "Football" : d.sport === "MLB" ? "MLB" : "Football",
        event_date: d.date,
        away_team: isTour ? "__STADIUM_TOUR__" : d.away,
        home_team: isTour ? "" : d.home,
        venue_name: d.venue,
        city: d.city || null,
        state_code: d.state,
        away_score: d.awayScore === "" || d.awayScore == null ? null : Number(d.awayScore),
        home_score: d.homeScore === "" || d.homeScore == null ? null : Number(d.homeScore),
        result: d.result || null,
      }).select("id").single();
      if (error) throw error;
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

      const isTour = d.visitType === "tour" || d.sport === "Tour";
      if (!d.date || !d.venue || !validStates.has(String(d.state)) || (!isTour && (!d.away || !d.home))) {
        return NextResponse.json({ error: isTour ? "Date, stadium and state are required." : "Date, teams, venue and state are required." }, { status: 400 });
      }

      const { error: updateError } = await db.from("passport_events").update({
        game_id: isTour ? null : d.gameId || null,
        sport: isTour ? "Football" : d.sport === "MLB" ? "MLB" : "Football",
        event_date: d.date,
        away_team: isTour ? "__STADIUM_TOUR__" : d.away,
        home_team: isTour ? "" : d.home,
        venue_name: d.venue,
        city: d.city || null,
        state_code: d.state,
        away_score: isTour || d.awayScore === "" || d.awayScore == null ? null : Number(d.awayScore),
        home_score: isTour || d.homeScore === "" || d.homeScore == null ? null : Number(d.homeScore),
        result: isTour ? null : d.result || null,
      }).eq("id", eventId);
      if (updateError) throw updateError;

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
