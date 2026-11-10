// FPS meter, top-right corner — press R to show/hide. Shows the average frame rate over the last half second
// and the slowest frame in that window (a hitch shows up there even if the average looks fine).

(() => {
  const meter = document.createElement("pre");
  meter.id = "fps-meter";
  document.addEventListener("DOMContentLoaded", () => document.body.append(meter));

  let last = performance.now();
  let windowStart = last;
  let frames = 0;
  let worst = 0;

  function tick(now) {
    const dt = now - last;
    last = now;
    frames++;
    worst = Math.max(worst, dt);
    if (now - windowStart >= 500) {
      const fps = (frames * 1000) / (now - windowStart);
      meter.textContent = `${fps.toFixed(0)} fps  worst ${worst.toFixed(1)} ms  (R)`;
      meter.classList.toggle("slow", fps < 58);
      windowStart = now;
      frames = 0;
      worst = 0;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") meter.hidden = !meter.hidden;
  });
})();
