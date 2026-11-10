// Clair de Lune — visuals made only from moving circles.
//
// Click (or press, drag and release) on the canvas:
//   top third    -> fireworks burst at the press point
//   middle third -> ring of circles orbiting the press point
//   bottom third -> rising bloom circle from the press point
//
// Dragging before you release "throws" the gesture (see the Throw section):
//   fireworks -> the burst leans in the drag direction
//   orbit     -> the whole ring glides off in the drag direction
//   bloom     -> the circle drifts sideways as it rises
//
// Each gesture is an async "coroutine": it snapshots the slider values,
// then loops once per frame, writing its circles into a Map.
// draw() just reads those Maps and paints whatever is in them.
//
// Slider panel, drag-to-reorder and saving: controls.js
// BeatStep knobs (MIDI): midi.js

// Drawing coordinates: always 1280 wide. H is set by fitCanvas() so the canvas has the shape
// it will have in fullscreen on this screen (see Sizing & fullscreen).
const W = 1280;
let H = 720;

// ---------- Parameters ----------
//
// Every tweakable number lives here. Each group becomes a card of sliders.
// The first 4 sliders in a card are on the BeatStep knobs of that card's knob set:
//   set 1 = knobs 1-4, set 2 = knobs 5-8, set 3 = knobs 9-12, set 4 = knobs 13-16.
// Drag a slider by its ⋮⋮ handle to change which ones are on the knobs.
// With `npm run dev` the new order is saved to config.json.

