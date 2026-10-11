// Landing page motion, ported from marxy/main.js. `initLanding` wires everything
// to the elements under `root` and returns a cleanup that undoes all of it.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Cleanup = () => void;

export function initLanding(root: HTMLElement): Cleanup {
  const cleanups: Cleanup[] = [];
  const listen = <K extends keyof WindowEventMap>(
    target: Window | HTMLElement,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn as EventListener, opts);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };
  const loop = (fn: (t: number) => void) => {
    let id = 0;
    const step = (t: number) => {
      fn(t);
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    cleanups.push(() => cancelAnimationFrame(id));
  };
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const noHover = matchMedia("(hover: none)").matches;

  // Always start at the top so the hero intro plays from its first frame.
  ScrollTrigger.clearScrollMemory("manual");
  scrollTo(0, 0);
  listen(window, "load", () => ScrollTrigger.refresh());

  const ctx = gsap.context(() => {
    hero();
    reveals();
    battleDemo();
    if (!reduceMotion && !noHover) liveArt();
    nav();
  }, root);
  cleanups.push(() => ctx.revert());

  function hero() {
    const heroEl = $("#hero");
    const stage = $("#stage");
    const coreGlow = $("#coreGlow");
    const cursorLight = $("#cursorLight");
    const coinTip = $("#coinTip");

    /* Mouse parallax + 3D tilt */
    const tiltX = gsap.quickTo(stage, "rotationX", { duration: 1.2, ease: "power3.out" });
    const tiltY = gsap.quickTo(stage, "rotationY", { duration: 1.2, ease: "power3.out" });
    const moveX = gsap.quickTo(stage, "x", { duration: 1.4, ease: "power3.out" });
    const moveY = gsap.quickTo(stage, "y", { duration: 1.4, ease: "power3.out" });
    const lightX = gsap.quickTo(cursorLight, "x", { duration: 0.35, ease: "power3.out" });
    const lightY = gsap.quickTo(cursorLight, "y", { duration: 0.35, ease: "power3.out" });
    const mouse = { x: -9999, y: -9999 };

    function parallax(nx: number, ny: number) {
      if (reduceMotion) return;
      tiltY(nx * 4);
      tiltX(-ny * 3);
      moveX(-nx * 16);
      moveY(-ny * 10);
    }

    listen(heroEl, "pointermove", (e) => {
      const r = heroEl.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      parallax((mouse.x / r.width) * 2 - 1, (mouse.y / r.height) * 2 - 1);
      lightX(mouse.x);
      lightY(mouse.y);
      // Logo core glows brighter as the cursor gets closer
      const g = coreGlow.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (g.left + g.width / 2), e.clientY - (g.top + g.height / 2));
      coreGlow.style.setProperty("--boost", Math.max(0, 1 - d / 450).toFixed(2));
    });
    listen(heroEl, "pointerleave", () => {
      mouse.x = mouse.y = -9999;
      parallax(0, 0);
      coreGlow.style.setProperty("--boost", "0");
    });
    // Phone tilt (Android; iOS needs a permission prompt, so it is skipped there)
    listen(window, "deviceorientation", (e) => {
      if (e.gamma == null || e.beta == null) return;
      parallax(gsap.utils.clamp(-1, 1, e.gamma / 25), gsap.utils.clamp(-1, 1, (e.beta - 45) / 25));
    });

    /* Coin tooltips */
    root.querySelectorAll<HTMLElement>(".coin-hit").forEach((coin) => {
      listen(coin, "pointerenter", () => {
        coinTip.replaceChildren(coin.dataset.name ?? "", Object.assign(document.createElement("b"), { textContent: coin.dataset.sym }));
        coinTip.classList.add("show");
      });
      listen(coin, "pointermove", (e) => {
        coinTip.style.left = `${e.clientX}px`;
        coinTip.style.top = `${e.clientY}px`;
      });
      listen(coin, "pointerleave", () => coinTip.classList.remove("show"));
    });
    listen(window, "scroll", () => coinTip.classList.remove("show"), { passive: true });

    /* Particles */
    const canvas = $<HTMLCanvasElement>("#particles");
    const c = canvas.getContext("2d")!;
    let W = 0, H = 0;
    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; tw: number };
    let particles: P[] = [];
    const spawn = (anywhere: boolean): P => ({
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 10,
      r: Math.random() * 1.8 + 0.4,
      vy: Math.random() * 0.45 + 0.15,
      vx: (Math.random() - 0.5) * 0.15,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * Math.PI * 2,
    });
    function resize() {
      const dpr = Math.min(devicePixelRatio, 2);
      W = heroEl.clientWidth;
      H = heroEl.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, (W * H) / 14000));
      particles = Array.from({ length: count }, () => spawn(true));
    }
    resize();
    listen(window, "resize", resize);
    if (!reduceMotion)
      loop(() => {
        c.clearRect(0, 0, W, H);
        for (const p of particles) {
          // Push particles away from the cursor
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 120) {
            const f = (120 - dist) / 120;
            p.x += (dx / dist) * f * 3;
            p.y += (dy / dist) * f * 3;
          }
          p.y -= p.vy;
          p.x += p.vx;
          p.tw += 0.03;
          if (p.y < -10 || p.x < -10 || p.x > W + 10) Object.assign(p, spawn(false));
          c.beginPath();
          c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          c.fillStyle = `rgba(190, 255, 80, ${p.a * (0.6 + Math.sin(p.tw) * 0.4)})`;
          c.shadowColor = "#b8ff3c";
          c.shadowBlur = 8;
          c.fill();
        }
      });

    /* Intro */
    gsap.from(stage, { scale: 1.12, opacity: 0, duration: 2.2, ease: "power3.out" });
    gsap.from("#heroContent > *", { y: 30, opacity: 0, duration: 1, stagger: 0.15, delay: 0.8, ease: "power3.out" });
    gsap.from(".nav", { y: -20, opacity: 0, duration: 1, delay: 1.2 });

    /* Scroll: fly into the gateway */
    gsap
      .timeline({ scrollTrigger: { trigger: heroEl, start: "top top", end: "bottom top", scrub: true } })
      .to("#scene", { scale: 1.6, transformOrigin: "50% 35%", ease: "none" }, 0)
      .to("#heroContent", { y: -80, opacity: 0, ease: "none" }, 0)
      .to(".scroll-hint", { opacity: 0, ease: "none" }, 0);
  }

  function reveals() {
    gsap.utils.toArray<HTMLElement>(".reveal", root).forEach((el) => {
      gsap.from(el, { y: 40, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
    });
  }

  /* Battle demo (simulated, 2x speed) */
  function battleDemo() {
    const battleEl = $("#battleDemo");
    const ringFg = $<SVGCircleElement>("#ringFg");
    const timeEl = $("#battleTime");
    const leaderEl = $("#battleLeader");
    const feedEl = $("#battleFeed");
    const COUNTDOWN = 25, SPEED = 2;
    const RING = 2 * Math.PI * 88;
    ringFg.style.strokeDasharray = String(RING);

    const WALLETS = ["7xK…f3Q", "9pL…a1M", "3Fz…Qw8", "Bv2…k7T", "Hn5…Yc4", "Dq8…m2R"];
    let remaining = COUNTDOWN, leader: string | null = null, bidsLeft = 0, nextBidIn = 0, wonAt = 0;

    function resetBattle() {
      remaining = COUNTDOWN;
      leader = null;
      wonAt = 0;
      bidsLeft = 7 + Math.floor(Math.random() * 6);
      nextBidIn = 2 + Math.random() * 4;
      feedEl.replaceChildren();
      leaderEl.textContent = "—";
      battleEl.classList.remove("is-won", "is-low");
    }

    function placeBid() {
      let w: string;
      do w = WALLETS[Math.floor(Math.random() * WALLETS.length)];
      while (w === leader); // no self-bids
      leader = w;
      remaining = COUNTDOWN;
      bidsLeft--;
      leaderEl.textContent = w;
      const li = document.createElement("li");
      li.append(Object.assign(document.createElement("b"), { textContent: w }), Object.assign(document.createElement("span"), { textContent: "bid · −1 credit" }));
      feedEl.prepend(li);
      gsap.from(li, { y: -14, opacity: 0, duration: 0.35, ease: "power2.out" });
      while (feedEl.children.length > 5) feedEl.lastElementChild!.remove();
      gsap.fromTo(".battle__time span", { scale: 1.25 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
    }

    let lastT = performance.now();
    resetBattle();
    loop((t) => {
      const dt = Math.max(0, Math.min(0.1, (t - lastT) / 1000)) * SPEED;
      lastT = t;
      if (wonAt) {
        if (t - wonAt > 4000) resetBattle();
      } else {
        remaining = Math.max(0, remaining - dt);
        if (bidsLeft > 0) {
          nextBidIn -= dt;
          // Bids get more nervous as the clock runs down
          if (nextBidIn <= 0 || remaining < 3 + Math.random() * 2) {
            if (leader === null || remaining < COUNTDOWN - 1) placeBid();
            nextBidIn = 2 + Math.random() * 10;
          }
        }
        if (remaining <= 0 && leader) {
          wonAt = t;
          battleEl.classList.add("is-won");
          leaderEl.textContent = `${leader} wins 10 SOL 🏆`;
        }
      }
      timeEl.textContent = String(Math.ceil(remaining));
      ringFg.style.strokeDashoffset = String(RING * (1 - remaining / COUNTDOWN));
      battleEl.classList.toggle("is-low", remaining < 6 && !wonAt);
    });
  }

  /* Interactive art: every art on screen leans toward the cursor; the hovered card tilts the most.
     Arts are looked up lazily so auction cards that load later join in. */
  function liveArt() {
    type Q = Record<"rx" | "ry" | "x" | "y" | "sc", (v: number) => void>;
    const quick = new WeakMap<HTMLElement, Q>();
    const ZONE = ".auction, .lot, .flow__step, .cta";

    function qOf(art: HTMLElement): Q {
      let q = quick.get(art);
      if (!q) {
        const inner = art.querySelector<HTMLElement>(".art__inner")!;
        gsap.set(inner, { transformPerspective: 700 });
        q = {
          rx: gsap.quickTo(inner, "rotationX", { duration: 0.9, ease: "power3.out" }),
          ry: gsap.quickTo(inner, "rotationY", { duration: 0.9, ease: "power3.out" }),
          x: gsap.quickTo(inner, "x", { duration: 1.1, ease: "power3.out" }),
          y: gsap.quickTo(inner, "y", { duration: 1.1, ease: "power3.out" }),
          sc: gsap.quickTo(inner, "scale", { duration: 0.6, ease: "power3.out" }),
        };
        quick.set(art, q);
      }
      return q;
    }

    let px = innerWidth / 2, py = innerHeight / 2, queued = false;
    function update() {
      queued = false;
      root.querySelectorAll<HTMLElement>(".art.is-live").forEach((art) => {
        const r = art.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const q = qOf(art);
        const hover = Boolean((art.closest(ZONE) ?? art).matches(":hover"));
        art.classList.toggle("is-hover", hover);
        q.sc(hover ? 1.14 : 1.06); // small base zoom so tilted edges always stay hidden
        const dx = px - (r.left + r.width / 2);
        const dy = py - (r.top + r.height / 2);
        if (hover) {
          const nx = gsap.utils.clamp(-1, 1, dx / (r.width / 2));
          const ny = gsap.utils.clamp(-1, 1, dy / (r.height / 2));
          q.ry(nx * 8);
          q.rx(-ny * 8);
          q.x(nx * 6);
          q.y(ny * 6);
        } else {
          const k = Math.max(0, 1 - Math.hypot(dx, dy) / (innerWidth * 0.9)); // 1 near, 0 far
          const nx = gsap.utils.clamp(-1, 1, dx / (innerWidth / 2));
          const ny = gsap.utils.clamp(-1, 1, dy / (innerHeight / 2));
          q.ry(nx * 14 * k);
          q.rx(-ny * 10 * k);
          q.x(nx * 18 * k);
          q.y(ny * 12 * k);
        }
      });
    }
    const schedule = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    };
    listen(window, "pointermove", (e) => {
      px = e.clientX;
      py = e.clientY;
      schedule();
    }, { passive: true });
    listen(window, "scroll", schedule, { passive: true });
  }

  /* Nav background after scrolling past the top */
  function nav() {
    const navEl = $(".nav");
    const updateNav = () => navEl.classList.toggle("is-scrolled", scrollY > 40);
    listen(window, "scroll", updateNav, { passive: true });
    updateNav();
  }

  return () => cleanups.reverse().forEach((fn) => fn());
}
