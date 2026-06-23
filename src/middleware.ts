import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/constants";
import { verifySessionToken } from "@/lib/session";

const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Geçersiz oturum" }, { status: 401 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-user-id", session.sub);
  headers.set("x-user-role", session.role);

  return NextResponse.next({
    request: { headers },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
