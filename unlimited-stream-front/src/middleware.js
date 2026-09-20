import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin" || pathname.startsWith("/_next/") || pathname.startsWith("/api/")) return NextResponse.next();

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050";
    const response = await fetch(`${apiUrl}/api/site`, { cache: "no-store" });
    const settings = response.ok ? await response.json() : null;
    const adminPath = settings?.adminPath || "admin";
    if (adminPath !== "admin" && pathname === `/${adminPath}`) {
      return NextResponse.rewrite(new URL("/admin", request.url));
    }
  } catch {
    // Keep normal routing available when the API is temporarily unavailable.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
