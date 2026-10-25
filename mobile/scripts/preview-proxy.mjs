// Browser preview helper (see ../PREVIEW.md). Sits between the Expo web build and the backend:
// answers CORS, logs in once and adds the session Cookie a browser cannot set itself, and serves
// /compare, a page with the PWA and the mobile build side by side at phone widths.
import http from 'node:http';

const [port, backend, user, password] = [
  process.env.PROXY_PORT, process.env.BACKEND_URL, process.env.PREVIEW_USER, process.env.PREVIEW_PASSWORD,
];
const expo = process.env.EXPO_URL;
const pwa = process.env.PWA_URL;

const login = await fetch(`${backend}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: user, password }),
});
if (!login.ok) throw new Error(`preview login failed: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];

const frame = (label, width, src) =>
  `<figure><figcaption>${label} ${width}px</figcaption><iframe width="${width}" height="760" src="${src}"></iframe></figure>`;
const compare = `<!doctype html><meta charset="utf-8"><title>Preview</title>
<style>body{margin:12px;background:#222;color:#ccc;font:12px sans-serif;display:flex;gap:16px}iframe{border:0;background:#0d0d0d}</style>
${frame('PWA', 390, pwa)}${frame('Mobile', 390, expo)}${frame('Mobile', 320, expo)}`;

http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  };
  if (req.url === '/compare') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(compare);
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  const body = await new Promise((done) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => done(Buffer.concat(chunks)));
  });
  const upstream = await fetch(backend + req.url, {
    method: req.method,
    headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json', Cookie: cookie },
    body: body.length ? body : undefined,
    redirect: 'manual',
  });
  res.writeHead(upstream.status, { ...cors, 'Content-Type': upstream.headers.get('content-type') ?? 'text/plain' });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}).listen(port, () => console.log(`preview proxy on :${port}, compare page at /compare`));
