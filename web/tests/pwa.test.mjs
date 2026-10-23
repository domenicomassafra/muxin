import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const publicDir = join(import.meta.dirname, '..', 'public');
const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'));
const worker = readFileSync(join(publicDir, 'sw.js'), 'utf8');

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
    const png = readFileSync(join(publicDir, icon.src.replace(/^\//, '')));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
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
    ok: true, type: 'basic', headers: new Headers({ 'Content-Type': 'text/javascript' }),
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
  const json = 'https://plancia.example.test/assets/apiData-abc12345.js';
  response = { ...response, headers: new Headers({ 'Content-Type': 'application/json' }) };
  await dispatch(json, { destination: 'script' });
  assert.equal(stored.size, 1);
});
