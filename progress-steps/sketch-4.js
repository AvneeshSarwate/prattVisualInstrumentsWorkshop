// Circles launched from mouse presses, stored in an array
let circles = [];

function setup() {
  createCanvas(960, 540);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  for (let i = 0; i < circles.length; i++) {
    circles[i].x = circles[i].x + 5;
    circle(circles[i].x, circles[i].y, 200);
  }
  // loop backwards so removing a circle doesn't skip the next one
  for (let i = circles.length - 1; i >= 0; i--) {
    if (circles[i].x > width) {
      circles.splice(i, 1);
    }
  }
}

function mousePressed() {
  circles.push({ x: mouseX, y: mouseY });
}
