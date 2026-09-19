import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|api/(?:college-football|college-volleyball|soccer|nhl|mlb|games|game-insights|challenge-games|challenge|player-session|player-picks|game-room|player-profile|passport|event-picks|sync|notifications)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
