import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { configureWebPush } from "@/lib/push";

export const maxDuration = 60;

const BUCKET = "fambam-notifications";
const RECORD_BOOK_START = "2026-09-07T00:00:00.000Z";

type Preferences = {
  pickReminders: boolean;
  bigGameAlerts: boolean;
  trophyAlerts: boolean;
};

type StoredSubscription = {
  playerId: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function readJson<T>(path: string): Promise<T | null> {
  const { data, error } = await admin().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()) as T; } catch { return null; }
}

async function markerExists(path: string) {
  const { data } = await admin().storage.from(BUCKET).list(path.substring(0, path.lastIndexOf("/")), {
    limit: 1,
    search: path.substring(path.lastIndexOf("/") + 1),
  });
  return Boolean(data?.some((file) => file.name === path.substring(path.lastIndexOf("/") + 1)));
}

async function mark(path: string) {
  await admin().storage.from(BUCKET).upload(path, JSON.stringify({ sentAt: new Date().toISOString() }), {
    contentType: "application/json",
    upsert: true,
  });
}

function isFinal(game: { status: string | null; home_score: number | null; away_score: number | null }) {
  const status = String(game.status ?? "").toLowerCase();
  return ["final", "finished", "complete", "completed", "closed"].some((value) => status.includes(value))
    && game.home_score != null && game.away_score != null;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = admin();
    const bucket = db.storage.from(BUCKET);
    const { data: files, error: listError } = await bucket.list("subscriptions", { limit: 1000 });
    if (listError) throw listError;

    const records = (await Promise.all((files ?? []).map(async (file) => ({
      path: `subscriptions/${file.name}`,
      record: await readJson<StoredSubscription>(`subscriptions/${file.name}`),
    })))).filter((item): item is { path: string; record: StoredSubscription } => Boolean(item.record?.subscription?.endpoint));

    if (!records.length) return NextResponse.json({ ok: true, sent: 0, message: "No subscribed phones yet." });

    const playerIds = [...new Set(records.map((item) => item.record.playerId))];
    const preferenceEntries = await Promise.all(playerIds.map(async (playerId) => [
      playerId,
      await readJson<Preferences>(`preferences/${playerId}.json`) ?? {
        pickReminders: true,
        bigGameAlerts: true,
        trophyAlerts: true,
      },
    ] as const));
    const preferences = new Map(preferenceEntries);
    const webpush = configureWebPush();
    let sent = 0;

    async function notifyPlayer(playerId: string, payload: { title: string; body: string; tag: string; url?: string }) {
      let delivered = false;
      for (const item of records.filter((candidate) => candidate.record.playerId === playerId)) {
        try {
          await webpush.sendNotification(item.record.subscription, JSON.stringify(payload));
          sent += 1;
          delivered = true;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) await bucket.remove([item.path]);
          else console.error("Push notification failed:", error);
        }
      }
      return delivered;
    }

    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const [{ data: players }, { data: challenges }] = await Promise.all([
      db.from("players").select("id, display_name").in("id", playerIds),
      db.from("challenges").select("id, name, starts_at, ends_at, status").gte("starts_at", RECORD_BOOK_START).order("starts_at", { ascending: false }),
    ]);
    const playerName = new Map((players ?? []).map((player) => [player.id, player.display_name]));
    const currentChallenge = (challenges ?? []).find((challenge) => {
      if (challenge.status === "open" || challenge.status === "active") return true;
      const start = challenge.starts_at ? new Date(challenge.starts_at).getTime() : 0;
      const end = challenge.ends_at ? new Date(challenge.ends_at).getTime() : Number.MAX_SAFE_INTEGER;
      return start <= now.getTime() && now.getTime() <= end;
    });

    if (currentChallenge) {
      const [{ data: challengeGames }, { data: picks }] = await Promise.all([
        db.from("challenge_games").select("game_id").eq("challenge_id", currentChallenge.id),
        db.from("player_picks").select("player_id, game_id").eq("challenge_id", currentChallenge.id).in("player_id", playerIds),
      ]);
      const cardSize = challengeGames?.length ?? 0;
      for (const playerId of playerIds) {
        if (!preferences.get(playerId)?.pickReminders || !cardSize) continue;
        const completed = new Set((picks ?? []).filter((pick) => pick.player_id === playerId).map((pick) => pick.game_id)).size;
        const left = Math.max(0, cardSize - completed);
        const marker = `logs/${dateKey}-picks-${playerId}.json`;
        if (left > 0 && !(await markerExists(marker))) {
          const delivered = await notifyPlayer(playerId, {
            title: `🎯 ${left} FamBam pick${left === 1 ? "" : "s"} left`,
            body: `Finish this week's Challenge before the games begin, ${playerName.get(playerId) ?? "FamBam"}!`,
            tag: `picks-${currentChallenge.id}-${dateKey}`,
            url: "/",
          });
          if (delivered) await mark(marker);
        }
      }
    }

    const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
    const [{ data: favoriteRows }, { data: upcomingGames }] = await Promise.all([
      db.from("player_favorite_teams").select("player_id, team_id").in("player_id", playerIds),
      db.from("games").select("id, starts_at, home_team_id, away_team_id, home_team:teams!games_home_team_id_fkey(name), away_team:teams!games_away_team_id_fkey(name)")
        .gte("starts_at", now.toISOString()).lte("starts_at", windowEnd).order("starts_at"),
    ]);
    for (const game of upcomingGames ?? []) {
      const home = Array.isArray(game.home_team) ? game.home_team[0]?.name : (game.home_team as { name?: string } | null)?.name;
      const away = Array.isArray(game.away_team) ? game.away_team[0]?.name : (game.away_team as { name?: string } | null)?.name;
      for (const playerId of playerIds) {
        if (!preferences.get(playerId)?.bigGameAlerts) continue;
        const teamIds = new Set((favoriteRows ?? []).filter((row) => row.player_id === playerId).map((row) => row.team_id));
        if (!teamIds.has(game.home_team_id) && !teamIds.has(game.away_team_id)) continue;
        const marker = `logs/${game.id}-big-${playerId}.json`;
        if (await markerExists(marker)) continue;
        const when = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(game.starts_at));
        const delivered = await notifyPlayer(playerId, {
          title: "🏟️ Big game coming up!",
          body: `${away ?? "Away"} at ${home ?? "Home"} · ${when}`,
          tag: `game-${game.id}`,
          url: "/",
        });
        if (delivered) await mark(marker);
      }
    }

    const completedChallenge = (challenges ?? []).find((challenge) => challenge.id !== currentChallenge?.id);
    if (completedChallenge) {
      const marker = `logs/${completedChallenge.id}-weekly-recap.json`;
      if (!(await markerExists(marker))) {
        const { data: links } = await db.from("challenge_games").select("game_id").eq("challenge_id", completedChallenge.id);
        const gameIds = (links ?? []).map((link) => link.game_id);
        const { data: games } = gameIds.length
          ? await db.from("games").select("id, status, home_score, away_score").in("id", gameIds)
          : { data: [] };
        if (gameIds.length > 0 && (games ?? []).length === gameIds.length && (games ?? []).every(isFinal)) {
          const { data: picks } = await db.from("player_picks").select("player_id, game_id, pick_choice").eq("challenge_id", completedChallenge.id);
          const gameMap = new Map((games ?? []).map((game) => [game.id, game]));
          const scores = new Map<string, number>(playerIds.map((id) => [id, 0]));
          const completed = new Map<string, number>(playerIds.map((id) => [id, 0]));
          const pickCounts = new Map<string, Map<string, number>>();
          for (const pick of picks ?? []) {
            const game = gameMap.get(pick.game_id);
            if (!game) continue;
            completed.set(pick.player_id, (completed.get(pick.player_id) ?? 0) + 1);
            const choices = pickCounts.get(pick.game_id) ?? new Map<string, number>();
            choices.set(pick.pick_choice, (choices.get(pick.pick_choice) ?? 0) + 1);
            pickCounts.set(pick.game_id, choices);
            const winner = Number(game.home_score) > Number(game.away_score) ? "home" : Number(game.away_score) > Number(game.home_score) ? "away" : "draw";
            if (pick.pick_choice === winner) scores.set(pick.player_id, (scores.get(pick.player_id) ?? 0) + 1);
          }
          const high = Math.max(...scores.values());
          const winners = [...scores.entries()].filter(([, score]) => score === high && high > 0).map(([id]) => playerName.get(id)).filter(Boolean) as string[];
          if (winners.length) {
            const names = winners.length === 1 ? winners[0] : `${winners.slice(0, -1).join(", ")} & ${winners.at(-1)}`;
            const highlights: string[] = [`${names} ${winners.length === 1 ? "is" : "are"} Weekly Champ${winners.length === 1 ? "" : "s"}`];
            const perfect = [...scores.entries()]
              .filter(([id, score]) => gameIds.length >= 10 && score === gameIds.length && completed.get(id) === gameIds.length)
              .map(([id]) => playerName.get(id)).filter(Boolean) as string[];
            if (perfect.length) highlights.push(`${perfect.join(" & ")} earned Perfect 10`);
            else {
              const fullCards = [...completed.entries()]
                .filter(([, count]) => count === gameIds.length)
                .map(([id]) => playerName.get(id)).filter(Boolean) as string[];
              if (fullCards.length && fullCards.length < playerIds.length) highlights.push(`${fullCards.join(" & ")} completed every pick`);
            }

            let upsetHero: { playerId: string; ratio: number } | null = null;
            for (const pick of picks ?? []) {
              const game = gameMap.get(pick.game_id);
              if (!game) continue;
              const winner = Number(game.home_score) > Number(game.away_score) ? "home" : Number(game.away_score) > Number(game.home_score) ? "away" : "draw";
              if (pick.pick_choice !== winner) continue;
              const choices = pickCounts.get(pick.game_id);
              const total = [...(choices?.values() ?? [])].reduce((sum, count) => sum + count, 0);
              const ratio = total ? (choices?.get(winner) ?? 0) / total : 1;
              if (total >= 2 && ratio < 0.5 && (!upsetHero || ratio < upsetHero.ratio)) upsetHero = { playerId: pick.player_id, ratio };
            }
            if (upsetHero) highlights.push(`${playerName.get(upsetHero.playerId) ?? "A FamBam player"} made the biggest upset pick`);

            let delivered = false;
            for (const playerId of playerIds) {
              if (!preferences.get(playerId)?.trophyAlerts) continue;
              delivered = (await notifyPlayer(playerId, {
                title: "🏆 FamBam Weekly Recap",
                body: `${highlights.join("! ")}!`,
                tag: `weekly-recap-${completedChallenge.id}`,
                url: "/",
              })) || delivered;
            }
            if (delivered) await mark(marker);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    console.error("Notification send failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notifications failed." }, { status: 500 });
  }
}
