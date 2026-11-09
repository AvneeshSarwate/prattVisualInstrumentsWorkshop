// Slider panel.
//
// - One card per parameter group (PARAM_GROUPS in sketch.js).
// - Drag a slider by its ⋮⋮ handle to reorder it within its card.
// - The first 4 sliders of each card follow the 4 BeatStep knobs of that card's knob set.
// - Double-click a slider's name to reset it to its default.
// - Slider order and learned knob CCs are saved to config.json by the dev server (npm run dev).

const KNOBS_PER_SET = 4;
const KNOB_COUNT = 16;
const KNOB_TICKS_FULL_RANGE = 100; // knob ticks to sweep a slider end to end — lower = more sensitive

// key -> { def, value, set(v), row, ... }. param(key) is what the sketch calls every frame.
const params = {};
const param = (key) => params[key].value;

let config = {}; // contents of config.json: { order: { groupId: [keys] }, knobCCs: [16 numbers] }
let knobCCs = DEFAULT_KNOB_CCS.slice();
const rowsBySet = new Map(); // knobSet -> the .rows element of that card
let learning = null; // while learning knobs: the CCs heard so far, in order
const ui = {}; // status bar elements

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Build ----------

async function buildControls(groups, canvasEl) {
  config = await loadConfig();
  if (Array.isArray(config.knobCCs) && config.knobCCs.length === KNOB_COUNT) knobCCs = config.knobCCs;

  const panel = el("div");
  panel.id = "controls";
  canvasEl.after(panel);

  const bar = el("div", "bar");
  ui.devices = el("span", "devices", "MIDI: connecting…");
  ui.last = el("span", "last", "turn a knob");
  ui.learn = el("button", "learn", "learn knobs");
  ui.learn.addEventListener("click", toggleLearn);
  ui.note = el("span", "note");
  const fullscreenBtn = el("button", "learn", "fullscreen (F)");
  fullscreenBtn.addEventListener("click", toggleFullscreen);
  bar.append(ui.devices, ui.last, ui.learn, fullscreenBtn, ui.note);

  // the status bar is hidden in fullscreen, so this small corner button gets you out without a keyboard
  const exitBtn = el("button", "exit-fullscreen", "✕");
  exitBtn.title = "exit fullscreen";
  exitBtn.addEventListener("click", toggleFullscreen);
  panel.append(exitBtn);

  const grid = el("div", "groups");
  for (const group of groups) grid.append(buildGroup(group, config.order?.[group.id] ?? []));
  panel.append(bar, grid);

  setupMidi(handleCC, (names, error) => {
    ui.devices.textContent = error ?? (names.length ? `MIDI: ${names.join(", ")}` : "MIDI: no devices connected");
    ui.devices.classList.toggle("ok", !error && names.length > 0);
  });
}

function buildGroup(group, savedOrder) {
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
  for (const key of keys) rows.append(buildRow(byKey.get(key)));
  rowsBySet.set(group.knobSet, rows);
  refreshBadges(rows);

  card.append(title, rows);
  return card;
}

function buildRow(def) {
  const row = el("div", "row");
  row.dataset.key = def.key;

  const handle = el("span", "handle", "⋮⋮");
  handle.title = "drag to reorder";
  const badge = el("span", "badge");
  const label = el("span", "label", def.label);
  label.title = `${def.label} — double-click to reset`;

  const input = el("input");
  Object.assign(input, { type: "range", min: def.min, max: def.max, step: def.step });
  const readout = el("span", "value");

  const decimals = (String(def.step).split(".")[1] ?? "").length;
  const p = {
    def,
    row,
    readout,
    value: def.value,
    set(v) {
      p.value = v;
      input.value = v;
      readout.textContent = v.toFixed(decimals);
    },
  };
  input.addEventListener("input", () => p.set(Number(input.value)));
  label.addEventListener("dblclick", () => p.set(def.value));
  p.set(def.value);
  params[def.key] = p;

  makeDraggable(row, handle);
  row.append(handle, badge, label, input, readout);
  return row;
}

// K-numbers on the first 4 rows of a card, blank on the rest.
function refreshBadges(rows) {
  const set = Number(rows.dataset.knobSet);
  [...rows.children].forEach((row, i) => {
    row.querySelector(".badge").textContent = i < KNOBS_PER_SET ? `K${(set - 1) * KNOBS_PER_SET + i + 1}` : "";
  });
}

// ---------- Drag to reorder (pointer events, so it works with mouse and touch) ----------

const keysOf = (rows) => [...rows.children].map((r) => r.dataset.key);
const middleY = (node) => {
  const r = node.getBoundingClientRect();
  return r.top + r.height / 2;
};

function makeDraggable(row, handle) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const rows = row.parentElement;
    const before = keysOf(rows).join();
    row.classList.add("dragging");

    const stop = new AbortController();
    handle.addEventListener(
      "pointermove",
      (e) => {
        // put the row in front of the first other row whose middle is below the pointer
        const next = [...rows.children].find((r) => r !== row && e.clientY < middleY(r)) ?? null;
        if (next !== row.nextElementSibling) {
          rows.insertBefore(row, next);
          refreshBadges(rows);
        }
      },
      { signal: stop.signal }
    );
    const end = () => {
      stop.abort();
      row.classList.remove("dragging");
      if (keysOf(rows).join() !== before) saveConfig({ order: currentOrder() }, "slider order");
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
  // (with acceleration, faster turns send values further from 64).
  const ticks = value - 64;
  if (ticks === 0) return;
  const p = params[row.dataset.key];
  const { min, max, step } = p.def;
  const tickSize = Math.max(step, (max - min) / KNOB_TICKS_FULL_RANGE); // always at least one step
  const raw = p.value + ticks * tickSize;
  const snapped = min + Math.round((raw - min) / step) * step;
  p.set(Math.min(max, Math.max(min, Number(snapped.toFixed(6)))));

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
  saveConfig({ knobCCs }, "knob CCs");
}

// ---------- config.json via the dev server ----------

async function loadConfig() {
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

async function saveConfig(patch, what) {
  Object.assign(config, patch);
  try {
    const res = await fetch("/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(res.status);
    showNote(`saved ${what}`);
  } catch {
    showNote("not saved — start the page with npm run dev");
  }
}

let noteTimer;
function showNote(text) {
  ui.note.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => (ui.note.textContent = ""), 2500);
}
