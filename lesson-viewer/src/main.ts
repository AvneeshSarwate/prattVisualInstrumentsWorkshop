import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/eb-garamond/wght-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "./style.css";
import "./theme";
import { sketches, versionFor, type Sketch } from "./sketches";
import { DiffPane, EditorPane, diffStats, type DiffStyle } from "./code-panes";
import { SketchFrame } from "./sketch-frame";

// Lesson viewer: two consecutive sketches, code on top (editable, or as a diff),
// both sketches running below. The URL hash is the earlier sketch's number: #3 shows 3 and 4.

type Mode = "code" | "diff";
type Side = 0 | 1; // 0 = earlier sketch (outlined circle), 1 = newer sketch (filled circle)
const SIDE_NAMES = ["old", "new"] as const;

// ---------- Preferences (remembered in this browser) ----------

interface Prefs {
  mode: Mode;
  diffStyle: DiffStyle;
  codeSize: number | null; // px; null = DEFAULT_CODE_SIZE
  sketchHeight: number | null; // px; null = layout default
}

const DEFAULT_CODE_SIZE = 13;
const PREFS_KEY = "lesson-viewer-prefs-v2";
const prefs: Prefs = { mode: "code", diffStyle: "split", codeSize: null, sketchHeight: null, ...readPrefs() };

function readPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable (private window etc.) — preferences just won't persist
  }
}

// ---------- Elements ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $("app");
const stepsEl = $("steps");
const prevBtn = $<HTMLButtonElement>("prev");
const nextBtn = $<HTMLButtonElement>("next");
const modeGroup = $("mode");
const diffStyleGroup = $("diff-style");
const codeArea = $("code-area");
const codeHeads = $("code-heads");
const codeBody = $("code-body");
const divider = $("divider");
const sketchArea = $("sketch-area");

const narrowScreen = matchMedia("(max-width: 760px)");

// ---------- State ----------

let leftIndex = 0; // index into sketches of the earlier sketch
const drafts = new Map<string, string>(); // file -> edited text, for this session only
let codePanes: { destroy(): void }[] = [];
let editorPanes: (EditorPane | undefined)[] = [];
let lastFocusedEditor: Side | null = null;

// the two sketches on screen, each in the version written for this step (see sketches.ts)
const pair = (): [Sketch, Sketch] => {
  const [a, b] = [sketches[leftIndex], sketches[leftIndex + 1]];
  return [versionFor(a, b), versionFor(b, a)];
};
const textOf = (s: Sketch) => drafts.get(s.key) ?? s.source;
const isEdited = (s: Sketch) => drafts.has(s.key);
const fileOf = (s: Sketch) => ({ name: s.file, contents: textOf(s) });
const effectiveDiffStyle = (): DiffStyle => (narrowScreen.matches ? "unified" : prefs.diffStyle);

function setDraft(s: Sketch, text: string): void {
  if (text === s.source) drafts.delete(s.key);
  else drafts.set(s.key, text);
  refreshEditedMarks();
}

// ---------- Sketch panels (built once, reused for every step) ----------

interface Panel {
  root: HTMLElement;
  badge: HTMLElement;
  summary: HTMLElement;
  restore: HTMLButtonElement;
  error: HTMLElement;
  frame: SketchFrame;
}

const panels: Panel[] = ([0, 1] as Side[]).map((side) => {
  const root = el("article", "sketch-panel");
  root.dataset.side = SIDE_NAMES[side];

  const head = el("header", "panel-head");
  const badge = el("span", `badge ${SIDE_NAMES[side]}`);
  const summary = el("p", "summary");
  const actions = el("div", "actions");
  const restore = el("button", "button quiet", "Restore original") as HTMLButtonElement;
  restore.type = "button";
  restore.title = "Undo your edits to this sketch and run it";
  restore.addEventListener("click", () => restoreOriginal(side));
  const run = el("button", "button", "Run") as HTMLButtonElement;
  run.type = "button";
  run.title = "Run this sketch again (⌘ Enter)";
  run.addEventListener("click", () => runSide(side));
  actions.append(restore, run);
  head.append(badge, summary, actions);

  const error = el("p", "error");
  error.setAttribute("role", "status");
  error.hidden = true;

  const frame = new SketchFrame({
    onError: (message) => {
      error.hidden = !message;
      error.textContent = message ?? "";
    },
    onRunRequest: () => runSide(side),
    onNavKey: handleNavKey,
  });

  root.append(head, frame.el, error);
  sketchArea.append(root);
  return { root, badge, summary, restore, error, frame };
});

