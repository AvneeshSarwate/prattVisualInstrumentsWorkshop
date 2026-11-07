// Clair de Lune — visuals made only from moving circles.
//
// Click the canvas:
//   top third    -> fireworks burst at the click point
//   middle third -> ring of circles orbiting the click point
//   bottom third -> rising bloom circles from the click point
//
// Each gesture is an async "coroutine": it snapshots the slider values,
// then loops once per frame, writing its circles into a Map.
// draw() just reads those Maps and paints whatever is in them.

const W = 1280;
const H = 720;

// One Map per layer. key = gesture id, value = { circles: [{x, y, d, alpha, seed}] }
const blooms = new Map();
const orbits = new Map();
const fireworks = new Map();

const nextFrame = () => new Promise(requestAnimationFrame);

let idCounter = 0;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(idCounter++));

// ---------- Palettes (background vs circles) ----------

const PALETTES = [
  { bg: [8, 10, 28], fg: [190, 205, 255] }, // moonlit night
  { bg: [28, 10, 38], fg: [255, 185, 220] }, // dusk rose
  { bg: [4, 30, 36], fg: [165, 255, 225] }, // deep water
  { bg: [238, 232, 216], fg: [40, 52, 95] }, // paper and ink
];

let pal = PALETTES[0]; // recomputed every frame from the palette slider

