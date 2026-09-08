import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static
     * - _next/image
     * - favicon.ico
     * - image files
     * - FamBam API routes
     */
    "/((?!_next/static|_next/image|favicon.ico|api/(?:college-football|soccer|games|challenge-games)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};