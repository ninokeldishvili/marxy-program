"use client";

import { useEffect, useRef } from "react";

const GAP = 18; // grid spacing in px
const RADIUS = 150; // mouse influence radius
const BOX = 14; // sprite box in CSS px
const LIME = "rgb(208, 242, 106)";

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Site-wide glyph grid: faint drifting waves, dots grow and glow near the mouse. */
export function MeshBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, cols = 0, rows = 0;
    let sprite: HTMLCanvasElement;
    const m = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    const ripples: { x: number; y: number; r: number }[] = [];
    let raf = 0;

    function makeSprite() {
      const size = Math.round(BOX * dpr);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const x = c.getContext("2d")!;
      x.scale(dpr, dpr);
      x.fillStyle = LIME;
      x.beginPath();
      x.arc(BOX / 2, BOX / 2, 0.9, 0, Math.PI * 2);
      x.fill();
      sprite = c;
    }

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      cv!.width = W * dpr;
      cv!.height = H * dpr;
      cols = Math.ceil(W / GAP) + 1;
      rows = Math.ceil(H / GAP) + 2;
      makeSprite();
    }

    function draw(x: number, y: number, s: number, a: number) {
      if (a < 0.015) return;
      g!.globalAlpha = Math.min(1, a);
      const sz = BOX * s;
      g!.drawImage(sprite, x - sz / 2, y - sz / 2, sz, sz);
    }

    function frame(ms: number) {
      const t = ms / 1000;
      // ease the glow toward the cursor so the trail feels smooth
      if (m.tx < -1000 || m.x < -1000) {
        m.x = m.tx;
        m.y = m.ty;
      } else {
        m.x += (m.tx - m.x) * 0.16;
        m.y += (m.ty - m.y) * 0.16;
      }
      for (const rp of ripples) rp.r += 8;
      while (ripples.length && ripples[0].r > Math.max(W, H)) ripples.shift();

      g!.setTransform(dpr, 0, 0, dpr, 0, 0);
      g!.clearRect(0, 0, W, H);
      const off = (scrollY * 0.15) % GAP; // grid drifts slightly with scroll for depth

      for (let j = 0; j < rows; j++) {
        const y = j * GAP - off;
        for (let i = 0; i < cols; i++) {
          const x = i * GAP + GAP / 2;
          const wave = Math.sin(x * 0.011 + t * 0.3) * Math.cos(y * 0.014 - t * 0.22) + Math.sin((x + y) * 0.005 + t * 0.18);
          const base = 0.02 + Math.max(0, wave) * 0.045;

          let f = 0;
          const d = Math.hypot(x - m.x, y - m.y);
          if (d < RADIUS) f = smooth(0, 1, 1 - d / RADIUS);
          for (const rp of ripples) {
            const rd = Math.abs(Math.hypot(x - rp.x, y - rp.y) - rp.r);
            if (rd < 26) f = Math.max(f, (1 - rd / 26) * 0.6 * Math.max(0, 1 - rp.r / 900));
          }

          if (f === 0) draw(x, y, 1, base);
          else draw(x, y, 1 + f * 1.4, base + f * f * 0.75);
        }
      }
      g!.globalAlpha = 1;
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    }

    const onMove = (e: PointerEvent) => {
      m.tx = e.clientX;
      m.ty = e.clientY;
    };
    const onLeave = () => {
      m.tx = m.ty = -9999;
    };
    const onDown = (e: PointerEvent) => ripples.push({ x: e.clientX, y: e.clientY, r: 0 });

    resize();
    addEventListener("resize", resize);
    const hover = !matchMedia("(hover: none)").matches;
    if (hover) {
      addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      addEventListener("pointerdown", onDown);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={ref} className="mesh-bg" aria-hidden="true" />;
}
