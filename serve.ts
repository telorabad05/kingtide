// A tiny static server for game/, so Vice Harbor can be played locally:
//   node serve.ts [--port 8080] [--host 127.0.0.1]   then open http://localhost:8080
// Standard library only; refuses paths outside game/. HTML is served no-store
// so a fresh build is never masked by a stale cached page during development.
// Everything else carries an ETag (v3.1): a returning browser revalidates with
// If-None-Match and gets a 304 instead of re-downloading the three.js build.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;
const hostIndex = args.indexOf('--host');
const host = hostIndex === -1 ? '127.0.0.1' : String(args[hostIndex + 1]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, rel === '/' || rel === '.' ? 'index.html' : rel);
    if (!file.startsWith(root + sep) && file !== root) { response.writeHead(403); return response.end('forbidden'); }
    const stat = statSync(file);
    if (stat.isDirectory()) return serveFile(join(file, 'index.html'), response, request);   // a folder serves its index page
    if (!stat.isFile()) { response.writeHead(404); return response.end('not found'); }
    return serveFile(file, response, request);
  } catch {
    response.writeHead(404); response.end('not found');
  }
}).listen(port, host, () => console.log(`Vice Harbor at http://${host}:${port}`));

function serveFile(file, response, request) {
  const stat = statSync(file);
  if (!stat.isFile()) { response.writeHead(404); return response.end('not found'); }
  const type = MIME[extname(file)] || 'application/octet-stream';
  const isHtml = type.startsWith('text/html');
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  if (!isHtml && request.headers['if-none-match'] === etag) {
    response.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=3600' });
    return response.end();
  }
  response.writeHead(200, {
    'Content-Type': type, 'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-store' : 'public, max-age=3600',
    ETag: etag, 'Last-Modified': stat.mtime.toUTCString(),
  });
  if (request.method === 'HEAD') return response.end();
  createReadStream(file).pipe(response);
}
