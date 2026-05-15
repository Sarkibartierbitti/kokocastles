#!/usr/bin/env node
/**
 * Dev-only config server for kokocastles extension.
 *
 * Listens on http://localhost:5176 and persists the extension's user-config
 * bundle to `.dev-config/koko-config.json` at the repo root. The extension
 * Settings page calls this server so dev iterations don't need the OS file
 * picker.
 *
 * Usage:
 *   node scripts/dev-config-server.mjs
 *
 * Or via the npm helper inside `extension/`:
 *   npm run dev:config
 *
 * Endpoints (all CORS-open for extension origins):
 *   GET  /load    → 200 { version, exportedAt, entries } | 404 if no file yet
 *   POST /save    → 200 { ok: true, bytes, path }  (body = ConfigBundle JSON)
 *   GET  /health  → 200 { ok: true }
 *
 * Storage location:
 *   <repo-root>/.dev-config/koko-config.json
 *   (gitignored — never commit secrets)
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STORAGE_DIR = join(REPO_ROOT, '.dev-config');
const STORAGE_FILE = join(STORAGE_DIR, 'koko-config.json');
const PORT = Number(process.env.KOKO_DEV_PORT ?? 5176);
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function handleLoad(res) {
  try {
    const txt = await readFile(STORAGE_FILE, 'utf-8');
    res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders() });
    res.end(txt);
  } catch (e) {
    if (e?.code === 'ENOENT') {
      return jsonResponse(res, 404, { error: 'no config saved yet', path: STORAGE_FILE });
    }
    return jsonResponse(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

async function handleSave(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return jsonResponse(res, 413, { error: e instanceof Error ? e.message : String(e) });
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return jsonResponse(res, 400, { error: 'invalid JSON: ' + (e instanceof Error ? e.message : String(e)) });
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.entries) {
    return jsonResponse(res, 400, { error: 'expected { version:1, entries:{...} } bundle' });
  }
  for (const k of Object.keys(parsed.entries)) {
    if (!k.startsWith('koko.')) {
      return jsonResponse(res, 400, { error: `rejected non-koko key: ${k}` });
    }
  }
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    const pretty = JSON.stringify(parsed, null, 2);
    const tmp = STORAGE_FILE + '.tmp';
    await writeFile(tmp, pretty, 'utf-8');
    await rename(tmp, STORAGE_FILE);
    return jsonResponse(res, 200, { ok: true, bytes: pretty.length, path: STORAGE_FILE });
  } catch (e) {
    return jsonResponse(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    return jsonResponse(res, 200, { ok: true, file: STORAGE_FILE });
  }
  if (req.method === 'GET' && req.url === '/load') {
    return handleLoad(res);
  }
  if (req.method === 'POST' && req.url === '/save') {
    return handleSave(req, res);
  }
  return jsonResponse(res, 404, { error: 'not found' });
});

server.on('error', async (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // Probe existing process — if it's ours (responds to /health correctly), reuse and exit 0.
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      const body = await res.json();
      if (res.ok && body && body.ok) {
        // eslint-disable-next-line no-console
        console.log(`[koko config-server] port ${PORT} already serving — reusing existing instance.`);
        process.exit(0);
      }
    } catch {
      // probe failed — fall through to the hard error below
    }
    // eslint-disable-next-line no-console
    console.error(
      `[koko config-server] port ${PORT} in use by a non-koko process. ` +
        `Free it or set KOKO_DEV_PORT to another port.`
    );
    process.exit(1);
  }
  // Unknown error — re-throw to crash loud.
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`[koko config-server] listening on http://127.0.0.1:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[koko config-server] storage: ${STORAGE_FILE}`);
});

process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('\n[koko config-server] shutting down');
  server.close(() => process.exit(0));
});
