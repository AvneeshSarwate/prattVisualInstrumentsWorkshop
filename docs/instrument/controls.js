// Slider panel + palette editor.
//
// - One card per parameter group (PARAM_GROUPS in sketch.js).
// - Drag a slider by its ⋮⋮ handle to reorder it within its card.
// - The first 4 sliders of each card follow the 4 BeatStep knobs of that card's knob set.
// - Double-click a slider's name to reset it to its default.
//
// Base vs live values:
//   base = the slider. This is what gets saved.
//   live = what the sketch actually uses. Knobs nudge the live value (the bar under the slider);
//          moving the slider sets the base and snaps live back to it.
//   Only the 4 knob-mapped sliders can have live ≠ base; a slider dragged out of those 4
//   snaps back to its base.
//
// Autosave: every 5 s, if anything changed, base values, slider order, knob CCs and palettes
// are sent to the dev server (npm run dev), which writes them to config.json.

const KNOBS_PER_SET = 4;
const KNOB_COUNT = 16;
const KNOB_TICKS_FULL_RANGE = 100; // knob ticks to sweep a slider end to end — lower = more sensitive
const AUTOSAVE_MS = 5000;
// Saving needs the dev server (npm run dev), which only listens on this machine.
// On the deployed static site (GitHub Pages) changes just last until reload.
const CAN_SAVE = ["localhost", "127.0.0.1"].includes(location.hostname);

// key -> { def, base, live, setBase(v), setLive(v), ... }. param(key) is what the sketch calls.
const params = {};
const param = (key) => params[key].live;

let palettes = []; // the PALETTES array from sketch.js — the editor changes it in place
let knobCCs = DEFAULT_KNOB_CCS.slice();
const rowsBySet = new Map(); // knobSet -> the .rows element of that card
let learning = null; // while learning knobs: the CCs heard so far, in order
const ui = {}; // status bar + palette editor elements

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Build ----------

async function buildControls(groups, paletteList, canvasEl) {
  palettes = paletteList;
  const config = await loadConfig();
  if (Array.isArray(config.knobCCs) && config.knobCCs.length === KNOB_COUNT) knobCCs = config.knobCCs;
  const savedPalettes = (config.palettes ?? []).map(paletteFromHex).filter(Boolean);
  if (savedPalettes.length) palettes.splice(0, palettes.length, ...savedPalettes);

  // the palette morph slider spans however many palettes there are
  groups.flatMap((g) => g.params).find((p) => p.key === "palette").max = palettes.length - 1;

  const panel = el("div");
  panel.id = "controls";
  canvasEl.after(panel);

  const bar = el("div", "bar");
  ui.devices = el("span", "devices", "MIDI: connecting…");
  ui.last = el("span", "last", "turn a knob");
  ui.learn = el("button", "button", "learn knobs");
  ui.learn.addEventListener("click", toggleLearn);
  ui.note = el("span", "note");
  const fullscreenBtn = el("button", "button", "fullscreen (F)");
  fullscreenBtn.addEventListener("click", toggleFullscreen);
  bar.append(ui.devices, ui.last, ui.learn, fullscreenBtn, ui.note);

  // the status bar is hidden in fullscreen, so this small corner button gets you out without a keyboard
  const exitBtn = el("button", "exit-fullscreen", "✕");
  exitBtn.title = "exit fullscreen";
  exitBtn.addEventListener("click", toggleFullscreen);

  const grid = el("div", "groups");
  for (const group of groups) grid.append(buildGroup(group, config.order?.[group.id] ?? [], config.values ?? {}));

  panel.append(bar, grid, buildPaletteEditor(), exitBtn);

  setupMidi(handleCC, (names, error) => {
    ui.devices.textContent = error ?? (names.length ? `MIDI: ${names.join(", ")}` : "MIDI: no devices connected");
    ui.devices.classList.toggle("ok", !error && names.length > 0);
  });
  setupAutosave();
}

