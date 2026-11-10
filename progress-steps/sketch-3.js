// Circle launched from a mouse press
let circleX = null;
let circleY = null;

function setup() {
  createCanvas(960, 540);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  if (circleX !== null) {
    circleX = circleX + 5;
    circle(circleX, circleY, 200);
    if (circleX > width) {
      circleX = null;
    }
  }
}

function mousePressed() {
  circleX = mouseX;
  circleY = mouseY;
}
