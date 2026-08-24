"use client";

import { useEffect, useState } from "react";

/**
 * Who is signed in.
 *
 * One shared hook so the shop's name, owner and city are read from the session
 * in exactly one place. Previously several screens fell back to a hardcoded
 * demo dealer when they had nothing, which meant a real dealer could see
 * another shop's name on their own console for a frame — or permanently, if the
 * page never had real data to replace it with. There is no fallback here: an
 * absent account renders as absent.
 */

export type DealerAccount = {
  id: string;
  name: string;
  owner: string;
  city: string;
  pincode: string | null;
  phone: string | null;
  tier: string;
  hasCoords: boolean;
};

export type HeaderClimate = {
  city: string;
  tempC: number;
  humidityPct: number;
  live: boolean;
};

type MeResponse = { dealer: DealerAccount | null; climate: HeaderClimate | null };

/**
 * Fetched once and shared, not once per component.
 *
 * Two consumers mount on the Overview — the console shell and the page itself —
 * and each used to call `/api/auth/me` on mount. That endpoint does a LIVE
 * weather lookup against Open-Meteo server-side, so rendering one screen made
 * two outbound calls to a third party and waited about 0.75s for each. Every
 * navigation did it again.
 *
 * The answer is cached for five minutes: a dealer's shop name never changes
 * inside a session, and weather does not move meaningfully faster than that.
 * The in-flight promise is shared too, so components mounting together produce
 * one request between them rather than a race.
 */
let mePromise: Promise<MeResponse> | null = null;
let meAt = 0;
const ME_TTL_MS = 5 * 60_000;

function loadMe(): Promise<MeResponse> {
  const fresh = mePromise && Date.now() - meAt < ME_TTL_MS;
  if (!fresh) {
    meAt = Date.now();
    mePromise = fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => ({ dealer: j.dealer ?? null, climate: j.climate ?? null }))
      .catch(() => {
        // Not cached on failure — the next mount should retry rather than be
        // stuck with an empty header for five minutes.
        mePromise = null;
        meAt = 0;
        return { dealer: null, climate: null };
      });
  }
  return mePromise as Promise<MeResponse>;
}

export function useDealerAccount() {
  const [account, setAccount] = useState<DealerAccount | null>(null);
  const [climate, setClimate] = useState<HeaderClimate | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMe()
      .then((j) => {
        if (cancelled) return;
        setAccount(j.dealer);
        setClimate(j.climate);
      })
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { account, climate, ready };
}

/** Drop the cache — call after sign-out so the next dealer is not shown the last one. */
export function clearDealerAccountCache() {
  mePromise = null;
  meAt = 0;
}
