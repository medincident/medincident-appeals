import { auth } from "@/services/auth/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    // metrics и api/metrics — публичные: Grafana-UI и Prometheus scrape
    // ходят без auth, иначе scraper не сможет собирать метрики.
    "/((?!api/auth|api/metrics|metrics|login|error|_next/static|_next/image|favicon.ico).*)",
  ],
};
