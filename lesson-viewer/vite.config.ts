import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the build works from any folder — e.g. GitHub Pages serves this
  // repo at /prattVisualInstrumentsWorkshop/lesson-viewer/, not at the domain root.
  base: "./",
});