function renderPanels(): void {
  pair().forEach((s, side) => {
    const panel = panels[side];
    panel.badge.textContent = String(s.number);
    panel.summary.textContent = s.summary || s.file;
    panel.summary.title = s.summary;
  });
  refreshEditedMarks();
}

function runSide(side: Side): void {
  const s = pair()[side];
  // read the editor directly: its change callback can lag a keystroke behind ⌘ Enter
  const live = editorPanes[side]?.text();
  if (live !== undefined) setDraft(s, live);
  panels[side].frame.run(textOf(s), s.file);
}

function runBoth(): void {
  runSide(0);
  runSide(1);
}

function restoreOriginal(side: Side): void {
  const s = pair()[side];
  const pane = editorPanes[side];
  if (pane) pane.replaceText(s.source); // undoable in the editor
  setDraft(s, s.source);
  if (prefs.mode === "diff") renderCode();
  runSide(side);
}

// ---------- Code area ----------

function renderCode(): void {
  for (const pane of codePanes) pane.destroy();
  codePanes = [];
  editorPanes = [];
  lastFocusedEditor = null;
  codeBody.replaceChildren();

  const [a, b] = pair();
  const single = prefs.mode === "diff" && effectiveDiffStyle() === "unified";
  codeArea.dataset.layout = single ? "single" : "double";
  codeArea.dataset.mode = prefs.mode;

  if (prefs.mode === "code") {
    pair().forEach((s, side) => {
      const pane = new EditorPane(
        codeBody,
        s.file,
        textOf(s),
        (text) => setDraft(s, text),
        () => (lastFocusedEditor = side as Side),
      );
      codePanes.push(pane);
      editorPanes[side] = pane;
    });
  } else {
    codePanes.push(new DiffPane(codeBody, fileOf(a), fileOf(b), effectiveDiffStyle()));
  }
  renderCodeHeads(single);
}

function renderCodeHeads(single: boolean): void {
  const [a, b] = pair();
  const heads: HTMLElement[] = [];

  const fileLabel = (s: Sketch, side: Side) => {
    const label = el("span", "file-label");
    label.dataset.key = s.key;
    label.append(el("span", `badge ${SIDE_NAMES[side]}`, String(s.number)), el("span", "filename", s.file));
    label.append(el("span", "edited", "edited"));
    return label;
  };

  const stats = () => {
    const { added, removed } = diffStats(fileOf(a), fileOf(b));
    const wrap = el("span", "stats");
    wrap.setAttribute("aria-label", `${added} lines added, ${removed} removed`);
    wrap.append(el("span", "added", `+${added}`), el("span", "removed", `−${removed}`));
    return wrap;
  };

  if (single) {
    const head = el("div", "code-head");
    head.append(fileLabel(a, 0), el("span", "arrow", "→"), fileLabel(b, 1), stats());
    heads.push(head);
  } else {
    [a, b].forEach((s, side) => {
      const head = el("div", "code-head");
      head.append(fileLabel(s, side as Side));
      if (prefs.mode === "diff" && side === 1) head.append(stats());
      heads.push(head);
    });
  }
  codeHeads.replaceChildren(...heads);
  refreshEditedMarks();
}

function refreshEditedMarks(): void {
  const [a, b] = pair();
  for (const label of codeHeads.querySelectorAll<HTMLElement>(".file-label")) {
    const s = label.dataset.key === a.key ? a : b;
    label.toggleAttribute("data-edited", isEdited(s));
  }
  panels.forEach((panel, side) => (panel.restore.hidden = !isEdited(pair()[side])));
}

// ---------- Stepper ----------

function renderStepper(): void {
  const last = sketches.length - 1;
  stepsEl.replaceChildren(
    ...sketches.map((s, i) => {
      const li = document.createElement("li");
      if (i > 0) li.append(el("span", i === leftIndex + 1 ? "connector is-active" : "connector"));

      const button = el("button", "step", String(s.number)) as HTMLButtonElement;
      button.type = "button";
      if (i === leftIndex) button.classList.add("is-old");
      if (i === leftIndex + 1) button.classList.add("is-new");
      if (i === leftIndex || i === leftIndex + 1) button.setAttribute("aria-current", "step");
      // clicking sketch n shows what n changed from n - 1 (sketch 1 shows 1 and 2)
      const target = Math.min(Math.max(i - 1, 0), last - 1);
      const [from, to] = [sketches[target], sketches[target + 1]];
      button.title = `${s.file}${s.summary ? `: ${s.summary}` : ""}`;
      button.setAttribute("aria-label", `Show sketch ${from.number} and sketch ${to.number}`);
      button.addEventListener("click", () => go(target));
      li.append(button);
      return li;
    }),
  );
  prevBtn.disabled = leftIndex === 0;
  nextBtn.disabled = leftIndex >= last - 1;
}