function buildGroup(group, savedOrder, savedValues) {
  const card = el("section", "group");
  const firstKnob = (group.knobSet - 1) * KNOBS_PER_SET + 1;
  const title = el("h3");
  title.append(el("span", null, group.title), el("span", "knobs", `knobs ${firstKnob}–${firstKnob + KNOBS_PER_SET - 1}`));

  // saved order first (skipping params that no longer exist), then any new params in definition order
  const byKey = new Map(group.params.map((p) => [p.key, p]));
  const keys = [
    ...savedOrder.filter((k) => byKey.has(k)),
    ...group.params.map((p) => p.key).filter((k) => !savedOrder.includes(k)),
  ];

  const rows = el("div", "rows");
  rows.dataset.group = group.id;
  rows.dataset.knobSet = group.knobSet;
  for (const key of keys) rows.append(buildRow(byKey.get(key), savedValues[key]));
  rowsBySet.set(group.knobSet, rows);
  refreshRows(rows);

  card.append(title, rows);
  return card;
}

function buildRow(def, savedBase) {
  const row = el("div", "row");
  row.dataset.key = def.key;

  const handle = el("span", "handle", "⋮⋮");
  handle.title = "drag to reorder";
  const badge = el("span", "badge");
  const label = el("span", "label", def.label);
  label.title = `${def.label} — double-click to reset`;

  // the slider (base value), with the live-value bar right under it
  const track = el("div", "track");
  const input = el("input");
  Object.assign(input, { type: "range", min: def.min, max: def.max, step: def.step });
  const liveBar = el("div", "live");
  const liveFill = el("div", "fill");
  liveBar.append(liveFill);
  track.append(input, liveBar);

  const readout = el("span", "value"); // shows the live value
  const decimals = (String(def.step).split(".")[1] ?? "").length;
  const clamp = (v) => Math.min(def.max, Math.max(def.min, v));

  const p = {
    def,
    row,
    readout,
    base: def.value,
    live: def.value,
    setLive(v) {
      p.live = clamp(v);
      const span = def.max - def.min;
      liveFill.style.width = `${span > 0 ? ((p.live - def.min) / span) * 100 : 0}%`;
      readout.textContent = p.live.toFixed(decimals);
      row.classList.toggle("offbase", p.live !== p.base);
    },
    setBase(v, save = true) {
      p.base = clamp(v);
      input.value = p.base;
      p.setLive(p.base);
      if (save) markDirty();
    },
    setMax(max) {
      def.max = max;
      input.max = max;
      p.setBase(p.base);
    },
  };
  input.addEventListener("input", () => p.setBase(Number(input.value)));
  label.addEventListener("dblclick", () => p.setBase(def.value));
  p.setBase(typeof savedBase === "number" ? savedBase : def.value, false);
  params[def.key] = p;

  makeDraggable(row, handle, (rows, done) => (done ? markDirty() : refreshRows(rows)));
  row.append(handle, badge, label, track, readout);
  return row;
}

// After any reorder: K-numbers on the first 4 rows of a card, and rows that are no longer
// on a knob drop their live offset.
function refreshRows(rows) {
  const set = Number(rows.dataset.knobSet);
  [...rows.children].forEach((row, i) => {
    const mapped = i < KNOBS_PER_SET;
    row.querySelector(".badge").textContent = mapped ? `K${(set - 1) * KNOBS_PER_SET + i + 1}` : "";
    const p = params[row.dataset.key];
    if (!mapped && p.live !== p.base) p.setLive(p.base);
  });
}

// ---------- Drag to reorder (pointer events, so it works with mouse and touch) ----------

const keysOf = (rows) => [...rows.children].map((r) => r.dataset.key);
const middleY = (node) => {
  const r = node.getBoundingClientRect();
  return r.top + r.height / 2;
};

