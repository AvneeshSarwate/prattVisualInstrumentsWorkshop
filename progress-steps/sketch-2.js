// Circle, moving back and forth
function setup() {
  createCanvas(640, 360);
}

function draw() {
  background(20);
  noFill();
  stroke(255);
  circle(width / 2 + sin(millis() / 500) * 133, height / 2, 133);
}
