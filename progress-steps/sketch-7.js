// Circles launched from mouse presses, each keeping the slider radius from its launch
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
  const newCircle = { x: x, y: y, radius: radius }
  circles.push(newCircle)
}

function updateCircle(c) {
  c.x = c.x + 5;
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
