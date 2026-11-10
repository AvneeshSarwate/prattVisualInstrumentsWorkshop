// Circles launched from mouse presses, organized into functions
let circles = [];

function setup() {
  createCanvas(960, 540);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  updateAllCircles();
  for (let i = 0; i < circles.length; i++) {
    circle(circles[i].x, circles[i].y, 200);
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
  cleanUpCircles();
}

function cleanUpCircles() {
  let onScreenCircles = [];
  for (let i = 0; i < circles.length; i++) {
    if (!isOffScreen(circles[i])) {
      onScreenCircles.push(circles[i]);
    }
  }
  circles = onScreenCircles;
}
