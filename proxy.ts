import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|pantry/use|api/(?:house|pantry|college-football|college-basketball|college-volleyball|local-hockey|soccer|nhl|mlb|games|game-insights|standings|challenge-games|challenge|player-session|player-picks|game-room|player-profile|passport|event-picks|sync|notifications|weather|word-of-day|fun-holiday|handmade-gifts|family-prayers|family-packing-list|daisy-feed|family-meal-plan)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
