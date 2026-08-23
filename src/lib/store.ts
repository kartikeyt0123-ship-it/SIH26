"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerSpec, Scheme } from "./recommend";
import type { Measurements, SelectedScheme, SessionDTO } from "./session-types";

/**
 * Client-side data access.
 *
 * Everything here is an HTTP call to this application's own API, which is what
 * makes the QR flow work at all: the customer's phone and the dealer's browser
 * are different devices on different networks, and the only thing they share is
 * the server. The previous localStorage implementation could never have worked
 * across devices — it only ever looked like it did because both windows were
 * open in the same browser.
 */

export type { Measurements, SelectedScheme, SessionDTO } from "./session-types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? res.statusText), { status: res.status, body: json });
  return json as T;
}

/* ------------------------------ dealer side ------------------------------ */

export type IssuedSession = {
  session: SessionDTO;
  url: string;
  qr: string;
  publicReachable: boolean;
  origin: string;
};

export const issueSession = (input: {
  customerName: string;
  phone?: string;
  validityHours: number;
}) => call<IssuedSession>("/api/sessions", { method: "POST", body: JSON.stringify(input) });

export const revokeSession = (token: string) =>
  call<{ ok: true }>(`/api/sessions/${token}`, { method: "DELETE" });

/**
 * §28 — the dealer dashboard reflects a submission without a reload.
 *
 * Polling, not WebSockets. Five seconds is well inside the time it takes a
 * dealer to look up from the counter, and it needs no extra infrastructure.
 * If Supabase Realtime is configured later, this hook is the only thing that
 * changes.
 */
export function useDealerSessions(pollMs = 5000) {
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [origin, setOrigin] = useState("");
  const [publicReachable, setPublicReachable] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await call<{
        sessions: SessionDTO[];
        origin: string;
        publicReachable: boolean;
      }>("/api/sessions");
      setSessions(r.sessions);
      setOrigin(r.origin);
      setPublicReachable(r.publicReachable);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    // Poll only while the tab is visible; a backgrounded dashboard hitting the
    // database every five seconds all afternoon is pure waste.
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, pollMs]);

  return { sessions, origin, publicReachable, ready, error, refresh: load };
}

export const createQuotation = (input: {
  token: string;
  discountPct: number;
  override?: boolean;
}) => call<{ quotationId: string; total: number; session: SessionDTO }>("/api/quotations", {
  method: "POST",
  body: JSON.stringify(input),
});

/* ----------------------------- customer side ----------------------------- */

export function useCustomerSession(token: string) {
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "expired">("loading");
  const touched = useRef(false);

  const load = useCallback(
    async (touch = false) => {
      try {
        const r = await call<{ session: SessionDTO }>(
          `/api/sessions/${token}${touch ? "?touch=1" : ""}`,
        );
        setSession(r.session);
        setState("ready");
      } catch (e) {
        const err = e as { status?: number };
        setState(err.status === 410 ? "expired" : "missing");
      }
    },
    [token],
  );

  useEffect(() => {
    if (touched.current) return;
    touched.current = true;
    load(true);
  }, [load]);

  const apply = useCallback((s: SessionDTO) => setSession(s), []);

  return { session, state, reload: load, apply };
}

export const patchSession = (
  token: string,
  body: {
    spec?: CustomerSpec;
    measurements?: Measurements;
    room?: Record<string, unknown>;
    roomEngine?: string;
    roomConfidence?: string;
    step?: number;
    rawText?: string;
    customerName?: string;
    phone?: string;
  },
) => call<{ session: SessionDTO }>(`/api/sessions/${token}`, {
  method: "PATCH",
  body: JSON.stringify(body),
});

export async function uploadImages(token: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("file", f));
  return call<{
    uploaded: { id: string; url: string }[];
    rejected: { name: string; reason: string }[];
    session: SessionDTO;
  }>(`/api/sessions/${token}/images`, { method: "POST", body: form });
}

export const deleteImage = (token: string, id: string) =>
  call<{ session: SessionDTO }>(`/api/sessions/${token}/images?id=${id}`, { method: "DELETE" });

export const saveDesign = (token: string, design: { schemeId: string; label?: string; scheme: SelectedScheme }) =>
  call<{ session: SessionDTO }>(`/api/sessions/${token}/designs`, {
    method: "POST",
    body: JSON.stringify(design),
  });

export const chooseDesign = (token: string, designId: string) =>
  call<{ session: SessionDTO }>(`/api/sessions/${token}/designs`, {
    method: "PATCH",
    body: JSON.stringify({ designId }),
  });

export const removeDesign = (token: string, designId: string) =>
  call<{ session: SessionDTO }>(`/api/sessions/${token}/designs?id=${designId}`, {
    method: "DELETE",
  });

