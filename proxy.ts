import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/(?:college-football|college-volleyball|soccer|nhl|mlb|games|challenge-games|challenge|player-session|player-picks|game-room|player-profile)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};