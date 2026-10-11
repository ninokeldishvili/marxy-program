"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { explorerTx } from "@marxy/shared/config";
import { NETWORK_HINT } from "@marxy/shared/errors";

type Kind = "pending" | "success" | "error";

export interface Toast {
  id: number;
  kind: Kind;
  title: string;
  detail?: string;
  signature?: string;
  networkHint?: boolean;
}

interface ToastApi {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, t: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts outside ToastProvider");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const schedule = useCallback(
    (id: number, kind: Kind) => {
      if (kind !== "pending") setTimeout(() => dismiss(id), kind === "error" ? 12_000 : 7_000);
    },
    [dismiss],
  );

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      schedule(id, t.kind);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, t: Partial<Omit<Toast, "id">>) => {
      setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, ...t } : x)));
      if (t.kind) schedule(id, t.kind);
    },
    [schedule],
  );

  const api = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${
              t.kind === "error"
                ? "border-danger/40 bg-[#2a1614]/95"
                : t.kind === "success"
                  ? "border-accent/30 bg-surface/95 shadow-[0_0_30px_rgb(208_242_106/0.1)]"
                  : "border-white/[0.08] bg-surface/95"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {t.kind === "pending" && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />}
                  {t.title}
                </p>
                {t.detail && <p className="mt-1 text-sm text-muted">{t.detail}</p>}
                {t.networkHint && <p className="mt-2 text-sm text-warn">{NETWORK_HINT}</p>}
                {t.signature && (
                  <a className="mt-1 inline-block text-sm text-accent underline-offset-2 hover:underline" href={explorerTx(t.signature)} target="_blank" rel="noreferrer">
                    View on explorer ↗
                  </a>
                )}
              </div>
              <button className="text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
