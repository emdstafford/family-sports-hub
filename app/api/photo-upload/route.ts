import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "fambam-photos";
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verify(playerId: string, token: string) {
  if (!playerId || !token) return false;

  const { data, error } = await admin().rpc("verify_player_session", {
    target_player_id: playerId,
    attempted_token: token,
  });

  return !error && data === true;
}

async function ensureBucket() {
  const db = admin();
  const { data, error } = await db.storage.getBucket(BUCKET);

  if (data && !error) return;

  const { error: createError } = await db.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: [...IMAGE_TYPES.keys()],
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-fambam-session") ?? "";
    const form = await request.formData();
    const playerId = String(form.get("playerId") ?? "");
    const purpose = String(form.get("purpose") ?? "");
    const eventId = String(form.get("eventId") ?? "");
    const file = form.get("file");

    if (!(await verify(playerId, token))) {
      return NextResponse.json(
        { error: "Your FamBam session has expired." },
        { status: 401 },
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Choose a picture first." }, { status: 400 });
    }

    const extension = IMAGE_TYPES.get(file.type);

    if (!extension) {
      return NextResponse.json(
        { error: "Please choose a JPG, PNG, WEBP, HEIC or HEIF picture." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "This picture is still too large after processing." },
        { status: 400 },
      );
    }

    const db = admin();
    await ensureBucket();

    let path = "";

    if (purpose === "profile") {
      path = `profiles/${playerId}/avatar-${Date.now()}.${extension}`;
    } else if (purpose === "passport" && eventId) {
      const { data: attendee } = await db
        .from("passport_event_attendees")
        .select("event_id")
        .eq("event_id", eventId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (!attendee) {
        return NextResponse.json(
          { error: "Only someone marked as attending can add pictures." },
          { status: 403 },
        );
      }

      path = `passport/${eventId}/${playerId}-${crypto.randomUUID()}.${extension}`;
    } else {
      return NextResponse.json({ error: "Unknown picture destination." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(path);
    const url = publicData.publicUrl;

    if (purpose === "profile") {
      const { data: oldFiles } = await db.storage
        .from(BUCKET)
        .list(`profiles/${playerId}`, { limit: 100 });

      const oldPaths = (oldFiles ?? [])
        .filter((item) => item.name !== path.split("/").pop())
        .map((item) => `profiles/${playerId}/${item.name}`);

      if (oldPaths.length) {
        await db.storage.from(BUCKET).remove(oldPaths);
      }

      const { error: updateError } = await db
        .from("players")
        .update({ avatar_url: url })
        .eq("id", playerId);

      if (updateError) throw updateError;
    }

    return NextResponse.json({ ok: true, url, path });
  } catch (error) {
    console.error("Photo upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload picture." },
      { status: 500 },
    );
  }
}
