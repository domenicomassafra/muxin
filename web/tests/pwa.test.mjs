import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const publicDir = join(import.meta.dirname, '..', 'public');
const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'));
const worker = readFileSync(join(publicDir, 'sw.js'), 'utf8');
const index = readFileSync(join(publicDir, '..', 'index.html'), 'utf8');

function runtime(fetchImpl = async () => ({
  ok: true,
  type: 'basic',
  headers: new Headers({ 'Content-Type': 'text/javascript' }),
  clone() { return this; },
})) {
  const handlers = new Map();
  const stored = new Map();
  const cache = {
    match: async (request) => stored.get(request.url),
    put: async (request, value) => { stored.set(request.url, value); },
  };
  const caches = {
    keys: async () => ['plancia-static-legacy', 'a-different-app'],
    delete: async () => true,
    open: async (name) => {
      assert.equal(name, 'plancia-static-v1');
      return cache;
    },
  };
  const self = {
    location: { origin: 'https://plancia.example.test' },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  runInNewContext(worker, { self, caches, fetch: fetchImpl, URL, Response, Headers, Promise });
  const dispatch = (url, extras = {}) => {
    let result;
    const event = {
      request: { url, method: 'GET', mode: 'cors', destination: '', ...extras },
      respondWith(value) { result = value; },
    };
    handlers.get('fetch')(event);
    return result;
  };
  return { dispatch, stored };
}

test('manifest starts at the hash-routed shell and has 192/512 PNG icons', () => {
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/#overview');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
    assert.equal(icon?.type, 'image/png');
    assert.match(icon.src, new RegExp(`^/assets/plancia-icon-${size}-[a-f0-9]{8}\\.png$`));
    const png = readFileSync(join(publicDir, icon.src.replace(/^\//, '')));
    assert.equal(icon.src.match(/-([a-f0-9]{8})\.png$/)?.[1], createHash('sha256').update(png).digest('hex').slice(0, 8));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('PWA HTML, icons and registration match the existing ControlCenter static route allowlist', () => {
  // Current owner backend server.py serves /manifest.webmanifest, /plancia-icon.svg,
  // and /assets/* with a suffix allowlist. It does NOT yet serve /sw.js.
  assert.match(index, /<title>Plancia<\/title>/);
  assert.match(index, /name="theme-color" content="#111111"/);
  assert.match(index, /src="\/assets\/pwa-register-[a-f0-9]{8}\.js"/);
  assert.match(index, /href="\/assets\/plancia-icon-192-[a-f0-9]{8}\.png"/);
  assert.match(index, /href="\/plancia-icon\.svg"/);
  assert.match(index, /href="\/manifest\.webmanifest"/);

  const allowedAssets = /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|png|svg)$/;
  const registerPath = index.match(/src="(\/assets\/pwa-register-[a-f0-9]{8}\.js)"/)?.[1];
  assert.ok(registerPath);
  assert.match(registerPath, allowedAssets);
  for (const icon of manifest.icons) {
    assert.ok(allowedAssets.test(icon.src) || icon.src === '/plancia-icon.svg', icon.src);
  }
  const register = readFileSync(join(publicDir, registerPath.slice(1)), 'utf8');
  assert.equal(registerPath.match(/-([a-f0-9]{8})\.js$/)?.[1], createHash('sha256').update(register).digest('hex').slice(0, 8));
  assert.match(register, /serviceWorker\.register\('\/sw\.js',\s*\{\s*scope:\s*'\/'\s*\}\)/);
  assert.match(register, /location\.protocol === 'https:'|location\.hostname === 'localhost'/);
  assert.match(worker, /const CACHE_NAME/);
  // Root scope requires the pending, external ControlCenter /sw.js route.
});

test('API, sessions, documents, icons and other origins never enter Cache Storage', () => {
  const { dispatch, stored } = runtime();
  const urls = [
    '/api/v1/session', '/api/fleet', '/agents', '/notes/private',
    '/workspace', '/manifest.webmanifest', '/plancia-icon-512.png',
  ];
  for (const path of urls) {
    assert.equal(dispatch(`https://plancia.example.test${path}`, { destination: 'script' }), undefined, path);
    assert.equal(dispatch(`https://plancia.example.test${path}`, { mode: 'navigate' }), undefined, path);
  }
  assert.equal(dispatch('https://another.example.test/assets/main-12345678.js', { destination: 'script' }), undefined);
  assert.equal(dispatch('https://plancia.example.test/assets/main-12345678.js', { destination: 'script', method: 'POST' }), undefined);
  assert.equal(stored.size, 0);
});

test('offline root gets a neutral notice, never cached authenticated HTML', async () => {
  const { dispatch, stored } = runtime(async (_request, options) => {
    assert.equal(options.cache, 'no-store');
    throw new Error('offline');
  });
  const response = await dispatch('https://plancia.example.test/#workspace', { mode: 'navigate' });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /informazioni operative non sono disponibili offline/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(stored.size, 0);
});

test('only public fingerprinted JavaScript/CSS with public caching headers are cached', async () => {
  let response = {
    ok: true, type: 'basic', headers: new Headers({ 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=31536000, immutable' }),
    clone() { return this; },
  };
  const { dispatch, stored } = runtime(async () => response);
  const js = 'https://plancia.example.test/assets/main-abc12345.js';
  await dispatch(js, { destination: 'script' });
  assert.equal(stored.size, 1);
  const css = 'https://plancia.example.test/assets/main-def67890.css';
  response = { ...response, headers: new Headers({ 'Content-Type': 'text/css', 'Cache-Control': 'private, no-store' }) };
  await dispatch(css, { destination: 'style' });
  assert.equal(stored.size, 1);
  const unmarked = 'https://plancia.example.test/assets/extra-hashed123.js';
  response = { ...response, headers: new Headers({ 'Content-Type': 'text/javascript' }) };
  await dispatch(unmarked, { destination: 'script' });
  assert.equal(stored.size, 1, 'Only explicitly public assets may be cached');
  const json = 'https://plancia.example.test/assets/apiData-abc12345.js';
  response = { ...response, headers: new Headers({ 'Content-Type': 'application/json' }) };
  await dispatch(json, { destination: 'script' });
  assert.equal(stored.size, 1);
});
