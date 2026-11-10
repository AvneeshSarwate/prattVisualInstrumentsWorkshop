// Circle launched from a mouse press
let circleX = null;
let circleY = null;

function setup() {
  createCanvas(640, 360);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  // update circle
  if (circleX !== null) {
    circleX = circleX + 5;
  }
  // clear circle
  if (circleX > width) {
    circleX = null;
  }
  // draw circle
  if (circleX !== null) {
    circle(circleX, circleY, 133);
  }
}

function mousePressed() {
  circleX = mouseX;
  circleY = mouseY;
}