const PARAM_GROUPS = [
  {
    id: "fireworks",
    title: "Fireworks — top third",
    knobSet: 1,
    params: [
      { key: "fwVelocity", label: "launch velocity", min: 40, max: 900, value: 150, step: 10 },
      { key: "fwSize", label: "circle size", min: 2, max: 40, value: 10, step: 1 },
      { key: "fwCount", label: "particles", min: 1, max: 40, value: 8, step: 1 },
      { key: "fwSpread", label: "fan spread ±°", min: 0, max: 180, value: 63, step: 1 },
      { key: "fwGravity", label: "gravity", min: 0, max: 1500, value: 300, step: 10 },
      { key: "fwDuration", label: "lifetime (s)", min: 0.5, max: 10, value: 3, step: 0.1 },
      { key: "fwTilt", label: "throw tilt °", min: 0, max: 90, value: 50, step: 1 },
      { key: "fwSpeedMin", label: "speed min ×", min: 0, max: 2, value: 0.5, step: 0.05 },
      { key: "fwSpeedMax", label: "speed max ×", min: 0, max: 2, value: 1.2, step: 0.05 },
      { key: "fwSizeJitter", label: "size variation ±", min: 0, max: 1, value: 0.2, step: 0.01 },
    ],
  },
  {
    id: "orbit",
    title: "Orbit — middle third",
    knobSet: 2,
    params: [
      { key: "orbitFadeIn", label: "fade in (s)", min: 0.1, max: 8, value: 2, step: 0.1 },
      { key: "orbitSpeed", label: "rotation speed", min: -3, max: 3, value: 0.6, step: 0.05 },
      { key: "orbitNoise", label: "circle ↔ noise", min: 0, max: 1, value: 0, step: 0.01 },
      { key: "orbitRadius", label: "radius", min: 20, max: 400, value: 160, step: 1 },
      { key: "orbitCount", label: "circles", min: 1, max: 80, value: 24, step: 1 },
      { key: "orbitSize", label: "circle size", min: 2, max: 80, value: 22, step: 1 },
      { key: "orbitHold", label: "hold (s)", min: 0, max: 20, value: 6, step: 0.1 },
      { key: "orbitFadeOut", label: "fade out (s)", min: 0.1, max: 10, value: 2, step: 0.1 },
      { key: "orbitStartRadius", label: "start radius ×", min: 0, max: 1, value: 0.5, step: 0.01 },
      { key: "orbitSpeedJitter", label: "speed variation ±", min: 0, max: 1, value: 0.25, step: 0.01 },
      { key: "orbitThrowSpeed", label: "throw speed", min: 0, max: 3000, value: 900, step: 10 },
      { key: "orbitFriction", label: "throw friction", min: 0.1, max: 6, value: 1.5, step: 0.1 },
      { key: "orbitWarpAmount", label: "warp amount ×r", min: 0, max: 6, value: 3, step: 0.1 },
      { key: "orbitWarpFreq", label: "warp frequency", min: 0.1, max: 3, value: 0.6, step: 0.05 },
      { key: "orbitWarpFold", label: "warp swirl", min: 0, max: 5, value: 1.5, step: 0.1 },
      { key: "orbitWarpDrift", label: "warp drift", min: 0, max: 0.1, value: 0.007, step: 0.001 },
    ],
  },
  {
    id: "bloom",
    title: "Bloom — bottom third",
    knobSet: 3,
    params: [
      { key: "bloomPower", label: "rise acceleration", min: 1, max: 4, value: 2, step: 0.1 },
      { key: "bloomDuration", label: "rise time (s)", min: 0.5, max: 15, value: 5, step: 0.1 },
      { key: "bloomWobble", label: "wobble (px)", min: 0, max: 400, value: 120, step: 1 },
      { key: "bloomLean", label: "throw lean (px)", min: 0, max: 800, value: 300, step: 10 },
      { key: "bloomStartSize", label: "start size", min: 0, max: 80, value: 6, step: 1 },
      { key: "bloomEndSize", label: "end size", min: 2, max: 300, value: 80, step: 1 },
      { key: "bloomAlpha", label: "opacity", min: 0, max: 255, value: 200, step: 1 },
      { key: "bloomFadeStart", label: "fade starts at", min: 0, max: 0.95, value: 0.5, step: 0.01 },
      { key: "bloomWobbleSpeed", label: "wobble speed", min: 0, max: 3, value: 0.5, step: 0.05 },
      { key: "bloomWobbleStretch", label: "wobble stretch", min: 0, max: 0.02, value: 0.004, step: 0.0005 },
      { key: "bloomOvershoot", label: "rise past top (px)", min: 0, max: 400, value: 100, step: 10 },
    ],
  },
  {
    id: "global",
    title: "Palette & throw",
    knobSet: 4,
    params: [
      // max is set to (number of palettes - 1) when the panel is built
      { key: "palette", label: "palette morph", min: 0, max: 3, value: 0, step: 0.01 },
      { key: "colorNoise", label: "color noise", min: 0, max: 80, value: 20, step: 1 },
      { key: "throwDrag", label: "full-throw drag (px)", min: 50, max: 1000, value: 300, step: 10 },
      { key: "heavyArea", label: "heavy touch area (px²)", min: 0, max: 15000, value: 8000, step: 50 },
    ],
  },
];

// One Map per layer. key = gesture id, value = { circles: [{x, y, d, alpha, seed}] }
const blooms = new Map();
const orbits = new Map();
const fireworks = new Map();

const nextFrame = () => new Promise(requestAnimationFrame);

let idCounter = 0;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(idCounter++));

// ---------- Palettes (background, light-touch circles, heavy-touch circles) ----------
//
// These are the defaults. Edit them live in the palette editor under the sliders;
// with `npm run dev` your edited palettes are saved to config.json and replace these.

const PALETTES = [
  { bg: [8, 10, 28], light: [190, 205, 255], heavy: [255, 210, 140] }, // moonlit night
  { bg: [28, 10, 38], light: [255, 185, 220], heavy: [255, 240, 170] }, // dusk rose
  { bg: [4, 30, 36], light: [165, 255, 225], heavy: [255, 150, 120] }, // deep water
  { bg: [238, 232, 216], light: [40, 52, 95], heavy: [190, 40, 40] }, // paper and ink
];

