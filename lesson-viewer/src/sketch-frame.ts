// p5's package exports don't expose its prebuilt global-mode bundle, so import the file by path.
import p5BundleUrl from "../node_modules/p5/lib/p5.min.js?url";

// Runs one p5 sketch (global mode) in its own iframe, so two sketches can run side by side
// without their setup()/draw() globals colliding. The iframe is scaled to fit its stage.
//
// The sketch code is loaded from a blob: URL so error line numbers match the editor's lines.

const P5_SRC = new URL(p5BundleUrl, location.href).href;

// Every sketch is rendered at 2× the screen's pixel density, so it stays sharp when the
// stage scales it up (e.g. a 640 px sketch shown 900 px wide on a projector).
const RENDER_DENSITY_BOOST = 2;

let runCounter = 0;

type FrameMessage =
  | { type: "size"; width: number; height: number }
  | { type: "error"; message: string; line?: number; file?: string; stack?: string }
  | { type: "run" }
  | { type: "nav-key"; key: string };

export interface SketchFrameCallbacks {
  onError(message: string | null): void;
  /** ⌘/Ctrl+Enter pressed inside the sketch. */
  onRunRequest(): void;
  /** ←, → or D pressed inside a sketch that doesn't use the keyboard itself. */
  onNavKey(key: string): void;
}

function buildDocument(runId: string, sketchUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; overflow: hidden; background: transparent; color-scheme: dark; }
  body { display: inline-block; }
  canvas { display: block; }
  input[type="range"] { accent-color: #ebe7db; width: 220px; margin: 12px 0 4px; }
</style>
<script>
(() => {
  const send = (msg) => parent.postMessage({ lessonSketch: ${JSON.stringify(runId)}, ...msg }, "*");
  addEventListener("error", (e) => send({ type: "error", message: e.message, line: e.lineno, file: e.filename, stack: e.error?.stack }));
  // p5 2.x runs setup()/draw() inside promises, so most sketch errors arrive here
  addEventListener("unhandledrejection", (e) => send({ type: "error", message: String(e.reason), stack: e.reason?.stack }));
  // Cmd/Ctrl+Enter inside the sketch re-runs it, same as in the editor.
  // Arrow keys and D go to the lesson (step / switch view) unless the sketch handles keys itself.
  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send({ type: "run" }); return; }
    const sketchUsesKeys = ["keyPressed", "keyReleased", "keyTyped"].some((name) => typeof window[name] === "function");
    const navKey = ["ArrowLeft", "ArrowRight", "d", "D"].includes(e.key);
    if (navKey && !sketchUsesKeys && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) {
      send({ type: "nav-key", key: e.key });
    }
  });
  const density = Math.min(4, (window.devicePixelRatio || 1) * ${RENDER_DENSITY_BOOST});
  Object.defineProperty(window, "devicePixelRatio", { get: () => density, configurable: true });
  addEventListener("DOMContentLoaded", () => {
    new ResizeObserver(() => {
      const { scrollWidth: width, scrollHeight: height } = document.body;
      if (width && height) send({ type: "size", width, height });
    }).observe(document.body);
  });
})();
</script>
<script src="${P5_SRC}"></script>
</head>
<body>
<script src="${sketchUrl}"></script>
</body>
</html>`;
}

export class SketchFrame {
  /** The stage element: put it in the layout, the sketch is scaled to fill it. */
  readonly el: HTMLDivElement;
  private iframe?: HTMLIFrameElement;
  private sketchUrl?: string;
  private runId = "";
  private natural = { width: 640, height: 360 };
  private resizeObserver: ResizeObserver;

  private label = "sketch";

  constructor(private callbacks: SketchFrameCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "stage";
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.el);
    window.addEventListener("message", this.handleMessage);
  }

  run(code: string, label = this.label): void {
    this.stop();
    this.label = label;
    this.callbacks.onError(null);
    this.runId = `run-${++runCounter}`;
    this.sketchUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));

    const iframe = document.createElement("iframe");
    iframe.title = `${label}, running`;
    iframe.srcdoc = buildDocument(this.runId, this.sketchUrl);
    this.iframe = iframe;
    this.el.append(iframe);
    this.fit();
  }

  stop(): void {
    this.iframe?.remove();
    this.iframe = undefined;
    if (this.sketchUrl) URL.revokeObjectURL(this.sketchUrl);
    this.sketchUrl = undefined;
  }

  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener("message", this.handleMessage);
    this.el.remove();
  }

  private handleMessage = (event: MessageEvent): void => {
    const data = event.data as ({ lessonSketch?: string } & FrameMessage) | undefined;
    if (!data || data.lessonSketch !== this.runId || event.source !== this.iframe?.contentWindow) return;

    if (data.type === "size") {
      this.natural = { width: data.width, height: data.height };
      this.fit();
    } else if (data.type === "error") {
      const line = this.sketchLine(data);
      const message = data.message.replace(/^Uncaught /, "");
      this.callbacks.onError(line ? `Line ${line}: ${message}` : message);
    } else if (data.type === "run") {
      this.callbacks.onRunRequest();
    } else if (data.type === "nav-key") {
      this.callbacks.onNavKey(data.key);
    }
  };

  // The line in the sketch where the error happened. Errors inside setup()/draw() are reported
  // at p5's own call site, so fall back to the first stack frame inside the sketch file.
  private sketchLine(error: { line?: number; file?: string; stack?: string }): number | undefined {
    if (!this.sketchUrl) return undefined;
    if (error.file === this.sketchUrl && error.line) return error.line;
    const frame = error.stack?.split("\n").find((l) => l.includes(this.sketchUrl!));
    const match = frame?.slice(frame.indexOf(this.sketchUrl!) + this.sketchUrl!.length).match(/^:(\d+)/);
    return match ? Number(match[1]) : undefined;
  }

  // Scale the sketch to fit the stage, centered.
  private fit(): void {
    if (!this.iframe) return;
    const { width, height } = this.natural;
    const stage = this.el.getBoundingClientRect();
    if (!stage.width || !stage.height) return;
    const scale = Math.min(stage.width / width, stage.height / height);
    const x = (stage.width - width * scale) / 2;
    const y = (stage.height - height * scale) / 2;
    Object.assign(this.iframe.style, {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
    });
  }
}
