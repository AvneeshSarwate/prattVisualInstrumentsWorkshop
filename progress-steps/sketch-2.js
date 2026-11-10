// Circle, moving back and forth
function setup() {
  createCanvas(960, 540);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  circle(width / 2 + sin(millis() / 500) * 200, height / 2, 200);
}
