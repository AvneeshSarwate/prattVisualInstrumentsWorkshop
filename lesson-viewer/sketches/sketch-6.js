// Circles launched from mouse presses, with a slider for the radius
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
  let radius = radiusSlider.value();
  // update circles
  updateAllCircles();
  // clear circles
  cleanUpAllCircles();
  // draw circles
  for (let i = 0; i < circles.length; i++) {
    circle(circles[i].x, circles[i].y, radius * 2);
  }
}

function mousePressed() {
  createCircle(mouseX, mouseY)
}

function createCircle(x, y) {
  const newCircle = { x: x, y: y }
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
