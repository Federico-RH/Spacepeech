// lab/plugins/dino-engine.js
// Motor puro del juego del dinosaurio (sin DOM): física, obstáculos, nubes, puntaje y colisiones.
// Unidades: píxeles y segundos. `y` es la altura sobre el suelo (0 = apoyado).

export const WORLD = {
  W: 640, H: 180,
  dinoX: 48, dinoW: 40, dinoH: 44,
  gravity: 2300, jumpV: 650, fastFall: 900,
  baseSpeed: 260, maxSpeed: 620, speedPerPoint: 0.55,
  slots: 3,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed = 1, hi = 0) {
  return {
    phase: "ready", // ready | running | over
    t: 0, y: 0, vy: 0, speed: WORLD.baseSpeed, dist: 0, score: 0, hi,
    groundX: 0, frame: 0,
    obstacles: [], // { slot, x, w, h }
    clouds: [{ x: 420, y: 120 }, { x: 150, y: 140 }],
    rng: mulberry32(seed), overAt: 0,
  };
}

export const onGround = (s) => s.y <= 0;

/** Salto: empieza la partida, salta si está en el suelo o reinicia tras perder. Devuelve la acción tomada. */
export function jump(s, seed) {
  if (s.phase === "ready") { s.phase = "running"; s.vy = WORLD.jumpV; s.y = 0.01; return "start"; }
  if (s.phase === "over") {
    if (s.t - s.overAt < 0.35) return "wait"; // evita reiniciar con el mismo toque que perdió
    const hi = s.hi;
    Object.assign(s, createState(seed ?? Math.floor(s.rng() * 1e9), hi), { phase: "running", vy: WORLD.jumpV, y: 0.01 });
    return "restart";
  }
  if (onGround(s)) { s.vy = WORLD.jumpV; s.y = 0.01; return "jump"; }
  return "air";
}

export function fastFall(s) { if (s.phase === "running" && !onGround(s) && s.vy > -WORLD.fastFall) s.vy = -WORLD.fastFall; }

function spawn(s) {
  const used = new Set(s.obstacles.map((o) => o.slot));
  const slot = [...Array(WORLD.slots).keys()].find((i) => !used.has(i));
  if (slot === undefined) return;
  const kind = s.rng();
  const o = kind < 0.45 ? { w: 20, h: 36 } : kind < 0.8 ? { w: 26, h: 48 } : { w: 46, h: 34 }; // chico, alto, doble
  s.obstacles.push({ slot, x: WORLD.W + 10, ...o });
}

function collides(s) {
  const dx0 = WORLD.dinoX + 6;
  const dx1 = WORLD.dinoX + WORLD.dinoW - 8;
  const dy1 = s.y + WORLD.dinoH - 6; // el borde inferior es la altura sobre el suelo
  return s.obstacles.some((o) => o.x + 3 < dx1 && o.x + o.w - 3 > dx0 && s.y < o.h - 2 && dy1 > 0);
}

/** Avanza la simulación dt segundos. */
export function step(s, dt) {
  s.t += dt;
  if (s.phase !== "running") return s;

  // física del dinosaurio
  if (s.y > 0 || s.vy > 0) {
    s.vy -= WORLD.gravity * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) { s.y = 0; s.vy = 0; }
  }

  // velocidad y puntaje
  s.speed = Math.min(WORLD.maxSpeed, WORLD.baseSpeed + s.score * WORLD.speedPerPoint);
  s.dist += s.speed * dt;
  s.score = Math.floor(s.dist / 12);
  s.groundX = (s.groundX + s.speed * dt) % 24;
  s.frame = Math.floor(s.t * 9) % 2;

  // obstáculos
  for (const o of s.obstacles) o.x -= s.speed * dt;
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > -10);
  const last = s.obstacles.reduce((m, o) => Math.max(m, o.x + o.w), 0);
  const minGap = s.speed * 0.75 + 120;
  if (!s.nextGap) s.nextGap = minGap * (1 + s.rng() * 0.8);
  if (WORLD.W - last >= s.nextGap) { spawn(s); s.nextGap = minGap * (1 + s.rng() * 0.8); }

  // nubes (parallax lento)
  for (const c of s.clouds) { c.x -= s.speed * 0.12 * dt; if (c.x < -60) { c.x = WORLD.W + 20 + s.rng() * 120; c.y = 100 + s.rng() * 50; } }

  if (collides(s)) { s.phase = "over"; s.overAt = s.t; if (s.score > s.hi) s.hi = s.score; }
  return s;
}

export const pad = (n, len = 5) => String(Math.max(0, Math.floor(n))).padStart(len, "0");
