// Builds the GitHub Pages site into docs/ (Pages setting: deploy from branch, /docs folder).
//
//   docs/                  landing page linking to the two below (site/index.html)
//   docs/instrument/       the performance instrument (static files, copied as-is)
//   docs/lesson-viewer/    the lesson viewer (Vite build)
//
// progress-steps/ is not deployed. Run from the repo root: npm run build:docs

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DOCS = "docs";

// The instrument's files. Not deployed: server.js (dev-only saving), *.glsl, notes, progress-steps/.
const INSTRUMENT_FILES = [
  "index.html",
  "style.css",
  "midi.js",
  "controls.js",
  "postfx.js",
  "sketch.js",
  "touchdebug.js",
  "fps.js",
  "config.json", // saved slider values, knob CCs and palettes, loaded on start
];

rmSync(DOCS, { recursive: true, force: true });
mkdirSync(`${DOCS}/instrument`, { recursive: true });
cpSync("site/index.html", `${DOCS}/index.html`);
for (const file of INSTRUMENT_FILES) cpSync(file, `${DOCS}/instrument/${file}`);

// type-check + build the lesson viewer straight into docs/lesson-viewer
execSync("npm run build -- --outDir ../docs/lesson-viewer --emptyOutDir", { cwd: "lesson-viewer", stdio: "inherit" });

// serve files as-is (no Jekyll processing)
writeFileSync(`${DOCS}/.nojekyll`, "");

console.log("\nBuilt docs/ — landing page, docs/instrument/, docs/lesson-viewer/");
