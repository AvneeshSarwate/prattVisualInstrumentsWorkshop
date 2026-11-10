// Circles launched from mouse presses, with speed wobbled by noise
let circles = [];
let radiusSlider;

function setup() {
  createCanvas(960, 540);
  radiusSlider = createSlider(10, 200, 50);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  updateAllCircles();
  cleanUpAllCircles();
  for (let i = 0; i < circles.length; i++) {
    circle(circles[i].x, circles[i].y, circles[i].radius * 2);
  }
}

function mousePressed() {
  createCircle(mouseX, mouseY, radiusSlider.value())
}

function createCircle(x, y, radius) {
  // seed: a random starting point in the noise, so each circle wobbles differently
  const newCircle = { x: x, y: y, radius: radius, seed: random(1000) }
  circles.push(newCircle)
}

function updateCircle(c) {
  // noise() returns a smooth random value between 0 and 1 that changes slowly with time
  c.x = c.x + 5 + (noise(c.seed + millis() / 1000) - 0.5) * 10;
  // + 100 reads a different part of the noise, so y wobbles independently of x
  c.y = c.y + (noise(c.seed + millis() / 1000 + 100) - 0.5) * 10;
}

function isOffScreen(c) {
  return c.x > width;
}

function updateAllCircles() {
  for (let i = 0; i < circles.length; i++) {
    updateCircle(circles[i]);
  }
}

function cleanUpAllCircles() {
  let onScreenCircles = [];
  for (let i = 0; i < circles.length; i++) {
    if (!isOffScreen(circles[i])) {
      onScreenCircles.push(circles[i]);
    }
  }
  circles = onScreenCircles;
}
