// Tiny local dev server — no dependencies.
//   npm run dev  ->  http://127.0.0.1:3000
//
// Serves this folder, and saves what the page POSTs to /config into config.json
// (slider order and learned knob CCs). Prototyping only: listens on this machine only.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const CONFIG = path.join(ROOT, "config.json");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function saveConfig(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const config = JSON.parse(body);
      fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
      console.log(`saved config.json (${new Date().toLocaleTimeString()})`);
      res.writeHead(204).end();
    } catch (err) {
      res.writeHead(400).end(String(err));
    }
  });
}

function serveFile(pathname, res) {
  if (pathname === "/config.json" && !fs.existsSync(CONFIG)) {
    res.writeHead(200, { "Content-Type": TYPES[".json"] }).end("{}");
    return;
  }
  const file = path.join(ROOT, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(data);
  });
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (req.method === "POST" && pathname === "/config") saveConfig(req, res);
    else serveFile(decodeURIComponent(pathname), res);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Clair de Lune running at http://127.0.0.1:${PORT}`));