// Used by slider rows and palette rows. onChange(list, done) is called whenever the row moves
// (done = false) and once at the end if the order actually changed (done = true).
function makeDraggable(row, handle, onChange) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const list = row.parentElement;
    const before = [...list.children];
    row.classList.add("dragging");

    const stop = new AbortController();
    handle.addEventListener(
      "pointermove",
      (e) => {
        // put the row in front of the first other row whose middle is below the pointer
        const next = [...list.children].find((r) => r !== row && e.clientY < middleY(r)) ?? null;
        if (next !== row.nextElementSibling) {
          list.insertBefore(row, next);
          onChange(list, false);
        }
      },
      { signal: stop.signal }
    );
    const end = () => {
      stop.abort();
      row.classList.remove("dragging");
      if ([...list.children].some((r, i) => r !== before[i])) onChange(list, true);
    };
    handle.addEventListener("pointerup", end, { signal: stop.signal });
    handle.addEventListener("pointercancel", end, { signal: stop.signal });
  });
}

function currentOrder() {
  const order = {};
  for (const rows of rowsBySet.values()) order[rows.dataset.group] = keysOf(rows);
  return order;
}

// ---------- MIDI knobs ----------

function handleCC(cc, value, channel) {
  if (learning) return learnCC(cc);

  const knob = knobCCs.indexOf(cc); // 0..15, or -1 if this CC isn't one of the knobs
  if (knob === -1) {
    ui.last.textContent = `CC ${cc} = ${value} (ch ${channel}) — not a knob`;
    return;
  }
  const row = rowsBySet.get(Math.floor(knob / KNOBS_PER_SET) + 1)?.children[knob % KNOBS_PER_SET];
  if (!row) {
    ui.last.textContent = `K${knob + 1} (CC ${cc}) — no slider in that slot`;
    return;
  }

  // The knobs are endless encoders in relative mode: 65 = one tick up, 63 = one tick down
  // (with acceleration, faster turns send values further from 64). They move the live value only.
  const ticks = value - 64;
  if (ticks === 0) return;
  const p = params[row.dataset.key];
  const { min, max, step } = p.def;
  const tickSize = Math.max(step, (max - min) / KNOB_TICKS_FULL_RANGE); // always at least one step
  const raw = p.live + ticks * tickSize;
  const snapped = min + Math.round((raw - min) / step) * step;
  p.setLive(Number(snapped.toFixed(6)));

  row.classList.remove("hit");
  void row.offsetWidth; // restart the flash animation
  row.classList.add("hit");
  ui.last.textContent = `K${knob + 1} · CC ${cc} → ${p.def.label} = ${p.readout.textContent}`;
}

// Learn: turn knobs 1..16 in order; each new CC number heard becomes the next knob.
function toggleLearn() {
  learning = learning ? null : [];
  ui.learn.classList.toggle("active", !!learning);
  ui.learn.textContent = learning ? "cancel learn" : "learn knobs";
  ui.last.textContent = learning ? "learning: turn knob 1" : "learn cancelled";
}

function learnCC(cc) {
  if (!learning.includes(cc)) learning.push(cc);
  if (learning.length < KNOB_COUNT) {
    ui.last.textContent = `learning: got CC ${cc} — now turn knob ${learning.length + 1}`;
    return;
  }
  knobCCs = learning;
  toggleLearn();
  ui.last.textContent = `learned knobs: ${knobCCs.join(", ")}`;
  markDirty();
}

// ---------- Palette editor ----------
//
// One row per palette: background, light-touch and heavy-touch colors.
// The palette morph slider blends between neighbouring rows (0 = first row).

const toHex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
const paletteToHex = (p) => ({ bg: toHex(p.bg), light: toHex(p.light), heavy: toHex(p.heavy) });
const paletteFromHex = (p) =>
  p && isHex(p.bg) && isHex(p.light) && isHex(p.heavy)
    ? { bg: fromHex(p.bg), light: fromHex(p.light), heavy: fromHex(p.heavy) }
    : null;
const copyPalette = (p) => ({ bg: [...p.bg], light: [...p.light], heavy: [...p.heavy] });

