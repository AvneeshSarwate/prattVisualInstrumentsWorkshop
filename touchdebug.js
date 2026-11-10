// Touch debug readout — press D to show/hide.
//
// Shows what the browser reports for each touch on the canvas, to test whether this screen
// gives anything usable as "tap intensity":
//   w × h     contact size in CSS px (1 × 1 means the screen isn't reporting it)
//   pressure  0..1 (fingers usually report a fixed 0.5; the Surface Pen reports real pressure)
// "peak" is the largest value seen during the press — the contact patch grows as you press harder.

(() => {
  const MAX_HISTORY = 10;
  let visible = true;
  const active = new Map(); // pointerId -> stats for presses still down
  const history = []; // finished presses, newest first

  const readout = document.createElement("pre");
  readout.id = "touch-debug";
  document.addEventListener("DOMContentLoaded", () => document.body.append(readout));

  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const line = (s, live) =>
    `${live ? "▶" : " "} ${s.type.padEnd(5)} ` +
    `w×h ${fmt(s.w)}×${fmt(s.h)}`.padEnd(18) +
    `peak ${fmt(s.peakW)}×${fmt(s.peakH)}`.padEnd(18) +
    `area ${Math.round(s.peakArea)}`.padEnd(11) +
    (typeof params !== "undefined" && params.heavyArea
      ? (s.peakArea >= params.heavyArea.live ? "HEAVY " : "light ")
      : "") +
    `pressure ${s.pressure.toFixed(2)} (peak ${s.peakPressure.toFixed(2)})` +
    (s.type === "pen" ? `  tilt ${s.tiltX},${s.tiltY}` : "");

  function render() {
    if (!visible) return;
    const lines = ["touch debug (D to hide)", ...[...active.values()].map((s) => line(s, true))];
    if (history.length) lines.push("— last presses —", ...history.map((s) => line(s, false)));
    readout.textContent = lines.join("\n");
  }

  function update(e) {
    if (e.target.tagName !== "CANVAS") return;
    let s = active.get(e.pointerId);
    if (!s) {
      if (e.type !== "pointerdown") return;
      s = { type: e.pointerType, peakW: 0, peakH: 0, peakArea: 0, peakPressure: 0 };
      active.set(e.pointerId, s);
    }
    Object.assign(s, { w: e.width, h: e.height, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY });
    s.peakW = Math.max(s.peakW, e.width);
    s.peakH = Math.max(s.peakH, e.height);
    s.peakArea = Math.max(s.peakArea, e.width * e.height); // same measure the sketch uses for heavy touches
    s.peakPressure = Math.max(s.peakPressure, e.pressure);

    if (e.type === "pointerup" || e.type === "pointercancel") {
      active.delete(e.pointerId);
      if (e.type === "pointercancel") s.type += "✕"; // cancelled (e.g. taken by the OS)
      history.unshift(s);
      history.length = Math.min(history.length, MAX_HISTORY);
    }
    render();
  }

  // capture phase, so this sees the events before the sketch's own handlers
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    window.addEventListener(type, update, true);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "d" && e.key !== "D") return;
    visible = !visible;
    readout.hidden = !visible;
    render();
  });

  render();
})();
