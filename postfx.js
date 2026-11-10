// Post-processing: a displacement-trail feedback loop, banded by age.
//
// Every frame:
//   1. circleLayer (sketch.js) holds just this frame's circles, on a transparent background.
//   2. Feedback pass: last frame's trail is sampled through a displacement warp
//      (coordWarp from liquidMaze.glsl), the new circles are comped over it, and every pixel
//      keeps an age: seconds since a circle last covered it. Trails older than the
//      cutoff are cut off.
//   3. Output pass: the trail is banded by age (like clock.glsl), alternating the palette's
//      light and heavy colors, comped over the palette background, with the crisp circles on top.
//
// The trail lives in two float framebuffers that take turns (read last frame, write this one).
// Each trail pixel stores:  r = coverage (0..1),  g = coverage × age.
// Storing age pre-multiplied by coverage keeps it correct where the warp blends trail
// pixels with empty ones: age = g / r.

let trailRead, trailWrite, feedbackShader, outputShader;
let warpTime = 1000; // like liquidMaze's `time/5. + 1000.`; advances by warp speed
let bandPhase = 0; // advances by band speed

// A plain quad: the fragment shaders work in screen pixels (gl_FragCoord).
const POSTFX_VERT = `
precision highp float;
attribute vec3 aPosition;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}`;

const POSTFX_COMMON = `
precision highp float;
uniform vec2 uRes; // size of what we're drawing into, in device pixels

float rand(float x) { return fract(sin(x) * 43758.5453); }
float sinN(float x) { return sin(x) * 0.5 + 0.5; }
float cosN(float x) { return cos(x) * 0.5 + 0.5; }

vec2 uvN() { return gl_FragCoord.xy / uRes; }

// The circle layer is a 2D canvas: its first row is the top of the picture,
// while gl_FragCoord counts up from the bottom.
vec4 circlesAt(sampler2D tex, vec2 uv) { return texture2D(tex, vec2(uv.x, 1.0 - uv.y)); }
`;

const FEEDBACK_FRAG = `${POSTFX_COMMON}
uniform sampler2D uPrev;    // last frame's trail
uniform sampler2D uCircles; // this frame's circles
uniform float uWarpTime;
uniform float uDisplace;    // how far toward the warped coordinate to sample each frame
uniform float uDt;          // seconds since last frame
uniform float uCutoff;      // trail age (s) after which it's cut off

// from liquidMaze.glsl: 20 moving points pull nearby coordinates toward them
vec3 coordWarp(vec2 stN, float t2) {
  vec2 warp = stN;
  float rad = .5;
  for (float i = 0.0; i < 20.; i++) {
    vec2 p = vec2(sinN(t2 * rand(i + 1.) * 1.3 + i), cosN(t2 * rand(i + 1.) * 1.1 + i));
    warp = length(p - stN) <= rad ? mix(warp, p, 1. - length(stN - p) / rad) : warp;
  }
  return vec3(warp, distance(warp, stN));
}

void main() {
  vec2 uv = uvN();

  // last frame, displaced
  vec2 warped = mix(uv, coordWarp(uv, uWarpTime).xy, uDisplace);
  vec4 prev = texture2D(uPrev, warped);
  float coverage = prev.r;
  float age = coverage > 0.001 ? prev.g / coverage + uDt : 0.0;
  if (age >= uCutoff) coverage = 0.0; // trail cut off

  // new circles comped over the old trail, with age 0
  float fresh = circlesAt(uCircles, uv).a;
  float newCoverage = fresh + coverage * (1.0 - fresh);
  float newCoverageAge = coverage * (1.0 - fresh) * age;
  if (newCoverage < 0.004) {
    newCoverage = 0.0;
    newCoverageAge = 0.0;
  }

  gl_FragColor = vec4(newCoverage, newCoverageAge, 0.0, 1.0);
}`;

const OUTPUT_FRAG = `${POSTFX_COMMON}
uniform sampler2D uTrail;
uniform sampler2D uCircles;
uniform vec3 uBg;
uniform vec3 uLight;
uniform vec3 uHeavy;
uniform float uBandFreq;  // bands per second of age (in radians, like clock.glsl)
uniform float uBandPhase; // scrolls the bands over time
uniform float uCutoff;    // trail age (s) after which it's cut off — 0 = no trail at all

void main() {
  vec2 uv = uvN();
  vec4 trail = texture2D(uTrail, uv);
  float coverage = clamp(trail.r, 0.0, 1.0);
  float age = trail.r > 0.001 ? trail.g / trail.r : 0.0;
  if (age >= uCutoff) coverage = 0.0; // also hides this frame's fresh (age 0) trail when cutoff is 0

  // age bands, alternating the palette's light and heavy colors
  float band = sinN(-uBandPhase + age * uBandFreq);
  vec3 bandColor = mix(uLight, uHeavy, smoothstep(0.4, 0.6, band));

  vec3 col = mix(uBg, bandColor, coverage); // trail over the base color
  vec4 circles = circlesAt(uCircles, uv);
  col = col * (1.0 - circles.a) + circles.rgb; // crisp circles on top (the layer arrives premultiplied)
  gl_FragColor = vec4(col, 1.0);
}`;

function setupPostFx() {
  // HALF_FLOAT: ages go above 1, and half floats can still be smoothly sampled by the warp.
  // Framebuffers follow the canvas size automatically (resizing clears the trail).
  const options = { format: HALF_FLOAT, depth: false, antialias: false, textureFiltering: LINEAR };
  trailRead = createFramebuffer(options);
  trailWrite = createFramebuffer(options);
  feedbackShader = createShader(POSTFX_VERT, FEEDBACK_FRAG);
  outputShader = createShader(POSTFX_VERT, OUTPUT_FRAG);
}

const rgb01 = (c) => c.map((v) => v / 255);

function renderPostFx(circles) {
  const dt = min(deltaTime / 1000, 0.1); // seconds; capped so a stalled tab doesn't age everything at once
  warpTime += dt * param("trailWarpSpeed");
  bandPhase += dt * param("trailBandSpeed");
  const res = [width * pixelDensity(), height * pixelDensity()];

  // 2. feedback: last trail (displaced) + new circles -> this frame's trail
  trailWrite.begin();
  shader(feedbackShader);
  feedbackShader.setUniform("uRes", res);
  feedbackShader.setUniform("uPrev", trailRead);
  feedbackShader.setUniform("uCircles", circles);
  feedbackShader.setUniform("uWarpTime", warpTime);
  feedbackShader.setUniform("uDisplace", param("trailDisplace"));
  feedbackShader.setUniform("uDt", dt);
  feedbackShader.setUniform("uCutoff", param("trailCutoff"));
  noStroke();
  plane(width, height);
  trailWrite.end();
  [trailRead, trailWrite] = [trailWrite, trailRead];

  // 3. output: banded trail over the background, circles on top
  shader(outputShader);
  outputShader.setUniform("uRes", res);
  outputShader.setUniform("uTrail", trailRead);
  outputShader.setUniform("uCircles", circles);
  outputShader.setUniform("uBg", rgb01(pal.bg));
  outputShader.setUniform("uLight", rgb01(pal.light));
  outputShader.setUniform("uHeavy", rgb01(pal.heavy));
  outputShader.setUniform("uBandFreq", param("trailBandFreq"));
  outputShader.setUniform("uBandPhase", bandPhase);
  outputShader.setUniform("uCutoff", param("trailCutoff"));
  noStroke();
  plane(width, height);
}
