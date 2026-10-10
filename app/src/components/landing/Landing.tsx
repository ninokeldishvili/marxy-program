"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { useConnectModal } from "@/components/ConnectModal";
import { Art } from "./Art";
import { initLanding } from "./effects";
import { LandingAuctions } from "./LandingAuctions";
import "@/app/landing.css";

const X_URL = "https://x.com/marxyfun";

const COINS = [
  { x: 25.5, y: 34.0, s: 10.8, name: "Ethereum", sym: "ETH" },
  { x: 68.8, y: 35.3, s: 8.5, name: "Bitcoin", sym: "BTC" },
  { x: 26.8, y: 68.0, s: 8.0, name: "Solana", sym: "SOL" },
  { x: 81.0, y: 55.3, s: 8.3, name: "Solana", sym: "SOL" },
  { x: 67.5, y: 69.3, s: 5.3, name: "Tether", sym: "USDT" },
];

/** Smooth-scroll to an in-page section without putting #section in the URL. */
function Jump({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(to)?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <a href={`#${to}`} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

/** The marketing site (ported from marxy/index.html), shown until a wallet connects. */
export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { open } = useConnectModal();

  useEffect(() => initLanding(root.current!), []);

  return (
    <div className="landing" ref={root}>
      {/* NAV */}
      <header className="nav">
        <Jump to="hero" className="nav__logo">
          <img src="/assets/logo.png" alt="MARXY" width={143} height={32} />
        </Jump>
        <nav className="nav__links">
          <Jump to="why">Why Marxy</Jump>
          <Jump to="how">How it works</Jump>
          <Jump to="auctions">Auctions</Jump>
          <Jump to="fair">Fair play</Jump>
          <Jump to="faq">FAQ</Jump>
        </nav>
        <div className="nav__actions">
          <a href={X_URL} className="nav__x" target="_blank" rel="noopener noreferrer" aria-label="MARXY on X">
            <XIcon />
          </a>
          <button type="button" className="btn btn--small" onClick={open}>
            Connect Wallet
          </button>
        </div>
      </header>

      {/* HERO (interactive) */}
      <section className="hero" id="hero">
        <div className="hero__scene" id="scene">
          <div className="stage" id="stage">
            <video className="stage__media" poster="/assets/hero-poster.jpg" autoPlay muted loop playsInline preload="auto">
              <source src="/assets/hero.mp4" type="video/mp4" />
            </video>
            {/* Overlays positioned in % of the video frame (2560x960) */}
            <div className="core-glow" id="coreGlow" />
            {COINS.map((c, i) => (
              <button
                key={i}
                type="button"
                className="coin-hit"
                style={{ "--x": `${c.x}%`, "--y": `${c.y}%`, "--s": `${c.s}%` } as CSSProperties}
                data-name={c.name}
                data-sym={c.sym}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>
        <canvas className="particles" id="particles" />
        <div className="cursor-light" id="cursorLight" />
        <div className="coin-tip" id="coinTip" />
        <div className="hero__fade" />
        <div className="hero__content" id="heroContent">
          <h1 className="hero__title">
            Buy. Lock. Battle. <span>Win.</span>
          </h1>
          <p className="hero__sub">The last-bid crypto auction on Solana where the biggest wallet doesn&apos;t win. Strategy does.</p>
          <div className="hero__ctas">
            <button type="button" className="btn" onClick={open}>
              Connect Wallet
            </button>
            <Jump to="auctions" className="btn btn--ghost">
              See live auctions
            </Jump>
          </div>
        </div>
        <div className="scroll-hint">
          <span />
        </div>
      </section>

      {/* STORY */}
      <section className="section story" id="why">
        <p className="eyebrow reveal">Ancient Rome · The rudis</p>
        <h2 className="story__quote reveal">
          You fought with <span>what you brought.</span>
        </h2>
        <p className="section__sub reveal">
          Once the fight began, nobody could hand you a better weapon.
          <br />
          <b>Same rule. New arena.</b>
        </p>
        <div className="pillars">
          <div className="pillar reveal">
            <span>01</span>
            <h3>Limited resources</h3>
            <p>Everyone enters with a fixed number of credits. No reloading mid-fight.</p>
          </div>
          <div className="pillar reveal">
            <span>02</span>
            <h3>Timing</h3>
            <p>One bid resets the clock. The moment you choose matters more than how much you have.</p>
          </div>
          <div className="pillar reveal">
            <span>03</span>
            <h3>Strategy</h3>
            <p>Read the room, save your credits, strike last.</p>
          </div>
        </div>
      </section>

      {/* PROBLEM VS MARXY */}
      <section className="section" id="versus">
        <p className="eyebrow reveal">Why &quot;Marxy&quot;? Equality.</p>
        <h2 className="section__title reveal">
          Not how much you spend.
          <br />
          <span>When and how you use it.</span>
        </h2>
        <div className="versus">
          <div className="versus__col versus__col--old reveal">
            <small>Last-bid auctions today</small>
            <h3>The biggest wallet wins.</h3>
            <ul>
              <li>You can keep buying bids while the auction runs</li>
              <li>Whoever can spend the most outlasts everyone</li>
            </ul>
          </div>
          <div className="versus__vs reveal">VS</div>
          <div className="versus__col versus__col--new reveal">
            <small>Marxy</small>
            <h3>Once the gates close, strategy wins.</h3>
            <ul>
              <li>Buy credits before the start, then the gates lock</li>
              <li>Everyone has the same cap per auction</li>
            </ul>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <p className="eyebrow reveal">How it works</p>
        <h2 className="section__title reveal">
          Buy. Lock. Battle. <span>Win.</span>
        </h2>
        <ol className="flow flow--4">
          <li className="flow__step reveal">
            <Art name="credits" label="Credits" seed={1} />
            <b>01</b>
            <h3>Buy</h3>
            <p>Get credits in USDC before the start. Each credit is one bid, and every player has the same cap.</p>
          </li>
          <li className="flow__step reveal">
            <Art name="vault" label="Vault" seed={2} />
            <b>02</b>
            <h3>Lock</h3>
            <p>Gates close. No more credits. The battle starts 15 minutes later, so get ready.</p>
          </li>
          <li className="flow__step reveal">
            <Art name="battle" label="Battle" seed={3} />
            <b>03</b>
            <h3>Battle</h3>
            <p>Each bid costs one credit and resets the countdown timer.</p>
          </li>
          <li className="flow__step reveal">
            <Art name="winner" label="Winner" seed={4} />
            <b>04</b>
            <h3>Win</h3>
            <p>When the timer hits zero, the last bidder takes the prize straight to their wallet.</p>
          </li>
        </ol>
        <p className="note reveal">
          Target not reached? <b>Everyone gets their money back.</b>
        </p>
      </section>

      {/* BATTLE DEMO */}
      <section className="section battle-sec" id="battle">
        <div className="battle-sec__bg" aria-hidden="true">
          <video poster="/assets/img/arena.jpg" autoPlay muted loop playsInline preload="none">
            <source src="/assets/img/arena.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="battle-sec__text">
          <p className="eyebrow reveal">See it in action</p>
          <h2 className="section__title reveal">
            Every bid <span>resets the clock</span>
          </h2>
          <p className="section__sub reveal">This is a simulated battle. Watch the countdown: whoever bids last when it hits zero takes the lot.</p>
          <ul className="battle-sec__rules reveal">
            <li>1 bid = 1 credit</li>
            <li>Each bid resets the countdown</li>
            <li>You can&apos;t outbid yourself</li>
            <li>Timer hits zero → last bidder wins</li>
          </ul>
        </div>
        <div className="battle reveal" id="battleDemo">
          <div className="battle__head">
            <span className="battle__live">● LIVE</span>
            <span className="battle__lot">
              Lot: <b>10 SOL</b>
            </span>
            <span className="battle__speed">demo · 2× speed</span>
          </div>
          <div className="battle__ring">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="88" className="ring-bg" />
              <circle cx="100" cy="100" r="88" className="ring-fg" id="ringFg" />
            </svg>
            <div className="battle__time">
              <span id="battleTime">25</span>
              <small>seconds</small>
            </div>
          </div>
          <div className="battle__leader">
            Last bidder <b id="battleLeader">—</b>
          </div>
          <ul className="battle__feed" id="battleFeed" />
        </div>
      </section>

      {/* LIVE AUCTIONS */}
      <section className="section" id="auctions">
        <p className="eyebrow reveal">Live auctions</p>
        <h2 className="section__title reveal">
          Pick your <span>battle</span>
        </h2>
        <LandingAuctions />
      </section>

      {/* FAIR PLAY */}
      <section className="section" id="fair">
        <p className="eyebrow reveal">Why Solana? Verify, don&apos;t trust</p>
        <h2 className="section__title reveal">
          Nobody can <span>cheat.</span>
        </h2>
        <p className="section__sub reveal">Not the users. Not the rich. Not even us.</p>
        <div className="cards cards--3">
          {[
            ["⚙", "Smart contracts enforce the rules", "Caps, the lock and the countdown are code on Solana. Nobody can bend them, including Marxy."],
            ["◎", "Every credit tracked on-chain", "Every purchase and every bid is public and verifiable. Check it yourself."],
            ["🔒", "Prize held in escrow", "Your USDC and the prize sit in on-chain vaults until the battle is decided."],
            ["⚡", "Fast and cheap for every bid", "Solana confirms bids in moments for a fraction of a cent, so the countdown stays fair."],
            ["⚖", "Same cap for everyone", "No player can buy more than 10% of the prize's cost in credits. No whales."],
            ["↺", "Money back if the target isn't reached", "If an auction is cancelled for any reason, you get back 100% of what you paid."],
          ].map(([icon, title, body]) => (
            <article key={title} className="card reveal">
              <div className="card__icon">{icon}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* LOTS */}
      <section className="section" id="lots">
        <p className="eyebrow reveal">What you can win</p>
        <h2 className="section__title reveal">
          Real crypto, <span>real lots</span>
        </h2>
        <div className="lots">
          {[
            ["lot-btc", "BTC", "0.01 cbBTC", "Bitcoin on Solana"],
            ["lot-btc", "BTC", "0.1 cbBTC", "Bitcoin on Solana"],
            ["lot-sol", "SOL", "5 SOL", "Solana"],
            ["lot-sol", "SOL", "50 SOL", "Solana"],
          ].map(([art, label, title, sub], i) => (
            <div key={title} className="lot reveal">
              <Art name={art} label={label} className="art--sm" seed={i + 5} />
              <h3>{title}</h3>
              <span>{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="section section--narrow" id="faq">
        <p className="eyebrow reveal">FAQ</p>
        <h2 className="section__title reveal">
          Good <span>questions</span>
        </h2>
        <div className="faq">
          {[
            [
              "What if not enough credits are sold?",
              "The auction may be moved to a later date once. While it's postponed, you can keep your credits or take a full refund. If it still doesn't reach the minimum, it's cancelled and everyone is refunded in full.",
            ],
            [
              "What happens to credits I don't use?",
              "Credits only work in the auction you bought them for. After a won auction, unused credits are not refunded. Plan how many you buy and when you bid.",
            ],
            ["What if nobody bids?", "If no one places the first bid within the opening window after the battle starts, everyone gets a full refund."],
            ["What if I run out of credits?", "You can't bid anymore, but if you are the last bidder when the countdown ends, you still win."],
            ["Can I move credits to another auction?", "No. Credits belong to one auction and can't be transferred, sold or reused."],
            [
              "What do I pay with?",
              "Credits are paid in USDC on Solana. You also pay a tiny amount of SOL rent for your player record, which you get back when you withdraw.",
            ],
          ].map(([q, a]) => (
            <details key={q} className="reveal">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="section cta" id="cta">
        <Art name="winner" label="Winner" className="art--sm" seed={9} />
        <h2 className="section__title reveal">
          Once the gates close, <span>strategy wins.</span>
        </h2>
        <p className="hero__sub reveal">Buy. Lock. Battle. Win.</p>
        <div className="hero__ctas reveal">
          <button type="button" className="btn" onClick={open}>
            Connect Wallet
          </button>
          <a href={X_URL} className="btn btn--ghost" target="_blank" rel="noopener noreferrer">
            Follow @marxyfun
          </a>
        </div>
      </section>

      <footer className="footer">
        <img src="/assets/logo.png" alt="MARXY" height={22} style={{ height: 22, width: "auto" }} />
        <nav>
          <a href={X_URL} target="_blank" rel="noopener noreferrer">
            X / Twitter
          </a>
        </nav>
        <span>© 2026 MARXY</span>
      </footer>
    </div>
  );
}
