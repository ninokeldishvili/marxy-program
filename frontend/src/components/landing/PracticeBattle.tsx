"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* A practice battle against bots: buy credits, the gates lock, then bid
   against a fast countdown. Nothing touches the chain; it only teaches the game. */

const MAX_CREDITS = 10;
const BUY_SECONDS = 8;
const COUNTDOWN = 6; // seconds per bid (the real game uses a longer countdown)
const TICK_MS = 100;
const LOT = "10 SOL";
const BEST_KEY = "marxy:practice";

type Phase = "intro" | "buy" | "ready" | "battle" | "result";
type Style = "eager" | "sniper" | "random";

interface Rival {
  name: string;
  avatar: string;
  style: Style;
  credits: number;
  patience: number; // eager: delay before answering; sniper: how late it bids
}
interface RivalView {
  name: string;
  avatar: string;
  out: boolean;
}
interface Result {
  won: boolean;
  winner: string;
  brought: number;
  used: number;
  bids: number;
  seconds: number;
}

const NAMES = ["7xK…f3Q", "9pL…a1M", "3Fz…Qw8", "Bv2…k7T", "Hn5…Yc4", "Dq8…m2R", "Ws4…p9J", "Ke7…z2V"];
const STYLES: Style[] = ["eager", "sniper", "random", "eager", "sniper"];
const AVATARS = ["🦁", "🐺", "🦅", "🐍", "🐗"];
const YOU_AVATAR = "⚔️";

function makeRivals(): Rival[] {
  const names = [...NAMES].sort(() => Math.random() - 0.5);
  return STYLES.map((style, i) => ({
    name: names[i],
    avatar: AVATARS[i],
    style,
    credits: 1 + Math.floor(Math.random() * 3), // 1..3: keeps a practice battle short
    patience: style === "sniper" ? 0.6 + Math.random() * 1.6 : 1.5 + Math.random() * 2.5,
  }));
}

function readBest(): { wins: number; plays: number } {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || "") as { wins: number; plays: number };
  } catch {
    return { wins: 0, plays: 0 };
  }
}
function saveBest(won: boolean) {
  try {
    const b = readBest();
    localStorage.setItem(BEST_KEY, JSON.stringify({ wins: b.wins + (won ? 1 : 0), plays: b.plays + 1 }));
  } catch {
    /* storage unavailable: the record just isn't kept */
  }
}

