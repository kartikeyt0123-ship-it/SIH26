import { NextResponse, type NextRequest } from "next/server";

/**
 * Dealer-side password gate.
 *
 * The dealer console is the whole shop: every customer's photographs, phone
 * number, design and quotation. Once the app has a permanent public URL, a
 * shared link would hand all of that to anyone who received it, so the console
 * sits behind HTTP Basic auth.
 *
 * What is deliberately NOT gated: `/c/*` and the session APIs under
 * `/api/sessions/<token>/*`. Those are the customer's own journey, and the
 * unguessable token is their credential. Putting a password in front of them
 * would break the QR the moment a customer scanned it.
 *
 * This is a shared password, not real authentication. It stops a link being
 * passed around; it is not a substitute for per-dealer accounts, which is what
 * a pilot with more than one shop needs.
 */

const PROTECTED = [
  "/dashboard",
  "/api/inventory",
  "/api/quotations",
];

function isProtected(pathname: string) {
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  // The dealer's own session endpoints: listing every customer and issuing new
  // codes. `/api/sessions/<token>` and below belong to the customer and stay open.
  if (pathname === "/api/sessions") return true;
  return false;
}

export function middleware(req: NextRequest) {
  const password = process.env.DEALER_PASSWORD?.trim();

  // No password configured: local development stays frictionless. The deploy
  // checklist sets this, and the dashboard warns when it is missing.
  if (!password) return NextResponse.next();
  if (!isProtected(req.nextUrl.pathname)) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      // Constant-time-ish compare: length first, then a full scan that does not
      // short-circuit on the first differing character.
      if (supplied.length === password.length) {
        let diff = 0;
        for (let i = 0; i < password.length; i++) {
          diff |= supplied.charCodeAt(i) ^ password.charCodeAt(i);
        }
        if (diff === 0) return NextResponse.next();
      }
    } catch {
      /* malformed header falls through to the challenge */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Rachna AI dealer console", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/sessions", "/api/inventory/:path*", "/api/quotations"],
};
