/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

// Fixed "random" spark placement so server and client render the same markup.
const SPARKS = [
  [34, -0.4, 3.6],
  [62, -2.1, 4.9],
  [47, -1.3, 3.2],
  [55, -3.4, 5.1],
  [39, -2.7, 4.2],
  [66, -0.9, 3.9],
];

/**
 * A glowing art slot from the brand set (public/assets/img/<name>.jpg): the image
 * bobs, a chrome shine sweeps over it, and sparks rise. The landing's effects add
 * the mouse tilt.
 */
export function Art({ name, label, className = "", seed = 0 }: { name: string; label: string; className?: string; seed?: number }) {
  const src = `/assets/img/${name}.jpg`;
  return (
    <div className={`art is-live ${className}`} data-label={label}>
      <div className="art__inner">
        <div className="art__float">
          <img src={src} alt="" loading="lazy" />
          <div
            className="art__shine"
            style={{ "--src": `url("${src}")`, animationDelay: `${-((seed * 1.7) % 6).toFixed(2)}s` } as CSSProperties}
          />
        </div>
        <div className="art__glow" />
      </div>
      {SPARKS.map(([left, delay, duration], i) => (
        <i
          key={i}
          className="art__spark"
          style={{ left: `${left}%`, animationDelay: `${delay - (seed % 3) * 0.5}s`, animationDuration: `${duration}s` }}
        />
      ))}
    </div>
  );
}
