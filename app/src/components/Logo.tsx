"use client";

import { useState } from "react";

/** The logo from /public/marxy_logo.svg, or the text "Marxy" if it's missing. */
export function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-xl font-extrabold tracking-tight text-accent">Marxy</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/marxy_logo.svg" alt="Marxy" className="h-9 w-auto" onError={() => setFailed(true)} />
  );
}
