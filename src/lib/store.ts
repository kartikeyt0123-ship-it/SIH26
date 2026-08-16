"use client";

import { useCallback, useEffect, useState } from "react";
import type { CustomerSpec } from "./recommend";
import type { RoomModel } from "./vision";

/**
 * The shared session store — the thing that makes the dealer console and the
 * customer's phone one system rather than two demos.
 *
 * Backed by localStorage with a `storage` event listener, so a code issued in
 * the dealer tab appears in the customer tab immediately, and a design
 * submitted on the customer side lands in the dealer's queue without a reload.
 *
 * This is EXACTLY the surface a real backend replaces: `createSession`,
 * `getSession`, `updateSession`, `listSessions`. Swap the four bodies for API
 * calls and every screen keeps working. Nothing else in the app touches
 * persistence.
 */

const KEY = "rachna.sessions.v2";
const EVENT = "rachna:sessions";

export type SelectedScheme = {
  id: string;
  title: string;
  rationale: string;
  lineId: string;
  trimLineId: string | null;
  shades: {
    main: { code: string; name: string; hex: string };
    feature: { code: string; name: string; hex: string };
    ceiling: { code: string; name: string; hex: string };
    trim: { code: string; name: string; hex: string };
  };
};

export type Measurements = {
  /** Customer-entered. Never inferred from a photograph. */
  lengthM: number;
  widthM: number;
  heightM: number;
  doors: number;
  windows: number;
  coats: number;
  includeCeiling: boolean;
  featureWall: boolean;
};

export type SessionStatus = "issued" | "in_progress" | "submitted" | "quoted" | "expired";

export type CustomerSession = {
  code: string;
  dealerId: string;
  customerName: string;
  phone: string;
  createdAt: number;
  expiresAt: number;
  validityHours: number;
  status: SessionStatus;
  opens: number;
  step: number;
  spec?: CustomerSpec;
  photos: string[];
  room?: RoomModel;
  scheme?: SelectedScheme;
  measurements?: Measurements;
  submittedAt?: number;
  quotedAt?: number;
  quoteTotal?: number;
  customerNote?: string;
};

export const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------- codes -------------------------------- */

// No O/0 and no I/1 — these get read aloud across a counter.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    const bytes = new Uint32Array(5);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 5; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    if (!existing.has(code)) return code;
  }
  // Practically unreachable at 32^5; falling back to time-based rather than
  // silently returning a duplicate, which would hand two customers one session.
  return `X${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

/* ------------------------------ persistence ---------------------------- */

function read(): CustomerSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    return JSON.parse(raw) as CustomerSession[];
  } catch {
    return [];
  }
}

function write(all: CustomerSession[]) {
  localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** One expired and one live session, so the dealer's list is never empty. */
function seed(): CustomerSession[] {
  const now = Date.now();
  const s: CustomerSession[] = [
    {
      code: "QD4M1",
      dealerId: "d_7XK92",
      customerName: "Arif Khan",
      phone: "+91 90••• ••887",
      createdAt: now - 6 * 60 * 60 * 1000,
      expiresAt: now + 2.75 * DAY,
      validityHours: 72,
      status: "in_progress",
      opens: 2,
      step: 2,
      photos: [],
    },
    {
      code: "T2NW7",
      dealerId: "d_7XK92",
      customerName: "Sunita Rao",
      phone: "+91 99••• ••102",
      createdAt: now - 5 * DAY,
      expiresAt: now - 2 * DAY,
      validityHours: 72,
      status: "expired",
      opens: 4,
      step: 4,
      photos: [],
    },
  ];
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode — the app still works, it just will not persist */
  }
  return s;
}

/* --------------------------------- API --------------------------------- */

export function listSessions(): CustomerSession[] {
  return read()
    .map(withExpiry)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getSession(code: string): CustomerSession | undefined {
  const found = read().find((s) => s.code === code.toUpperCase());
  return found ? withExpiry(found) : undefined;
}

export function createSession(input: {
  customerName: string;
  phone: string;
  validityHours: number;
}): CustomerSession {
  const all = read();
  const code = generateCode(new Set(all.map((s) => s.code)));
  const now = Date.now();
  const session: CustomerSession = {
    code,
    dealerId: "d_7XK92",
    customerName: input.customerName.trim() || "Walk-in customer",
    phone: input.phone.trim(),
    createdAt: now,
    expiresAt: now + input.validityHours * 60 * 60 * 1000,
    validityHours: input.validityHours,
    status: "issued",
    opens: 0,
    step: 0,
    photos: [],
  };
  write([session, ...all]);
  return session;
}

export function updateSession(code: string, patch: Partial<CustomerSession>) {
  const all = read();
  const i = all.findIndex((s) => s.code === code.toUpperCase());
  if (i === -1) return undefined;
  all[i] = { ...all[i], ...patch };
  write(all);
  return all[i];
}

export function deleteSession(code: string) {
  write(read().filter((s) => s.code !== code.toUpperCase()));
}

function withExpiry(s: CustomerSession): CustomerSession {
  if (s.status === "submitted" || s.status === "quoted") return s;
  return Date.now() > s.expiresAt ? { ...s, status: "expired" } : s;
}

export const isLive = (s: CustomerSession) =>
  Date.now() < s.expiresAt && s.status !== "expired";

export function hoursLeft(s: CustomerSession) {
  return Math.max(0, (s.expiresAt - Date.now()) / (60 * 60 * 1000));
}

export function formatRemaining(s: CustomerSession) {
  const h = hoursLeft(s);
  if (h <= 0) return "expired";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`;
}

/* -------------------------------- hooks -------------------------------- */

export function useSessions() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<CustomerSession[]>([]);

  // Read after mount only: localStorage does not exist during the server
  // render, and reading it in useState would produce a hydration mismatch.
  useEffect(() => {
    const load = () => {
      setSessions(listSessions());
      setReady(true);
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener(EVENT, load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener(EVENT, load);
    };
  }, []);

  return { sessions, ready };
}

export function useSession(code: string) {
  const [session, setSession] = useState<CustomerSession | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => {
      setSession(getSession(code));
      setReady(true);
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener(EVENT, load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener(EVENT, load);
    };
  }, [code]);

  const patch = useCallback(
    (p: Partial<CustomerSession>) => {
      const next = updateSession(code, p);
      if (next) setSession(next);
    },
    [code],
  );

  return { session, ready, patch };
}
