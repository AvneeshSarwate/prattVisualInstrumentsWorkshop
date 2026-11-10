# Lesson viewer

Shows two consecutive sketches at once: code on top, both sketches running below.

```bash
npm install
npm run dev
```

## Using it

- The circles at the top are the lesson's sketches. Click one to see what it changed from the
  sketch before it. The earlier sketch is marked with an outlined rectangle, the newer one with a filled rectangle.
- **Code** shows both sketches in editors. Edit freely, then press **Run** (or ⌘/Ctrl + Enter)
  to re-run that sketch. **Restore original** undoes your edits. Edits last until you reload.
- **Diff** shows what changed: added lines in green, removed lines in red.
  **Split** puts it side by side above the two sketches; **Unified** shows one column.
- **A− / A+** change the code text size. Drag the bar between code and sketches to resize.
- The URL remembers where you are: `#4` shows sketch 4 and sketch 5.

| Key | Does |
| --- | --- |
| ← / → | Previous / next step |
| D | Switch between Code and Diff |
| ⌘/Ctrl + Enter | Run the sketch you're editing (both, if you're not in an editor) |
| Esc | Leave the editor, so the keys above work again |

The arrow keys and D also work after clicking into a sketch, unless that sketch defines
`keyPressed`, `keyReleased` or `keyTyped` itself.

## Adding a step

Add `sketches/sketch-N.js` with the next number. Its first-line comment becomes its title.
Sketches are ordinary p5.js global-mode sketches (p5 2.3.4, bundled locally, so it works offline).

## How it's built

- [Vite](https://vite.dev) + TypeScript, no framework.
- [@pierre/diffs](https://diffs.com) renders the editors (`File` + its `Editor`) and the diff
  (`FileDiff`), highlighted by Shiki with the stock `github-dark-default` theme (`src/theme.ts`).
- The page around the code is styled like a Tufte book page (`src/style.css`): ivory paper,
  ink, hairline rules, EB Garamond.
- Each sketch runs in its own iframe (`src/sketch-frame.ts`), so two global-mode sketches can run
  side by side. Errors are shown under the sketch with the line number from the editor.