function buildPaletteEditor() {
  const section = el("section", "group palettes");
  const title = el("h3");
  title.append(el("span", null, "Palettes"), el("span", "knobs", "palette morph blends between these"));
  ui.paletteList = el("div", "palette-list");
  const add = el("button", "button", "+ new palette");
  add.addEventListener("click", () => {
    palettes.push(copyPalette(palettes[palettes.length - 1]));
    palettesChanged();
  });
  section.append(title, ui.paletteList, add);
  renderPalettes();
  return section;
}

function renderPalettes() {
  ui.paletteList.replaceChildren(...palettes.map(paletteRow));
}

function paletteRow(pal, i) {
  const row = el("div", "palette-row");
  row.palette = pal; // so a drag can rebuild the palette order from the rows
  const handle = el("span", "handle", "⋮⋮");
  handle.title = "drag to reorder";
  makeDraggable(row, handle, (list, done) => {
    // while dragging, just renumber; on drop, reorder the palettes themselves
    [...list.children].forEach((r, j) => (r.querySelector(".idx").textContent = String(j)));
    if (done) palettesReordered([...list.children].map((r) => r.palette));
  });
  row.append(handle, el("span", "idx", String(i)));

  for (const role of ["bg", "light", "heavy"]) {
    const swatch = el("label", "swatch");
    const input = el("input");
    input.type = "color";
    input.value = toHex(pal[role]);
    input.addEventListener("input", () => {
      pal[role] = fromHex(input.value);
      markDirty();
    });
    swatch.append(input, el("span", null, role));
    row.append(swatch);
  }

  const actions = [
    ["show", "set palette morph to this palette", () => params.palette.setBase(i)],
    [
      "copy",
      "duplicate this palette",
      () => {
        palettes.splice(i + 1, 0, copyPalette(pal));
        palettesChanged();
      },
    ],
    [
      "✕",
      "delete this palette",
      () => {
        if (palettes.length === 1) return; // always keep at least one
        palettes.splice(i, 1);
        palettesChanged();
      },
    ],
  ];
  for (const [text, tip, onClick] of actions) {
    const btn = el("button", "button small", text);
    btn.title = tip;
    btn.addEventListener("click", onClick);
    row.append(btn);
  }
  return row;
}

// If palette morph sits exactly on a palette, it follows that palette to its new position.
function palettesReordered(newOrder) {
  const morph = params.palette;
  const shown = Number.isInteger(morph.base) ? palettes[morph.base] : null;
  palettes.splice(0, palettes.length, ...newOrder);
  if (shown) morph.setBase(palettes.indexOf(shown));
  palettesChanged();
}

function palettesChanged() {
  params.palette.setMax(palettes.length - 1);
  renderPalettes();
  markDirty();
}

// ---------- Saving to config.json via the dev server ----------

let dirty = false;
let warnedNoServer = false;
const markDirty = () => (dirty = true);

function configSnapshot() {
  const values = {};
  for (const [key, p] of Object.entries(params)) values[key] = p.base;
  return { order: currentOrder(), knobCCs, values, palettes: palettes.map(paletteToHex) };
}

async function loadConfig() {
  try {
    const res = await fetch("config.json", { cache: "no-store" }); // relative: works under a Pages subpath
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

async function saveToServer() {
  dirty = false;
  try {
    const res = await fetch("/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configSnapshot()),
    });
    if (!res.ok) throw new Error(res.status);
    showNote("saved");
  } catch {
    dirty = true; // try again next time
    if (!warnedNoServer) showNote("not saving — start the page with npm run dev");
    warnedNoServer = true;
  }
}

function setupAutosave() {
  if (!CAN_SAVE) return;
  setInterval(() => dirty && saveToServer(), AUTOSAVE_MS);
  // closing or reloading the page: send any unsaved changes right away
  window.addEventListener("pagehide", () => {
    if (!dirty) return;
    const body = new Blob([JSON.stringify(configSnapshot())], { type: "application/json" });
    navigator.sendBeacon("/config", body);
  });
}

let noteTimer;
function showNote(text) {
  ui.note.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => (ui.note.textContent = ""), 2500);
}
