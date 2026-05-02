#!/usr/bin/env node
// scripts/setup-proxy.mjs
// Ensure VITE_PROXY_URL is set in .env.local. Deploys the Cloudflare Worker once if absent.
// Idempotent: re-runs are no-ops when already configured.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(repoRoot, '.env.local');
const proxyDir = resolve(repoRoot, 'proxy');
const KEY = 'VITE_PROXY_URL';
const WORKER_URL_RE = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.workers\.dev/i;

function readEnv() {
  if (!existsSync(envFile)) return { lines: [], map: {} };
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  const map = {};
  for (const l of lines) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2];
  }
  return { lines, map };
}

function writeEnv(lines, key, value) {
  let found = false;
  const out = lines.map((l) => {
    if (l.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!found) {
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push(`${key}=${value}`);
  }
  writeFileSync(envFile, out.join('\n'));
}

function info(msg) { process.stdout.write(`[setup-proxy] ${msg}\n`); }
function warn(msg) { process.stderr.write(`[setup-proxy] ${msg}\n`); }

const { lines, map } = readEnv();
const existing = (map[KEY] ?? '').trim();
if (existing && WORKER_URL_RE.test(existing)) {
  info(`${KEY} already set (${existing}). Skipping deploy.`);
  process.exit(0);
}

info(`${KEY} missing. Running 'npx wrangler deploy' in proxy/...`);
const res = spawnSync('npx', ['wrangler', 'deploy'], {
  cwd: proxyDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  encoding: 'utf8',
});

const stdout = res.stdout ?? '';
const stderr = res.stderr ?? '';
process.stdout.write(stdout);
process.stderr.write(stderr);

if (res.status !== 0) {
  warn('wrangler deploy failed. Common causes:');
  warn('  - Not logged in: run `npx wrangler login` then retry `npm run dev`');
  warn('  - No Cloudflare account: sign up at https://cloudflare.com (free tier OK)');
  warn(`Skipping ${KEY} setup. Transcript fetch will fall back to manual paste.`);
  process.exit(0); // do NOT block dev server start
}

const combined = stdout + '\n' + stderr;
const match = combined.match(WORKER_URL_RE);
if (!match) {
  warn('Could not parse workers.dev URL from wrangler output. Set VITE_PROXY_URL in .env.local manually.');
  process.exit(0);
}
const url = match[0];
writeEnv(lines, KEY, url);
info(`Wrote ${KEY}=${url} to .env.local`);
info('Restart dev server if it was already running before this script.');
