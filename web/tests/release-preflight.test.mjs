import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const webRoot = join(import.meta.dirname, '..');
const publicRoot = join(webRoot, 'public');
const checker = join(webRoot, 'scripts', 'check-release.mjs');
const sourceSha = 'a'.repeat(40);

function fixture(t) {
  const dist = mkdtempSync(join(tmpdir(), 'plancia-release-check-'));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  mkdirSync(join(dist, 'assets'));
  for (const path of ['manifest.webmanifest', 'plancia-icon.svg', 'sw.js']) {
    cpSync(join(publicRoot, path), join(dist, path));
  }
  for (const name of [
    'pwa-register-42d43be5.js',
    'plancia-icon-192-6e349dd3.png',
    'plancia-icon-512-1bd9ec58.png',
  ]) cpSync(join(publicRoot, 'assets', name), join(dist, 'assets', name));
  writeFileSync(join(dist, 'assets', 'index-ABCDEFGH.js'), 'console.log("release");');
  writeFileSync(join(dist, 'assets', 'index-ABCDEFGH.css'), 'body{margin:0}');
  writeFileSync(join(dist, 'index.html'), `<!doctype html><html><head>
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" href="/plancia-icon.svg">
    <link rel="apple-touch-icon" href="/assets/plancia-icon-192-6e349dd3.png">
    <link rel="stylesheet" href="/assets/index-ABCDEFGH.css">
    <script src="/assets/pwa-register-42d43be5.js"></script>
    <script type="module" src="/assets/index-ABCDEFGH.js"></script>
    </head><body></body></html>`);
  return dist;
}

function check(dist) {
  return spawnSync(process.execPath, [checker, '--dist', dist, '--source-sha', sourceSha], { encoding: 'utf8' });
}

test('a complete bundle reports the source commit and SHA-256 for every file', (t) => {
  const result = check(fixture(t));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`source_sha=${sourceSha}`));
  assert.match(result.stdout, /sha256=[a-f0-9]{64} sw\.js/);
  assert.match(result.stdout, /sha256=[a-f0-9]{64} assets\/plancia-icon-512-1bd9ec58\.png/);
  assert.match(result.stdout, /files=9/);
});

test('a missing service worker fails the release gate', (t) => {
  const dist = fixture(t);
  unlinkSync(join(dist, 'sw.js'));
  const result = check(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sw\.js/);
});

test('a missing manifest icon fails the release gate', (t) => {
  const dist = fixture(t);
  unlinkSync(join(dist, 'assets', 'plancia-icon-512-1bd9ec58.png'));
  const result = check(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plancia-icon-512/);
});

test('a modified fingerprinted icon fails the release gate', (t) => {
  const dist = fixture(t);
  writeFileSync(join(dist, 'assets', 'plancia-icon-192-6e349dd3.png'), 'tampered');
  const result = check(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fingerprint/);
});

test('a missing built javascript asset fails the release gate', (t) => {
  const dist = fixture(t);
  unlinkSync(join(dist, 'assets', 'index-ABCDEFGH.js'));
  const result = check(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index-ABCDEFGH\.js/);
});
