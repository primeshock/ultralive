import { NextResponse } from "next/server";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin" || pathname.startsWith("/_next/") || pathname.startsWith("/api/")) return NextResponse.next();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const sameOriginUrl = new URL("/api/site", request.url);
    const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050";
    let response;
    try {
      response = await fetch(sameOriginUrl, { cache: "no-store", signal: controller.signal });
      if (!response.ok) response = await fetch(`${configuredApiUrl}/api/site`, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    const settings = response.ok ? await response.json() : null;
    const adminPath = String(settings?.adminPath || "admin").replace(/^\/+|\/+$/g, "");
    if (adminPath !== "admin" && pathname === `/${adminPath}`) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/admin";
      return NextResponse.rewrite(destination);
    }
  } catch {
    // Keep normal routing available when the API is temporarily unavailable.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
