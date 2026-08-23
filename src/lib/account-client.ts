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

export function useDealerAccount() {
  const [account, setAccount] = useState<DealerAccount | null>(null);
  const [climate, setClimate] = useState<HeaderClimate | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setAccount(j.dealer ?? null);
        setClimate(j.climate ?? null);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { account, climate, ready };
}
