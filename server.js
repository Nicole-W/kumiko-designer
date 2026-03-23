import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "public");
const PORT = parseInt(process.env.PORT, 10) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function safePublicPath(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const rel =
    decoded === "/" || decoded === "" ? "index.html" : decoded.replace(/^\/+/, "");
  const parts = rel.split(/[/\\]/).filter(Boolean);
  if (parts.some((p) => p === "..")) return null;
  const root = path.resolve(publicDir);
  const abs = path.resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return void res.end();
  }

  const pathname = req.url === "/" || req.url === "" ? "/index.html" : req.url;
  const filePath = safePublicPath(pathname);

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const cache =
      ext === ".html" || ext === ".js" || ext === ".css"
        ? "no-store, max-age=0"
        : "public, max-age=3600";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cache,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Kumiko served at http://127.0.0.1:${PORT}`);
});
