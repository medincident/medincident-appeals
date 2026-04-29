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
    "/((?!api/auth|api/metrics|metrics|login|error|offline|sw\\.js|manifest\\.webmanifest|icons|_next/static|_next/image|favicon.ico).*)",
  ],
};
