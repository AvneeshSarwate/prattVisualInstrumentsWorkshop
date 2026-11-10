// The lesson's sketches: every sketches/sketch-N.js file, in order of N.
// Add a step by dropping in the next sketch-N.js — Vite picks it up automatically.
//
// Per-step variants: sketches/sketch-N.vs-M.js is sketch N as shown next to sketch M.
// Use it to word a sketch slightly differently in one step (e.g. comments that line up with
// the neighbouring sketch, so the diff anchors). Without a variant, sketch-N.js is used.

export interface Sketch {
  file: string; // the name shown to students, e.g. "sketch-4.js"
  key: string; // the source file this text comes from, e.g. "sketch-4.vs-3.js" (also the edit key)
  number: number; // 4
  source: string; // the code as written on disk
  summary: string; // the sketch's first-line comment, e.g. "Circles launched from mouse presses"
}

const sources = import.meta.glob("../sketches/sketch-*.js", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FILE_NAME = /^sketch-(\d+)(?:\.vs-(\d+))?\.js$/;

const bases: Sketch[] = [];
const variants = new Map<string, Sketch>(); // "4 vs 3" -> sketch 4 as shown next to sketch 3

for (const [path, source] of Object.entries(sources)) {
  const key = path.split("/").pop()!;
  const match = key.match(FILE_NAME);
  if (!match) continue;
  const number = Number(match[1]);
  const sketch: Sketch = {
    file: `sketch-${number}.js`,
    key,
    number,
    source,
    summary: source.match(/^\s*\/\/\s*(.+)/)?.[1]?.trim() ?? "",
  };
  if (match[2]) variants.set(`${number} vs ${match[2]}`, sketch);
  else bases.push(sketch);
}

export const sketches: Sketch[] = bases.sort((a, b) => a.number - b.number);

/** The version of `sketch` to show when it sits next to `other`. */
export function versionFor(sketch: Sketch, other: Sketch): Sketch {
  return variants.get(`${sketch.number} vs ${other.number}`) ?? sketch;
}