export const submitSession = (token: string, note?: string) =>
  call<{ session: SessionDTO }>(`/api/sessions/${token}/submit`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

/**
 * Recommendations are computed server-side against live inventory (§14, §33).
 * The browser never decides what is available.
 */
export const fetchRecommendations = (input: {
  token: string;
  spec: CustomerSpec;
  photoHex?: string;
  limit?: number;
}) => call<{ schemes: Scheme[]; stockedLines: number; producibleShades: number }>("/api/recommend", {
  method: "POST",
  body: JSON.stringify(input),
});

export type DealerCatalogue = {
  brands: string[];
  categories: { slug: string; label: string; name: string }[];
  shades: {
    code: string;
    name: string;
    hex: string;
    family: string;
    wallSafe: boolean;
    exteriorSuitable: boolean;
    /** False when this dealer cannot tint it today. Shown, not hidden. */
    available: boolean;
    blockedReason: string | null;
  }[];
  productCount: number;
};

/**
 * The catalogue for a specific session's dealer.
 *
 * The token is required from the customer app: the endpoint resolves the dealer
 * from it rather than accepting a dealer id, so a customer can only ever see
 * the shop that issued their link.
 */
export const fetchCatalogue = (token?: string) =>
  call<DealerCatalogue>(token ? `/api/catalog?token=${encodeURIComponent(token)}` : "/api/catalog");

/* --------------------------- Round 2: intelligence ------------------------ */

import type { SurfaceObservation, SurfaceReport } from "./surface";
import type { DesignDNA, DesignSignal } from "./dna";
import type { MaterialSuggestion, Placement } from "./materials";
import type { ClimateAdvice, ClimateContext } from "./climate";
import type { Intent } from "./whatif";

/** Persist a surface reading measured in the browser. */
export const postSurfaceReport = (
  token: string,
  report: SurfaceReport,
  surface: "interior" | "exterior",
) =>
  call<{ session: SessionDTO; disclosure: string }>(`/api/sessions/${token}/surface`, {
    method: "POST",
    body: JSON.stringify({
      observations: report.observations,
      surface,
      imageCount: report.imageCount,
    }),
  });

/**
 * Record what the customer did, and get the re-derived profile back.
 *
 * Failures are swallowed by the caller on purpose: a preference signal that
 * does not reach the server is a slightly thinner profile, and it must never
 * be allowed to interrupt someone choosing a colour.
 */
export const postDesignSignals = (token: string, signals: DesignSignal[]) =>
  call<{ dna: DesignDNA; disclosure: string }>(`/api/sessions/${token}/dna`, {
    method: "POST",
    body: JSON.stringify({ signals }),
  });

export const fetchDesignDNA = (token: string) =>
  call<{ dna: DesignDNA; disclosure: string }>(`/api/sessions/${token}/dna`);

export const fetchWhatIf = (input: {
  token: string;
  intent: Intent;
  spec: CustomerSpec;
  photoHex?: string;
}) =>
  call<{
    intent: Intent;
    prompt: string;
    schemes: Scheme[];
    changed: string[];
    engine: string;
    stockedLines: number;
    producibleShades: number;
  }>(`/api/sessions/${input.token}/whatif`, {
    method: "POST",
    body: JSON.stringify({ intent: input.intent, spec: input.spec, photoHex: input.photoHex }),
  });

export type MaterialsResponse = {
  materials: {
    engine: string;
    groups: { placement: Placement; items: MaterialSuggestion[] }[];
    all: MaterialSuggestion[];
    disclosure: string;
  };
  climate: {
    context: ClimateContext;
    advice: ClimateAdvice[];
    live: boolean;
    disclosure: string;
  };
};

export const fetchMaterials = (input: {
  token: string;
  mainHex: string;
  accentHex: string;
  surface: "interior" | "exterior";
  conditions: string[];
  roomType?: string;
  roomSize?: "small" | "medium" | "large";
  budget?: string;
}) =>
  call<MaterialsResponse>(`/api/sessions/${input.token}/materials`, {
    method: "POST",
    body: JSON.stringify(input),
  });

/** What the dealer can mix instead of a colour they cannot produce today. */
export const fetchSubstitutes = (token: string, code: string, surface: "interior" | "exterior") =>
  call<{
    available: boolean;
    wanted: { code: string; name: string; hex: string };
    headline: string;
    substitutes: {
      shade: { code: string; name: string; hex: string };
      deltaE: number;
      closeness: string;
      why: string;
    }[];
  }>(`/api/sessions/${token}/shade-request?code=${encodeURIComponent(code)}&surface=${surface}`);

/** Put a colour the customer wants on the dealer's dashboard, by name. */
export const requestShade = (token: string, code: string, substituteCode?: string) =>
  call<{ ok: true; id: string; duplicate?: boolean }>(
    `/api/sessions/${token}/shade-request`,
    { method: "POST", body: JSON.stringify({ code, substituteCode }) },
  );

export type { SurfaceObservation, SurfaceReport, DesignDNA, DesignSignal };

/* -------------------------------- helpers -------------------------------- */

export function formatRemaining(hoursLeft: number) {
  if (hoursLeft <= 0) return "expired";
  if (hoursLeft < 1) return `${Math.round(hoursLeft * 60)} min`;
  if (hoursLeft < 48) return `${Math.round(hoursLeft)} h`;
  return `${Math.floor(hoursLeft / 24)} d ${Math.round(hoursLeft % 24)} h`;
}