/** Mounted only while open, so every opening starts from a fresh state. */
export function PracticeBattle({ onClose, onConnect }: { onClose: () => void; onConnect: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [buy, setBuy] = useState(5);
  const [buyLeft, setBuyLeft] = useState(BUY_SECONDS);
  const [ready, setReady] = useState(3);
  const [remaining, setRemaining] = useState(COUNTDOWN);
  const [myCredits, setMyCredits] = useState(0);
  const [brought, setBrought] = useState(0);
  const [leader, setLeader] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState(readBest);
  const [rivalsView, setRivalsView] = useState<RivalView[]>([]);
  const [lastBid, setLastBid] = useState<{ id: number; who: string } | null>(null);
  const buyRef = useRef(5);
  const chooseBuy = (n: number) => {
    const v = Math.min(MAX_CREDITS, Math.max(1, n));
    buyRef.current = v;
    setBuy(v);
  };

  // Mutable game state the timer reads without re-subscribing every tick
  const g = useRef({
    rivals: [] as Rival[],
    remaining: COUNTDOWN,
    leader: null as string | null,
    sinceBid: 0,
    myCredits: 0,
    myBids: 0,
    brought: 0,
    elapsed: 0,
    feedId: 0,
    lastBidAt: 0,
  });
  const bidBtn = useRef<HTMLButtonElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = setTimeout(() => startBtn.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Escape closes; Space bids during the battle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.code === "Space" && phase === "battle") {
        e.preventDefault();
        bidBtn.current?.click();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  // Lock scrolling behind the popup
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  const placeBid = useCallback((who: string) => {
    const s = g.current;
    s.leader = who;
    s.remaining = COUNTDOWN;
    s.sinceBid = 0;
    s.lastBidAt = s.elapsed;
    const id = ++s.feedId;
    setLeader(who);
    setLastBid({ id, who });
    setRemaining(COUNTDOWN);
  }, []);

  const lockIn = useCallback(() => {
    const s = g.current;
    const credits = buyRef.current;
    s.rivals = makeRivals();
    setRivalsView(s.rivals.map((r) => ({ name: r.name, avatar: r.avatar, out: false })));
    setLastBid(null);
    s.myCredits = credits;
    s.brought = credits;
    s.myBids = 0;
    s.remaining = COUNTDOWN;
    s.leader = null;
    s.sinceBid = 0;
    s.elapsed = 0;
    s.lastBidAt = -1;
    setMyCredits(credits);
    setBrought(credits);
    setLeader(null);
    setRemaining(COUNTDOWN);
    setReady(3);
    setPhase("ready");
  }, []);

  const startBuy = () => {
    setBuyLeft(BUY_SECONDS);
    setResult(null);
    setPhase("buy");
  };

  // Buy phase: tick the visible countdown, then the gates close on their own
  useEffect(() => {
    if (phase !== "buy") return;
    const tick = setInterval(() => setBuyLeft((v) => Math.max(0, v - 1)), 1000);
    const lock = setTimeout(lockIn, BUY_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(lock);
    };
  }, [phase, lockIn]);

  // "Gates locked" 3-2-1, then the battle starts
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(
      () => {
        if (ready > 0) setReady(ready - 1);
        else {
          setPhase("battle");
          setTimeout(() => bidBtn.current?.focus(), 30);
        }
      },
      ready > 0 ? 800 : 500,
    );
    return () => clearTimeout(t);
  }, [phase, ready]);

  // Battle loop: countdown + rival decisions
  useEffect(() => {
    if (phase !== "battle") return;
    const id = setInterval(() => {
      const s = g.current;
      const dt = TICK_MS / 1000;
      s.elapsed += dt;
      s.sinceBid += dt;
      s.remaining = Math.max(0, s.remaining - dt);

      if (s.remaining <= 0) {
        clearInterval(id);
        const won = s.leader === "You";
        const r: Result = {
          won,
          winner: s.leader ?? "Nobody",
          brought: s.brought,
          used: s.brought - s.myCredits,
          bids: s.myBids,
          seconds: Math.round(s.elapsed),
        };
        saveBest(won);
        setBest(readBest());
        setResult(r);
        setRemaining(0);
        setPhase("result");
        return;
      }
      setRemaining(s.remaining);

      // At most one rival bid per tick, and not right on top of another bid
      if (s.elapsed - s.lastBidAt < 0.35) return;
      const candidates = s.rivals.filter((r) => r.credits > 0 && r.name !== s.leader);
      for (const r of candidates.sort(() => Math.random() - 0.5)) {
        let go = false;
        if (r.style === "eager") go = s.sinceBid > r.patience && Math.random() < 0.25;
        else if (r.style === "sniper") go = s.remaining < r.patience && Math.random() < 0.6;
        else go = Math.random() < 0.025;
        // Nobody has bid yet: someone opens after a moment
        if (!s.leader && s.elapsed > 1.2 && Math.random() < 0.15) go = true;
        if (go) {
          r.credits -= 1;
          placeBid(r.name);
          if (r.credits === 0) setRivalsView(s.rivals.map((x) => ({ name: x.name, avatar: x.avatar, out: x.credits === 0 })));
          break;
        }
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, placeBid]);

  const onBid = () => {
    const s = g.current;
    if (phase !== "battle" || s.myCredits <= 0 || s.leader === "You") return;
    s.myCredits -= 1;
    s.myBids += 1;
    setMyCredits(s.myCredits);
    placeBid("You");
  };

  const ring = 2 * Math.PI * 70;
  const youLead = leader === "You";
  const leaderAvatar = youLead ? YOU_AVATAR : (rivalsView.find((r) => r.name === leader)?.avatar ?? "");
  const shareText = result
    ? result.won
      ? `I won a MARXY practice battle with ${result.used} of my ${result.brought} credits ⚔️ The biggest wallet doesn't win. Strategy does.`
      : `I lost a MARXY practice battle to ${result.winner} 😤 Rematch incoming. Buy. Lock. Battle. Win.`
    : "";
  const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://marxy.fun")}&via=marxyfun`;

  return (
    <div className="pb" role="dialog" aria-modal="true" aria-labelledby="pb-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pb__card">
        <button type="button" className="pb__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {phase === "intro" && (
          <div className="pb__step">
            <p className="eyebrow">Practice battle · no wallet needed</p>
            <h2 id="pb-title" className="pb__title">
              Can you take the <span>{LOT}</span>?
            </h2>
            <ol className="pb__rules">
              <li>
                <b>Buy</b> up to {MAX_CREDITS} credits. Each credit is one bid.
              </li>
              <li>
                <b>Lock</b>: the gates close. No more credits for anyone.
              </li>
              <li>
                <b>Battle</b>: every bid resets the {COUNTDOWN}s countdown. You can&apos;t outbid yourself.
              </li>
              <li>
                <b>Win</b>: whoever bid last when it hits zero takes the lot.
              </li>
            </ol>
            <p className="pb__hint">5 rivals. Some bid fast, some wait until the last second.</p>
            {best.plays > 0 && (
              <p className="pb__record">
                Your record: <b>{best.wins}</b> win{best.wins === 1 ? "" : "s"} in {best.plays} battle{best.plays === 1 ? "" : "s"}
              </p>
            )}
            <button ref={startBtn} type="button" className="btn pb__wide" onClick={startBuy}>
              Start
            </button>
          </div>
        )}

        {phase === "buy" && (
          <div className="pb__step">
            <p className="eyebrow">Step 1 · Buy</p>
            <h2 id="pb-title" className="pb__title">
              How many credits do you bring?
            </h2>
            <div className="pb__credits">
              <button type="button" className="pb__step-btn" onClick={() => chooseBuy(buy - 1)} aria-label="Fewer credits">
                −
              </button>
              <div className="pb__credit-count">
                <span>{buy}</span>
                <small>credits</small>
              </div>
              <button type="button" className="pb__step-btn" onClick={() => chooseBuy(buy + 1)} aria-label="More credits">
                +
              </button>
            </div>
            <input
              className="pb__slider"
              type="range"
              min={1}
              max={MAX_CREDITS}
              value={buy}
              onChange={(e) => chooseBuy(Number(e.target.value))}
              aria-label="Credits to buy"
            />
            <p className="pb__hint">Rivals bring 1 to 4 each. You won&apos;t know how many.</p>
            <div className="pb__bar">
              <i style={{ width: `${(buyLeft / BUY_SECONDS) * 100}%` }} />
            </div>
            <button type="button" className="btn pb__wide" onClick={lockIn}>
              Lock in {buy} credit{buy === 1 ? "" : "s"} · gates close in {buyLeft}s
            </button>
          </div>
        )}

        {phase === "ready" && (
          <div className="pb__step pb__center">
            <p className="eyebrow">Step 2 · Lock</p>
            <h2 id="pb-title" className="pb__title">
              Gates locked. Get ready.
            </h2>
            <div className="pb__ready" key={ready}>
              {ready > 0 ? ready : "Go!"}
            </div>
          </div>
        )}

        {phase === "battle" && (
          <div className="pb__step pb__center">
            <p className="eyebrow">Step 3 · Battle for {LOT}</p>

            {/* Arena: rivals around the clock */}
            <div className="pb__arena">
              <div className="pb__rivals">
                {rivalsView.map((r) => (
                  <Avatar
                    key={r.name}
                    emoji={r.avatar}
                    label={r.name}
                    lead={leader === r.name}
                    out={r.out}
                    hit={lastBid?.who === r.name ? lastBid.id : 0}
                  />
                ))}
              </div>

              <div className={`pb__ring ${remaining < 2 ? "is-low" : ""} ${youLead ? "is-mine" : ""}`}>
                {lastBid && <span key={lastBid.id} className="pb__shock" aria-hidden="true" />}
                <svg viewBox="0 0 160 160" aria-hidden="true">
                  <circle cx="80" cy="80" r="70" className="pb__ring-bg" />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    className="pb__ring-fg"
                    style={{ strokeDasharray: ring, strokeDashoffset: ring * (1 - remaining / COUNTDOWN) }}
                  />
                </svg>
                <div className="pb__time">
                  <span>{remaining.toFixed(1)}</span>
                  <small>{leader ? `${leaderAvatar} leads` : "waiting"}</small>
                </div>
              </div>

              <Avatar emoji={YOU_AVATAR} label="You" lead={youLead} out={myCredits <= 0 && !youLead} hit={lastBid?.who === "You" ? lastBid.id : 0} you />
            </div>

            {/* How close is the win? */}
            <div className={`pb__meter ${youLead ? "is-mine" : leader ? "is-theirs" : ""}`} aria-live="polite">
              <div className="pb__meter-bar">
                <i style={{ width: leader ? `${(1 - remaining / COUNTDOWN) * 100}%` : "0%" }} />
              </div>
              <p>
                {!leader
                  ? "First bid opens the battle"
                  : youLead
                    ? `Hold on… ${remaining.toFixed(1)}s to victory`
                    : `${leaderAvatar} ${leader} is ${remaining.toFixed(1)}s from winning. Steal it!`}
              </p>
            </div>

            <button
              ref={bidBtn}
              type="button"
              className="btn pb__bid"
              onClick={onBid}
              disabled={myCredits <= 0 || youLead}
            >
              {myCredits <= 0 ? "Out of credits" : youLead ? "👑 You're leading" : "BID · 1 credit"}
            </button>
            <p className="pb__me">
              <span className="pb__pips" aria-label={`${myCredits} credits left`}>
                {Array.from({ length: brought }, (_, i) => (
                  <i key={i} className={i < myCredits ? "is-on" : ""} />
                ))}
              </span>
              press <kbd>Space</kbd> to bid
            </p>
          </div>
        )}

        {phase === "result" && result && (
          <div className="pb__step pb__center">
            {result.won && <Confetti />}
            <div className={`pb__badge ${result.won ? "is-win" : ""}`}>{result.won ? "🏆" : "⚔️"}</div>
            <h2 id="pb-title" className="pb__title">
              {result.won ? (
                <>
                  You won <span>{LOT}</span>
                </>
              ) : result.winner === "Nobody" ? (
                "Nobody bid. Everyone is refunded."
              ) : (
                <>
                  <span>{result.winner}</span> takes it
                </>
              )}
            </h2>
            <p className="pb__hint">
              {result.won
                ? "Practice lot only. In the real arena, it lands in your wallet."
                : result.used === result.brought
                  ? "You ran out of credits. The smartest bidder waits."
                  : `You still had ${result.brought - result.used} credit${result.brought - result.used === 1 ? "" : "s"}. Timing is everything.`}
            </p>
            <div className="pb__stats">
              <div>
                <b>
                  {result.used}/{result.brought}
                </b>
                <small>credits used</small>
              </div>
              <div>
                <b>{result.bids}</b>
                <small>your bids</small>
              </div>
              <div>
                <b>{result.seconds}s</b>
                <small>battle length</small>
              </div>
            </div>
            <p className="pb__record">
              Record: <b>{best.wins}</b> win{best.wins === 1 ? "" : "s"} in {best.plays} battle{best.plays === 1 ? "" : "s"}
            </p>
            <div className="pb__actions">
              <button type="button" className="btn" onClick={startBuy}>
                Play again
              </button>
              <a className="btn btn--ghost" href={shareUrl} target="_blank" rel="noopener noreferrer">
                Share on X
              </a>
            </div>
            <button
              type="button"
              className="pb__link"
              onClick={() => {
                onClose();
                onConnect();
              }}
            >
              Ready for real? Connect wallet →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ emoji, label, lead, out, hit, you }: { emoji: string; label: string; lead: boolean; out: boolean; hit: number; you?: boolean }) {
  return (
    <div className={`pb__av ${lead ? "is-lead" : ""} ${out ? "is-out" : ""} ${you ? "is-you" : ""}`}>
      <div className="pb__av-face">
        {lead && <span className="pb__crown" aria-hidden="true">👑</span>}
        <span aria-hidden="true">{out ? "💀" : emoji}</span>
        {hit > 0 && <span key={hit} className="pb__minus" aria-hidden="true">−1</span>}
        {hit > 0 && <span key={`r${hit}`} className="pb__ping" aria-hidden="true" />}
      </div>
      <small>{label}</small>
    </div>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 13) % 10) / 20,
  dur: 1.4 + ((i * 7) % 10) / 10,
  hue: i % 3,
  spin: (i * 47) % 360,
}));

function Confetti() {
  return (
    <div className="pb__confetti" aria-hidden="true">
      {CONFETTI.map((c, i) => (
        <i
          key={i}
          className={`c${c.hue}`}
          style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, rotate: `${c.spin}deg` }}
        />
      ))}
    </div>
  );
}
