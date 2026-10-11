"use client";

import { useEffect, type DependencyList } from "react";

/**
 * Runs `load` now, then every `intervalMs` while the tab is visible, and again
 * as soon as a hidden tab becomes visible. `load` gets `isCancelled` to skip
 * state updates after the deps changed. Re-subscribes when `deps` change.
 */
export function usePolling(
  load: (isCancelled: () => boolean) => unknown,
  intervalMs: number,
  deps: DependencyList,
): void {
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    const run = () => {
      if (document.visibilityState !== "hidden") void load(isCancelled);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // `load` is a fresh closure every render; callers list what it depends on in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
