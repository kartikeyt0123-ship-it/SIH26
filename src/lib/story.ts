"use client";

import { useSyncExternalStore } from "react";

/**
 * The scroll story is a single 0..1 timeline shared by the DOM and the WebGL
 * scene. The DOM writes to it (ScrollTrigger), the scene reads it every frame.
 *
 * Continuous progress deliberately lives OUTSIDE React state — writing it into
 * React would re-render the tree at 120Hz. Only the discrete beat index, which
 * changes a handful of times per page, is subscribable.
 *
 * Copy rule for beats: one line of body, never two. The scene is carrying the
 * argument here; the text is a caption, not an essay.
 */

export const BEATS = [
  {
    id: "space",
    index: "01",
    title: "A room. No decision.",
    body: "Photos, a vague idea, and a customer who cannot picture any of it.",
    tag: "The walk-in",
  },
  {
    id: "read",
    index: "02",
    title: "Read the space.",
    body: "Walls, floors, light and surface condition — before anyone opens a catalogue.",
    tag: "Understanding",
  },
  {
    id: "clad",
    index: "03",
    title: "Clad every surface.",
    body: "Coatings, tile, wallpaper, laminate, stone — on their room, not on a swatch card.",
    tag: "Composition",
  },
  {
    id: "swap",
    index: "04",
    title: "Change your mind, instantly.",
    body: "A whole scheme re-rendered in a second, so indecision becomes exploration.",
    tag: "Options",
  },
  {
    id: "stock",
    index: "05",
    title: "Only what you can supply.",
    body: "What you cannot deliver this week never reaches the customer's screen.",
    tag: "Availability",
  },
  {
    id: "quote",
    index: "06",
    title: "Quoted before they leave.",
    body: "Every surface, every quantity, your pricing — itemised while they are still standing there.",
    tag: "Conversion",
  },
] as const;

export type BeatId = (typeof BEATS)[number]["id"];

type Store = {
  /** 0..1 across the entire pinned story section. */
  progress: number;
  /** Index of the active beat, 0..BEATS.length-1. */
  beat: number;
  /** True once the story section is on screen — the canvas idles otherwise. */
  inView: boolean;
  /** Pointer in normalised device coords, for parallax. */
  pointer: { x: number; y: number };
};

const store: Store = {
  progress: 0,
  beat: 0,
  inView: false,
  pointer: { x: 0, y: 0 },
};

/** Hot path. Read directly in useFrame — never causes a render. */
export const storyRef = store;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setProgress(p: number) {
  store.progress = p;
  const next = Math.min(BEATS.length - 1, Math.floor(p * BEATS.length));
  if (next !== store.beat) {
    store.beat = next;
    emit();
  }
}

export function setInView(v: boolean) {
  if (store.inView === v) return;
  store.inView = v;
  emit();
}

export function setPointer(x: number, y: number) {
  store.pointer.x = x;
  store.pointer.y = y;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useBeat() {
  return useSyncExternalStore(
    subscribe,
    () => store.beat,
    () => 0,
  );
}

export function useStoryInView() {
  return useSyncExternalStore(
    subscribe,
    () => store.inView,
    () => false,
  );
}
