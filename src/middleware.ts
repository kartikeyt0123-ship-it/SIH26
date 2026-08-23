import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, readCookie } from "@/lib/dealer-cookie";

/**
 * Dealer-side gate.
 *
 * Replaces the shared HTTP Basic password. One secret shared by every dealer
 * was defensible while there was exactly one shop; with accounts it is not,
 * because it grants whoever holds it access to every dealer's customers,
 * photographs and quotations at once. The cookie names a specific tenant and
 * is signed, so it cannot be edited into someone else's shop.
 *
 * The signature is verified HERE, not merely checked for presence — that is why
 * the HMAC is built on Web Crypto (see lib/dealer-cookie.ts). A presence check
 * would let any arbitrary cookie value render the console shell.
 *
 * What is deliberately NOT gated: `/c/*` and `/api/sessions/<token>/*`. Those
 * are the customer's own journey and the unguessable token is their credential.
 * Putting a dealer login in front of them would break the QR the instant a
 * customer scanned it — which is the entire product.
 */

const DEALER_PATHS = ["/dashboard", "/api/inventory", "/api/quotations", "/api/intelligence"];

function needsDealer(pathname: string) {
  if (DEALER_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  // Listing every customer and issuing new codes is a dealer action.
  // `/api/sessions/<token>` and below belong to the customer and stay open.
  if (pathname === "/api/sessions") return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!needsDealer(pathname)) return NextResponse.next();

  const dealerId = await readCookie(req.cookies.get(COOKIE)?.value);
  if (dealerId) return NextResponse.next();

  // An API call gets JSON it can act on; a page gets sent to the sign-in screen
  // with a return path, so signing in lands the dealer where they were going
  // rather than dumping them on the overview.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "unauthorised", message: "Sign in to continue." },
      { status: 401 },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/sessions",
    "/api/inventory/:path*",
    "/api/quotations",
    "/api/quotations/:path*",
    "/api/intelligence",
  ],
};
