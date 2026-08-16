"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import { cn, inr } from "@/lib/utils";

type Row = {
  name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  productId: string | null;
  productLabel: string | null;
  confidence: "exact" | "likely" | "weak" | "none";
  action: "update" | "create-pending" | "skip";
  currentLitres?: number;
};

type Preview = {
  filename: string;
  format: string;
  total: number;
  matched: number;
  skipped: number;
  rows: Row[];
};

/**
 * Import stock from Tally.
 *
 * A dry run is mandatory — the dealer sees every proposed match, its
 * confidence, and the value it would replace, before anything is written. Rows
 * are individually deselectable, and weak matches start unchecked, because the
 * cost of a wrong mapping is not a bad row in a table: it is a customer being
 * shown a product the dealer cannot supply.
 */
export function TallyImport({ onDone }: { onDone?: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; created: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/inventory/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Import failed");
      setPreview(json);
      // Confident matches are pre-accepted; anything weaker is opt-in.
      setAccepted(
        new Set(
          (json.rows as Row[])
            .map((r, i) => (r.action === "update" && r.confidence !== "weak" ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const rows = [...accepted]
        .map((i) => preview.rows[i])
        .filter((r) => r?.productId && r.quantity !== null)
        .map((r) => ({ productId: r.productId, quantity: r.quantity, rate: r.rate }));
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Commit failed");
      setResult(json);
      setPreview(null);
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Panel className="mt-4">
      <PanelHead
        title="Import stock from Tally"
        sub="Stock Summary as CSV, or a native Tally XML export. Nothing is written until you confirm."
        right={<FileSpreadsheet className="h-4 w-4 text-paper-400" strokeWidth={1.6} />}
      />

      {!preview && (
        <>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) upload(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_20%,transparent)] px-6 py-10 text-center transition-colors",
              "hover:border-[color-mix(in_oklab,var(--color-pigment)_50%,transparent)]",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-pigment" strokeWidth={1.6} />
            ) : (
              <Upload className="h-5 w-5 text-paper-300" strokeWidth={1.6} />
            )}
            <span className="text-[0.9375rem] text-paper-100">
              {busy ? "Reading your export…" : "Drop your Tally export here, or browse"}
            </span>
            <span className="text-[0.8125rem] text-paper-400">.csv · .xls exported as CSV · .xml</span>
            <input
              ref={input}
              type="file"
              accept=".csv,.txt,.xml,text/csv,text/xml,application/xml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>

          <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4">
            <p className="eyebrow">Getting the file out of Tally</p>
            <ol className="mt-2 flex flex-col gap-1 text-[0.8125rem] leading-relaxed text-paper-400">
              <li>1. Gateway of Tally → Display → Stock Summary</li>
              <li>2. Press <span className="data text-paper-200">Alt + E</span> to export</li>
              <li>3. Format: <span className="data text-paper-200">CSV</span> (or XML), then Export</li>
              <li>4. Drop the file above</li>
            </ol>
            <p className="mt-3 text-[0.75rem] leading-relaxed text-paper-400">
              This is a one-way import, not a live sync. Tally stays your system of record —
              we read stock positions from it and never write back.
            </p>
          </div>
        </>
      )}

      {result && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-glaze)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-glaze)_10%,transparent)] p-4">
          <Check className="h-4 w-4 text-[#7fd6c9]" strokeWidth={2} />
          <p className="text-[0.875rem] text-paper-100">
            {result.updated} lines updated{result.created ? `, ${result.created} added` : ""}.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_9%,transparent)] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pigment-soft" strokeWidth={1.8} />
          <p className="text-[0.8125rem] leading-relaxed text-paper-200">{error}</p>
        </div>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-4">
            <div>
              <p className="data text-[0.8125rem] text-paper-100">{preview.filename}</p>
              <p className="mt-0.5 text-[0.75rem] text-paper-400">
                {preview.format} · {preview.total} rows read · {preview.matched} matched ·{" "}
                {preview.skipped} unmatched
              </p>
            </div>
            <button
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              className="flex items-center gap-1.5 text-[0.8125rem] text-paper-400 hover:text-paper-50"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} /> Discard
            </button>
          </div>

          <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)]">
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {preview.rows.map((r, i) => {
                const selectable = r.action === "update";
                const on = accepted.has(i);
                return (
                  <label
                    key={i}
                    className={cn(
                      "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors",
                      selectable ? "hover:bg-ink-700/40" : "opacity-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!selectable}
                      onChange={() => toggle(i)}
                      className="h-4 w-4 accent-[var(--color-pigment)]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[0.8125rem] text-paper-100">{r.name}</p>
                      <p className="data mt-0.5 text-[0.625rem] text-paper-400">
                        {r.quantity ?? "—"} {r.unit ?? ""} {r.rate ? `· ${inr(r.rate)}/unit` : ""}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[0.8125rem] text-paper-200">
                        {r.productLabel ?? <span className="text-paper-400 italic">no match in catalogue</span>}
                      </p>
                      {r.currentLitres !== undefined && r.quantity !== null && (
                        <p className="data mt-0.5 text-[0.625rem] text-paper-400">
                          {r.currentLitres} → {r.quantity}
                        </p>
                      )}
                    </div>
                    <Tag
                      status={
                        r.confidence === "exact"
                          ? "healthy"
                          : r.confidence === "likely"
                            ? "active"
                            : r.confidence === "weak"
                              ? "low"
                              : "expired"
                      }
                    >
                      {r.confidence === "none" ? "unmatched" : r.confidence}
                    </Tag>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              onClick={commit}
              disabled={busy || accepted.size === 0}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-paper-50 px-5 text-[0.9375rem] font-medium text-ink-900 transition-transform hover:-translate-y-px disabled:opacity-40"
            >
              {busy ? "Writing…" : `Apply ${accepted.size} line${accepted.size === 1 ? "" : "s"}`}
            </button>
            <p className="text-[0.75rem] text-paper-400">
              Weak matches start unchecked. Anything you leave unchecked is not touched.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
