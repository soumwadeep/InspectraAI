import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/register", "/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/storage/")
  ) {
    return NextResponse.next();
  }

  // Check for auth token on dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get("inspectra_access_token")?.value;

    if (!token) {
      // Allow initial page load; the client-side auth guard will redirect if needed
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
