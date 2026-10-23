#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The ControlCenter runtime preflight checks index assets. The Plancia source
// must also attest every PWA dependency before a bundle can be promoted.
function fail(reason) {
  throw new Error(`release preflight: ${reason}`);
}

function args(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--dist', '--source-sha'].includes(argv[i]) || !argv[i + 1]) fail('expected --dist DIR --source-sha COMMIT');
    options[argv[i]] = argv[i + 1];
  }
  if (!/^[a-f0-9]{40}$/.test(options['--source-sha'] || '')) fail('a full 40-character source SHA is required');
  return { dist: resolve(options['--dist'] || new URL('../dist/', import.meta.url).pathname), sourceSha: options['--source-sha'] };
}

function main() {
  const { dist, sourceSha } = args(process.argv.slice(2));
  const files = new Map();

  function load(relative) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.startsWith('/') || relative.split('/').includes('..')) {
      fail(`unsafe asset path: ${relative}`);
    }
    const path = join(dist, relative);
    let bytes;
    try {
      if (!statSync(path).isFile()) fail(`not a regular file: ${relative}`);
      bytes = readFileSync(path);
    } catch (error) {
      fail(`missing asset ${relative}: ${error.message}`);
    }
    if (!bytes.length) fail(`empty asset: ${relative}`);
    files.set(relative, createHash('sha256').update(bytes).digest('hex'));
    return bytes;
  }

  const index = load('index.html').toString('utf8');
  if (/\/src\/main\.(?:tsx|ts|jsx|js)/.test(index)) fail('development index is not a build');
  if (!index.includes('/manifest.webmanifest')) fail('index does not link the manifest');
  const manifest = JSON.parse(load('manifest.webmanifest').toString('utf8'));
  if (manifest.scope !== '/' || !manifest.start_url?.startsWith('/#')) fail('incorrect PWA scope or start URL');
  load('sw.js');
  load('plancia-icon.svg');

  const paths = [...index.matchAll(/(?:src|href)=["'](\/assets\/[A-Za-z0-9_.-]+)["']/g)].map((match) => match[1].slice(1));
  if (!paths.some((path) => path.endsWith('.js'))) fail('index references no built JavaScript');
  for (const path of paths) load(path);

  const register = paths.find((path) => /^assets\/pwa-register-[a-f0-9]{8}\.js$/.test(path));
  if (!register || !/serviceWorker\.register\(['"]\/sw\.js['"]/.test(load(register).toString('utf8'))) {
    fail('missing root service worker registration');
  }

  if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.sizes === '192x192') ||
      !manifest.icons.some((icon) => icon.sizes === '512x512')) fail('manifest lacks both PNG icons');
  for (const icon of manifest.icons) {
    const path = icon.src?.slice(1);
    if (!icon.src?.startsWith('/') || !(path?.startsWith('assets/') || path === 'plancia-icon.svg')) {
      fail(`unsafe manifest icon: ${icon.src}`);
    }
    load(path);
    const fingerprint = path.match(/^assets\/(?:plancia-icon-(?:192|512)|pwa-register)-([a-f0-9]{8})\.(?:png|js)$/)?.[1];
    if (path.endsWith('.png') && (!fingerprint || files.get(path).slice(0, 8) !== fingerprint)) {
      fail(`wrong fingerprint: ${path}`);
    }
  }
  const registrationFingerprint = register.match(/-([a-f0-9]{8})\.js$/)?.[1];
  if (files.get(register).slice(0, 8) !== registrationFingerprint) fail(`wrong fingerprint: ${register}`);

  function walk(relative = '') {
    for (const entry of readdirSync(join(dist, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) load(path);
      else fail(`nonregular dist entry: ${path}`);
    }
  }
  walk();
  console.log(`source_sha=${sourceSha}`);
  for (const [file, sha] of [...files].sort(([a], [b]) => a.localeCompare(b))) console.log(`sha256=${sha} ${file}`);
  console.log(`files=${files.size}`);
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
