#!/usr/bin/env node
/**
 * Dev wrapper: runs `wxt` + the dev-config server side by side, prefixes
 * their stdout/stderr, and forwards Ctrl-C to both. Zero deps.
 *
 * Usage (from extension/):
 *   npm run dev          # firefox
 *   npm run dev:chrome   # chrome
 *
 * Internals:
 *   - argv[2] is passed to wxt as the build target ("firefox" | "chrome").
 *   - Set KOKO_DEV_NO_CONFIG=1 to skip the config server.
 *   - Set KOKO_DEV_PORT to override the config server port.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const EXTENSION_DIR = join(REPO_ROOT, 'extension');

const target = process.argv[2] === 'chrome' ? 'chrome' : 'firefox';
const skipConfig = process.env.KOKO_DEV_NO_CONFIG === '1';

const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[2m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_MAGENTA = '\x1b[35m';

const children = [];

function prefixStream(stream, prefix, color) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(`${color}[${prefix}]${ANSI_RESET} ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buf.length > 0) {
      process.stdout.write(`${color}[${prefix}]${ANSI_RESET} ${buf}\n`);
    }
  });
}

function spawnPrefixed(prefix, color, cmd, args, opts) {
  // eslint-disable-next-line no-console
  console.log(`${ANSI_DIM}[dev] starting ${prefix}: ${cmd} ${args.join(' ')}${ANSI_RESET}`);
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  prefixStream(child.stdout, prefix, color);
  prefixStream(child.stderr, prefix, color);
  child.on('exit', (code, signal) => {
    process.stdout.write(`${color}[${prefix}]${ANSI_RESET} exited (code=${code}, signal=${signal})\n`);
    // If one child dies on its own, take the rest down too.
    for (const c of children) {
      if (c !== child && c.exitCode == null) c.kill('SIGTERM');
    }
    if (code != null) process.exitCode = code;
  });
  children.push(child);
  return child;
}

// wxt dev (extension)
spawnPrefixed('wxt', ANSI_CYAN, 'npx', ['wxt', '-b', target], { cwd: EXTENSION_DIR });

// dev-config server (optional)
if (!skipConfig) {
  spawnPrefixed('config', ANSI_MAGENTA, 'node', [join(__dirname, 'dev-config-server.mjs')], {
    cwd: REPO_ROOT,
  });
}

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${ANSI_DIM}[dev] received ${signal}, stopping…${ANSI_RESET}`);
  for (const c of children) {
    if (c.exitCode == null) c.kill(signal);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
