// Each launch is a ring of 10 circles orbiting the launch point as it moves
let circles = [];
let radiusSlider;

function setup() {
  createCanvas(640, 360);
  radiusSlider = createSlider(7, 133, 33);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  // update circles
  updateAllCircles();
  // clear circles
  cleanUpAllCircles();
  // draw circles
  for (let i = 0; i < circles.length; i++) {
    renderOrbitingCircle(circles[i]);
  }
}

// draws 10 small circles orbiting the launch point, at distance radius
function renderOrbitingCircle(c) {
  const age = (millis() - c.launchTime) / 1000; // seconds since launch
  for (let i = 0; i < 10; i++) {
    const angle = age + (i / 10) * TWO_PI; // spread evenly around the ring, turning with age
    const x = c.x + cos(angle) * c.radius;
    const y = c.y + sin(angle) * c.radius;
    circle(x, y, 13);
  }
}

function mousePressed() {
  createCircle(mouseX, mouseY, radiusSlider.value())
}

function createCircle(x, y, radius) {
  // seed: a random starting point in the noise, so each circle wobbles differently
  // launchTime: when it was launched, so the orbit can be a function of age
  const newCircle = { x: x, y: y, radius: radius, seed: random(1000), launchTime: millis() }
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
