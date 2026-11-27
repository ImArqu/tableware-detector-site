const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const models = require("./api/models.js");

const publicDir = path.join(__dirname, "public");
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".wasm": "application/wasm", ".onnx": "application/octet-stream",
  ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".txt": "text/plain"
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url === "/api/models") return models(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
  const file = path.resolve(publicDir, "." + (url === "/" ? "/index.html" : url));
  if (!file.startsWith(publicDir + path.sep)) return res.writeHead(404).end();
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) return res.writeHead(404).end("File not found");
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Content-Length": stats.size, "Cache-Control": "no-cache" });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
});
const port = Number(process.env.PORT || 3000);
server.listen(port, "127.0.0.1", () => console.log("Photo detector: http://localhost:" + port));