// ---------- Navigation ----------

function indexFromHash(): number {
  const n = Number(location.hash.slice(1));
  const i = sketches.findIndex((s) => s.number === n);
  return Math.min(Math.max(i, 0), sketches.length - 2);
}

function go(index: number): void {
  index = Math.min(Math.max(index, 0), sketches.length - 2);
  if (index === leftIndex && codePanes.length) return;
  leftIndex = index;
  history.replaceState(null, "", `#${sketches[index].number}`);
  renderStepper();
  renderCode();
  renderPanels();
  runBoth();
}

// ---------- Controls ----------

function setMode(mode: Mode): void {
  prefs.mode = mode;
  savePrefs();
  syncControls();
  renderCode();
}

function syncControls(): void {
  for (const b of modeGroup.querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.mode === prefs.mode));
  }
  for (const b of diffStyleGroup.querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.style === effectiveDiffStyle()));
  }
  diffStyleGroup.hidden = prefs.mode !== "diff" || narrowScreen.matches;
  // on the root element: style.css resolves --diffs-font-size from it at :root
  document.documentElement.style.setProperty("--code-size", `${prefs.codeSize ?? DEFAULT_CODE_SIZE}px`);
  if (prefs.sketchHeight) app.style.setProperty("--sketch-h", `${prefs.sketchHeight}px`);
}

modeGroup.addEventListener("click", (e) => {
  const mode = (e.target as HTMLElement).closest("button")?.dataset.mode as Mode | undefined;
  if (mode && mode !== prefs.mode) setMode(mode);
});

diffStyleGroup.addEventListener("click", (e) => {
  const style = (e.target as HTMLElement).closest("button")?.dataset.style as DiffStyle | undefined;
  if (!style || style === prefs.diffStyle) return;
  prefs.diffStyle = style;
  savePrefs();
  syncControls();
  renderCode();
});

function changeCodeSize(delta: number): void {
  prefs.codeSize = Math.min(30, Math.max(10, (prefs.codeSize ?? DEFAULT_CODE_SIZE) + delta));
  savePrefs();
  syncControls();
}
$("smaller").addEventListener("click", () => changeCodeSize(-1));
$("larger").addEventListener("click", () => changeCodeSize(1));

prevBtn.addEventListener("click", () => go(leftIndex - 1));
nextBtn.addEventListener("click", () => go(leftIndex + 1));
window.addEventListener("hashchange", () => go(indexFromHash()));
narrowScreen.addEventListener("change", () => {
  syncControls();
  renderCode();
});

// Divider: drag (or arrow keys) to trade space between code and sketches.
function setSketchHeight(px: number): void {
  prefs.sketchHeight = Math.round(Math.min(Math.max(px, 140), window.innerHeight - 220));
  app.style.setProperty("--sketch-h", `${prefs.sketchHeight}px`);
}

divider.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  divider.setPointerCapture(e.pointerId); // keeps the drag even over the sketch iframes
  const move = (ev: PointerEvent) => setSketchHeight(window.innerHeight - ev.clientY - divider.offsetHeight / 2);
  divider.addEventListener("pointermove", move);
  divider.addEventListener(
    "pointerup",
    () => {
      divider.removeEventListener("pointermove", move);
      savePrefs();
    },
    { once: true },
  );
});

divider.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const current = sketchArea.getBoundingClientRect().height;
  setSketchHeight(current + (e.key === "ArrowUp" ? 24 : -24));
  savePrefs();
});

// Keyboard: ⌘/Ctrl+Enter runs, ←/→ steps, D switches Code/Diff, Esc leaves the editor.
window.addEventListener(
  "keydown",
  (e) => {
    const editing = prefs.mode === "code" && codeArea.contains(document.activeElement);

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (editing && lastFocusedEditor !== null) runSide(lastFocusedEditor);
      else runBoth();
      return;
    }
    if (editing) {
      if (e.key === "Escape") (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || document.activeElement === divider) return;
    handleNavKey(e.key);
  },
  true, // capture, so ⌘ Enter is handled before the editor sees it
);

function handleNavKey(key: string): void {
  if (key === "ArrowRight") go(leftIndex + 1);
  else if (key === "ArrowLeft") go(leftIndex - 1);
  else if (key === "d" || key === "D") setMode(prefs.mode === "code" ? "diff" : "code");
}

// ---------- Helpers ----------

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Start ----------

syncControls();
if (sketches.length < 2) {
  codeBody.replaceChildren(el("p", "empty", "Add sketch-1.js and sketch-2.js to the sketches folder to start."));
} else {
  leftIndex = indexFromHash();
  go(leftIndex);
}