function lerpRGB(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Palette slider goes 0 .. PALETTES.length - 1; fractional values morph between neighbours.
function currentPalette() {
  const k = param("palette");
  const i = floor(k);
  const j = min(i + 1, PALETTES.length - 1);
  const t = k - i;
  return { bg: lerpRGB(PALETTES[i].bg, PALETTES[j].bg, t), fg: lerpRGB(PALETTES[i].fg, PALETTES[j].fg, t) };
}

// Each circle has its own seed, so color noise gives every circle a slightly different shade.
function circleColor(seed, alpha) {
  const amount = param("colorNoise");
  const r = pal.fg[0] + (noise(seed, 0) - 0.5) * 2 * amount;
  const g = pal.fg[1] + (noise(seed, 10) - 0.5) * 2 * amount;
  const b = pal.fg[2] + (noise(seed, 20) - 0.5) * 2 * amount;
  return [r, g, b, alpha];
}

// ---------- Sliders ----------

const params = {};
const param = (key) => params[key].value();

function addGroup(title) {
  const group = createDiv().parent("controls").addClass("group");
  createElement("h3", title).parent(group);
  return group;
}

function addSlider(group, key, label, minVal, maxVal, value, step) {
  const row = createDiv().parent(group).addClass("row");
  createSpan(label).parent(row);
  const slider = createSlider(minVal, maxVal, value, step).parent(row);
  const readout = createSpan(String(value)).parent(row).addClass("value");
  slider.input(() => readout.html(slider.value()));
  params[key] = slider;
}

// ---------- Gesture: fireworks ----------

async function launchFireworks(x0, y0) {
  // snapshot params for this gesture
  const baseVelocity = param("fwVelocity"); // pixels per second
  const baseSize = param("fwSize");
  const count = 8;
  const duration = 3000; // ms
  const gravity = 300; // pixels per second^2 — shared, so they all fall together

  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = random(-PI * 0.85, -PI * 0.15); // upward fan (screen y points down)
    const speed = baseVelocity * random(0.5, 1.2);
    particles.push({
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      d: baseSize * random(0.8, 1.2),
      seed: random(1000),
    });
  }

  const id = newId();
  const data = { circles: [] };
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
function domainWarp(x, y, t, seed) {
  const freq = 0.6; // lower = broader, smoother bends
  const fold = 1.5; // how strongly the first stage bends the second (higher = swirlier)
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

async function launchOrbit(cx, cy) {
  const fadeIn = param("orbitFadeIn") * 1000; // ms
  const speed = param("orbitSpeed") * random(0.75, 1.25); // radians per second, ±25% per orbit
  const noiseMix = param("orbitNoise"); // 0 = perfect circle, 1 = noise loop
  const count = 24;
  const fullRadius = 160;
  const fullSize = 22;
  const hold = 6000; // ms
  const fadeOut = 2000; // ms
  const duration = fadeIn + hold + fadeOut;

  const startAngle = random(TWO_PI);
  const loopSeed = random(1000);
  const seeds = Array.from({ length: count }, () => random(1000));

  const id = newId();
  const data = { circles: [] };
  orbits.set(id, data);

  const startTime = performance.now();
  let phase = 0;
  while (phase < 1) {
    const elapsed = performance.now() - startTime;
    phase = min(elapsed / duration, 1);

    // fade in = orbit radius grows from half to full while circles grow from 0 to full size
    const grow = 1 - pow(1 - constrain(elapsed / fadeIn, 0, 1), 3); // ease-out
    const radius = fullRadius * lerp(0.5, 1, grow);
    const size = fullSize * grow;
    const alpha = elapsed > fadeIn + hold ? 255 * (1 - (elapsed - fadeIn - hold) / fadeOut) : 255;
    const rotation = startAngle + (speed * elapsed) / 1000;

    const t = elapsed / 150000; // slow drift of the warp field

    data.circles = seeds.map((seed, i) => {
      const a = rotation + (i / count) * TWO_PI;
      // point on the plain circle, in units of the full radius
      const ux = (cos(a) * radius) / fullRadius;
      const uy = (sin(a) * radius) / fullRadius;
      // domain warp: push the point through a 2D noise field. The field is fixed in space,
      // so circles slide along one smooth warped loop as they rotate.
      const [wx, wy] = domainWarp(ux, uy, t, loopSeed);
      const warpAmount = 3 * fullRadius; // how far (pixels) the field can push a point
      const x = cos(a) * radius + wx * warpAmount * noiseMix;
      const y = sin(a) * radius + wy * warpAmount * noiseMix;
      return { x: cx + x, y: cy + y, d: size, alpha, seed };
    });
    await nextFrame();
  }
  orbits.delete(id);
}

// ---------- Gesture: rising bloom ----------

async function launchBloom(x0, y0) {
  const power = param("bloomPower"); // 1 = constant speed, >1 = accelerates
  const duration = 5000; // ms
  const travel = y0 + 100; // rise until just past the top edge
  const wobble = 120; // pixels
  const seed = random(1000);

  const id = newId();
  const data = { circles: [] };
  blooms.set(id, data);

  const startTime = performance.now();
  let phase = 0;
  while (phase < 1) {
    const elapsed = performance.now() - startTime;
    phase = min(elapsed / duration, 1);

    const y = y0 - travel * pow(phase, power);
    const x = x0 + (noise(seed, elapsed / 2000 + y * 0.004) - 0.5) * wobble; // noise of time + y
    const d = lerp(6, 80, 1 - pow(1 - phase, 2));
    const alpha = phase < 0.5 ? 200 : map(phase, 0.5, 1, 200, 0);

    data.circles = [{ x, y, d, alpha, seed }];
    await nextFrame();
  }
  blooms.delete(id);
}

// ---------- p5 ----------

function setup() {
  const canvas = createCanvas(W, H);
  describe("Circles on a dark background: fireworks, orbiting rings and rising blooms appear when you click.");

  createDiv().id("controls");

  const fw = addGroup("Fireworks — top third");
  addSlider(fw, "fwVelocity", "launch velocity", 40, 900, 150, 10);
  addSlider(fw, "fwSize", "circle size", 2, 40, 10, 1);

  const orb = addGroup("Orbit — middle third");
  addSlider(orb, "orbitFadeIn", "fade in (s)", 0.1, 8, 2, 0.1);
  addSlider(orb, "orbitSpeed", "rotation speed", -3, 3, 0.6, 0.05);
  addSlider(orb, "orbitNoise", "circle ↔ noise", 0, 1, 0, 0.01);

  const bl = addGroup("Bloom — bottom third");
  addSlider(bl, "bloomPower", "rise acceleration", 1, 4, 2, 0.1);

  const pl = addGroup("Palette");
  addSlider(pl, "palette", "palette morph", 0, PALETTES.length - 1, 0, 0.01);
  addSlider(pl, "colorNoise", "color noise", 0, 80, 20, 1);

  canvas.mousePressed(() => {
    if (mouseY < H / 3) {
      launchFireworks(mouseX, mouseY);
    } else if (mouseY < (2 * H) / 3) {
      launchOrbit(mouseX, mouseY);
    } else {
      launchBloom(mouseX, mouseY);
    }
  });
}

function drawLayer(layer) {
  for (const gesture of layer.values()) {
    for (const c of gesture.circles) {
      fill(...circleColor(c.seed, c.alpha));
      circle(c.x, c.y, c.d);
    }
  }
}

function draw() {
  pal = currentPalette();
  background(...pal.bg);
  noStroke();

  // draw order: blooms underneath, then orbits, fireworks on top
  drawLayer(blooms);
  drawLayer(orbits);
  drawLayer(fireworks);
}