let pal = PALETTES[0]; // recomputed every frame from the palette slider

function lerpRGB(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Palette slider goes 0 .. PALETTES.length - 1; fractional values morph between neighbours.
function currentPalette() {
  const k = constrain(param("palette"), 0, PALETTES.length - 1);
  const i = floor(k);
  const j = min(i + 1, PALETTES.length - 1);
  const t = k - i;
  const a = PALETTES[i];
  const b = PALETTES[j];
  return { bg: lerpRGB(a.bg, b.bg, t), light: lerpRGB(a.light, b.light, t), heavy: lerpRGB(a.heavy, b.heavy, t) };
}

// Base color depends on the touch (light or heavy). Each circle has its own seed,
// so color noise gives every circle a slightly different shade of that base.
function circleColor(seed, alpha, heavy) {
  const base = heavy ? pal.heavy : pal.light;
  const amount = param("colorNoise");
  const r = base[0] + (noise(seed, 0) - 0.5) * 2 * amount;
  const g = base[1] + (noise(seed, 10) - 0.5) * 2 * amount;
  const b = base[2] + (noise(seed, 20) - 0.5) * 2 * amount;
  return [r, g, b, alpha];
}

// ---------- Throw: press, drag, release ----------
//
// Press on the canvas, drag, and let go: the drag becomes a "throw".
// A throw is a vector { x, y }:
//   - its direction is the drag direction
//   - its length is the strength, from 0 (a plain click) to 1 (a long drag)
// Gestures launch on release, so a plain click still works — it's just a throw of 0.

// One entry per finger (or mouse) currently pressed on the canvas.
// key = pointerId, value = { x, y, peakArea }: where the press started, and the biggest
// contact area (w × h, in CSS px²) the finger made during it.
const presses = new Map();

// Heavy vs light touch: pressing harder flattens the fingertip, so the contact patch gets bigger.
// The screen can't measure force, but it does report contact size (see touchdebug.js, key D).
// A mouse always reports 1 × 1, so mouse clicks are always light.
const isHeavy = (press) => press.peakArea >= param("heavyArea");

function throwFromDrag(startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const dragLength = sqrt(dx * dx + dy * dy);
  if (dragLength === 0) return { x: 0, y: 0 };

  const strength = min(dragLength / param("throwDrag"), 1); // throwDrag px of drag = full strength
  return { x: (dx / dragLength) * strength, y: (dy / dragLength) * strength };
}

// Distance travelled by something thrown at `speed` that slows down from friction.
// It starts fast, eases off, and comes to rest after travelling speed / friction pixels.
function glide(speed, friction, seconds) {
  return (speed / friction) * (1 - exp(-friction * seconds));
}

// ---------- Gesture: fireworks ----------

async function launchFireworks(x0, y0, throwVec, heavy) {
  // snapshot params for this gesture
  const baseVelocity = param("fwVelocity"); // pixels per second
  const baseSize = param("fwSize");
  const count = param("fwCount");
  const spread = radians(param("fwSpread")); // half-width of the upward fan
  const speedMin = param("fwSpeedMin");
  const speedMax = param("fwSpeedMax");
  const sizeJitter = param("fwSizeJitter");
  const duration = param("fwDuration") * 1000; // ms
  const gravity = param("fwGravity"); // pixels per second^2 — shared, so they all fall together

  // throw: dragging sideways tilts the whole fan that way
  const tilt = throwVec.x * radians(param("fwTilt"));

  const particles = [];
  for (let i = 0; i < count; i++) {
    // upward fan (screen y points down), centered on straight up plus the tilt
    const angle = -HALF_PI + tilt + random(-spread, spread);
    const speed = baseVelocity * random(speedMin, speedMax);
    particles.push({
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      d: baseSize * random(1 - sizeJitter, 1 + sizeJitter),
      seed: random(1000),
    });
  }

  const id = newId();
  const data = { heavy, circles: [] }; // heavy = drawn in the palette's heavy-touch color
  fireworks.set(id, data);

  const startTime = performance.now();
  let phase = 0;
  while (phase < 1) {
    phase = min((performance.now() - startTime) / duration, 1);
    const t = (phase * duration) / 1000; // seconds

    // parabola: p = p0 + v*t + 0.5*g*t^2
    data.circles = particles.map((p) => ({
      x: x0 + p.vx * t,
      y: y0 + p.vy * t + 0.5 * gravity * t * t,
      d: p.d,
      alpha: 255 * (1 - phase),
      seed: p.seed,
    }));
    await nextFrame();
  }
  fireworks.delete(id);
}

// ---------- Domain warp ----------

// Two-stage domain warp: noise offsets the lookup position of a second noise.
// Returns a smooth 2D displacement, roughly -0.5..0.5 on each axis.
//   freq: lower = broader, smoother bends
//   fold: how strongly the first stage bends the second (higher = swirlier)
function domainWarp(x, y, t, seed, freq, fold) {
  // p5 noise stacks 4 octaves by default — the upper octaves are what look jittery.
  // Use a single smooth octave here, then restore the default for everything else.
  noiseDetail(2, 0.5);
  const qx = noise(x * freq + seed, y * freq + seed, t) - 0.5;
  const qy = noise(x * freq + seed + 5.2, y * freq + seed + 1.3, t) - 0.5;
  const px = (x + fold * qx) * freq;
  const py = (y + fold * qy) * freq;
  const wx = noise(px + seed + 1.7, py + seed + 9.2, t) - 0.5;
  const wy = noise(px + seed + 8.3, py + seed + 2.8, t) - 0.5;
  noiseDetail(4, 0.5);
  return [wx, wy];
}

// ---------- Gesture: orbit around the center ----------

async function launchOrbit(x0, y0, throwVec, heavy) {
  const fadeIn = param("orbitFadeIn") * 1000; // ms
  const speedJitter = param("orbitSpeedJitter");
  const speed = param("orbitSpeed") * random(1 - speedJitter, 1 + speedJitter); // radians per second
  const noiseMix = param("orbitNoise"); // 0 = perfect circle, 1 = noise loop
  const count = param("orbitCount");
  const fullRadius = param("orbitRadius");
  const startRadius = param("orbitStartRadius"); // fraction of the full radius it grows from
  const fullSize = param("orbitSize");
  const hold = param("orbitHold") * 1000; // ms
  const fadeOut = param("orbitFadeOut") * 1000; // ms
  const duration = fadeIn + hold + fadeOut;

  const warpAmount = param("orbitWarpAmount") * fullRadius; // how far (pixels) the field can push a point
  const warpFreq = param("orbitWarpFreq");
  const warpFold = param("orbitWarpFold");
  const warpDrift = param("orbitWarpDrift"); // how fast the warp field changes, per second

  // throw: the whole ring glides off in the drag direction and slows to a stop
  const throwSpeed = param("orbitThrowSpeed"); // pixels per second at full strength
  const friction = param("orbitFriction"); // higher = stops sooner
  const vx = throwVec.x * throwSpeed;
  const vy = throwVec.y * throwSpeed;

  const startAngle = random(TWO_PI);
  const loopSeed = random(1000);
  const seeds = Array.from({ length: count }, () => random(1000));

  const id = newId();
  const data = { heavy, circles: [] }; // heavy = drawn in the palette's heavy-touch color
  orbits.set(id, data);

  const startTime = performance.now();
  let phase = 0;
  while (phase < 1) {
    const elapsed = performance.now() - startTime;
    phase = min(elapsed / duration, 1);

    // fade in = orbit radius grows to full while circles grow from 0 to full size
    const grow = 1 - pow(1 - constrain(elapsed / fadeIn, 0, 1), 3); // ease-out
    const radius = fullRadius * lerp(startRadius, 1, grow);
    const size = fullSize * grow;
    const alpha = elapsed > fadeIn + hold ? 255 * (1 - (elapsed - fadeIn - hold) / fadeOut) : 255;
    const rotation = startAngle + (speed * elapsed) / 1000;

    const seconds = elapsed / 1000;
    const cx = x0 + glide(vx, friction, seconds);
    const cy = y0 + glide(vy, friction, seconds);

    const t = seconds * warpDrift; // slow drift of the warp field

    data.circles = seeds.map((seed, i) => {
      const a = rotation + (i / count) * TWO_PI;
      // point on the plain circle, in units of the full radius
      const ux = (cos(a) * radius) / fullRadius;
      const uy = (sin(a) * radius) / fullRadius;
      // domain warp: push the point through a 2D noise field. The field is fixed in space,
      // so circles slide along one smooth warped loop as they rotate.
      const [wx, wy] = domainWarp(ux, uy, t, loopSeed, warpFreq, warpFold);
      const x = cos(a) * radius + wx * warpAmount * noiseMix;
      const y = sin(a) * radius + wy * warpAmount * noiseMix;
      return { x: cx + x, y: cy + y, d: size, alpha, seed };
    });
    await nextFrame();
  }
  orbits.delete(id);
}

// ---------- Gesture: rising bloom ----------

async function launchBloom(x0, y0, throwVec, heavy) {
  const power = param("bloomPower"); // 1 = constant speed, >1 = accelerates
  const duration = param("bloomDuration") * 1000; // ms
  const travel = y0 + param("bloomOvershoot"); // rise until just past the top edge
  const wobble = param("bloomWobble"); // pixels
  const wobbleSpeed = param("bloomWobbleSpeed"); // noise steps per second
  const wobbleStretch = param("bloomWobbleStretch"); // noise steps per pixel of rise
  const startSize = param("bloomStartSize");
  const endSize = param("bloomEndSize");
  const peakAlpha = param("bloomAlpha");
  const fadeStart = param("bloomFadeStart"); // fraction of the rise when fading begins
  const seed = random(1000);

  // throw: dragging sideways makes the circle drift that way as it rises
  const lean = throwVec.x * param("bloomLean"); // pixels of sideways drift over the whole rise

  const id = newId();
  const data = { heavy, circles: [] }; // heavy = drawn in the palette's heavy-touch color
  blooms.set(id, data);

  const startTime = performance.now();
  let phase = 0;
  while (phase < 1) {
    const elapsed = performance.now() - startTime;
    phase = min(elapsed / duration, 1);

    const y = y0 - travel * pow(phase, power);
    const wobbleX = (noise(seed, (elapsed / 1000) * wobbleSpeed + y * wobbleStretch) - 0.5) * wobble; // noise of time + y
    const x = x0 + wobbleX + lean * phase;
    const d = lerp(startSize, endSize, 1 - pow(1 - phase, 2));
    const alpha = phase < fadeStart ? peakAlpha : map(phase, fadeStart, 1, peakAlpha, 0);

    data.circles = [{ x, y, d, alpha, seed }];
    await nextFrame();
  }
  blooms.delete(id);
}

// ---------- p5 ----------

// p5 2.x waits for an async setup() to finish before it starts calling draw().
async function setup() {
  const canvas = createCanvas(W, H);
  describe("Circles on a dark background: fireworks, orbiting rings and rising blooms appear when you click.");

  await buildControls(PARAM_GROUPS, PALETTES, canvas.elt); // controls.js — sliders, knobs, palette editor
  setupPointers(canvas.elt);
  setupSizing();
}

// ---------- Sizing & fullscreen ----------
//
// Fullscreen (press F, or the "fullscreen" button) hides all the browser UI. The slider panel
// shrinks to a compact strip of just the knob-mapped sliders, and the canvas fills everything
// above it: full screen width x (screen height - strip height).
//
// The canvas keeps that same shape when not fullscreen, so what you see in the window is what
// you'll get in fullscreen. The sketch draws in W x H coordinates and draw() scales that up to
// the real canvas size, so the picture just gets bigger (and stays sharp).

function fitCanvas() {
  const fullscreen = !!document.fullscreenElement;
  document.body.classList.toggle("fullscreen", fullscreen);

  // measure the compact strip (what fullscreen shows), then put the panel back in the right mode
  const panel = document.getElementById("controls");
  panel.classList.add("compact");
  const stripHeight = panel.offsetHeight;
  panel.classList.toggle("compact", fullscreen);

  const aspect = screen.width / (screen.height - stripHeight); // the fullscreen canvas shape
  H = Math.round(W / aspect);

  const w = fullscreen
    ? window.innerWidth
    : Math.min(document.documentElement.clientWidth, window.innerHeight * aspect);
  resizeCanvas(Math.floor(w), Math.floor(w / aspect));
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}

function setupSizing() {
  window.addEventListener("resize", fitCanvas);
  document.addEventListener("fullscreenchange", fitCanvas);
  fitCanvas();
}

function keyPressed() {
  if (key === "f" || key === "F") toggleFullscreen();
}

// ---------- Multi-touch input ----------
//
// We use pointer events instead of p5's mouse functions so that every finger
// is tracked separately (each one has its own pointerId). Two fingers = two gestures.

// Convert a pointer event to canvas coordinates (works even if the canvas is scaled by CSS).
function canvasPoint(el, e) {
  const r = el.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

function setupPointers(el) {
  // Stop the browser from treating touches as scroll / pinch-zoom / right-click.
  el.style.touchAction = "none";
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  // Only presses that start on the canvas count (not presses on the sliders).
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // left mouse button only
    e.preventDefault();
    el.setPointerCapture(e.pointerId); // keep getting this finger's events even off the canvas
    presses.set(e.pointerId, { ...canvasPoint(el, e), peakArea: e.width * e.height });
  });

  // The contact patch keeps growing after the finger lands, so track its biggest size.
  el.addEventListener("pointermove", (e) => {
    const press = presses.get(e.pointerId);
    if (press) press.peakArea = max(press.peakArea, e.width * e.height);
  });

  // Release (anywhere, thanks to pointer capture) -> launch that finger's gesture.
  el.addEventListener("pointerup", (e) => {
    const press = presses.get(e.pointerId);
    if (!press) return; // this press didn't start on the canvas
    presses.delete(e.pointerId);

    const end = canvasPoint(el, e);
    const throwVec = throwFromDrag(press.x, press.y, end.x, end.y);
    launchGesture(press.x, press.y, throwVec, isHeavy(press));
  });

  // The OS took over this touch (e.g. a system gesture): just forget it.
  el.addEventListener("pointercancel", (e) => presses.delete(e.pointerId));
}

// Which gesture launches depends on where the press started.
function launchGesture(x, y, throwVec, heavy) {
  if (y < H / 3) {
    launchFireworks(x, y, throwVec, heavy);
  } else if (y < (2 * H) / 3) {
    launchOrbit(x, y, throwVec, heavy);
  } else {
    launchBloom(x, y, throwVec, heavy);
  }
}

function drawLayer(layer) {
  for (const gesture of layer.values()) {
    for (const c of gesture.circles) {
      fill(...circleColor(c.seed, c.alpha, gesture.heavy));
      circle(c.x, c.y, c.d);
    }
  }
}

function draw() {
  pal = currentPalette();
  background(...pal.bg);
  noStroke();
  scale(width / W); // draw in W x H coordinates whatever size the canvas is

  // draw order: blooms underneath, then orbits, fireworks on top
  drawLayer(blooms);
  drawLayer(orbits);
  drawLayer(fireworks);
}
