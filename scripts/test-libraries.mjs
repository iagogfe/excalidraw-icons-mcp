// Unit tests for dist/libraries.js — no network. Run: npm run test:libraries
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { instantiateLibraryItem, statsKey, searchManifest, searchItems, CURATED_LIBRARIES, getManifest, getStats, loadLibrary, searchLibraryItems, getItemByRef } from '../dist/libraries.js';

const lib = JSON.parse(fs.readFileSync(new URL('./fixtures/test-library.excalidrawlib', import.meta.url), 'utf8'));
const dbItem = lib.libraryItems[0];
const imgItem = lib.libraryItems[1];
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('instantiate places bbox at target position', () => {
  const r = instantiateLibraryItem(dbItem, 500, 600);
  // fixture bbox: x 100..300, y 200..320 => 200x120
  assert.deepEqual(r.bbox, { x: 500, y: 600, width: 200, height: 120 });
  const rect = r.elements.find(e => e.type === 'rectangle');
  assert.equal(rect.x, 500); assert.equal(rect.y, 600);
});

test('instantiate regenerates unique ids and remaps references', () => {
  const r = instantiateLibraryItem(dbItem, 0, 0);
  const ids = r.elements.map(e => e.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(!ids.includes('el1') && !ids.includes('el2') && !ids.includes('el3'));
  const rect = r.elements.find(e => e.type === 'rectangle');
  const text = r.elements.find(e => e.type === 'text');
  assert.equal(text.containerId, rect.id);
  assert.equal(rect.boundElements[0].id, text.id);
});

test('instantiate remaps groupIds and adds one shared group', () => {
  const r = instantiateLibraryItem(dbItem, 0, 0);
  for (const el of r.elements) {
    assert.equal(el.groupIds.length, 2); // remapped gA + shared wrapper
    assert.ok(!el.groupIds.includes('gA'));
  }
  const shared = r.elements[0].groupIds[1];
  assert.ok(r.elements.every(el => el.groupIds[1] === shared));
});

test('targetWidth scales uniformly', () => {
  const r = instantiateLibraryItem(dbItem, 0, 0, 400); // scale 2
  assert.equal(r.bbox.width, 400); assert.equal(r.bbox.height, 240);
  const rect = r.elements.find(e => e.type === 'rectangle');
  assert.equal(rect.width, 400); assert.equal(rect.height, 200);
  const text = r.elements.find(e => e.type === 'text');
  assert.equal(text.fontSize, 40);
  const line = r.elements.find(e => e.type === 'line');
  assert.deepEqual(line.points, [[0, 0], [400, 0]]);
});

test('anchor is the largest shape element', () => {
  const r = instantiateLibraryItem(dbItem, 0, 0);
  const rect = r.elements.find(e => e.type === 'rectangle');
  assert.equal(r.anchorId, rect.id);
});

test('image items are rejected', () => {
  assert.throws(() => instantiateLibraryItem(imgItem, 0, 0), /image/i);
});

test('statsKey converts source to stats.json key', () => {
  assert.equal(statsKey('childishgirl/aws-architecture-icons.excalidrawlib'), 'childishgirl-aws-architecture-icons');
});

test('searchManifest ranks matches by downloads', () => {
  const manifest = [
    { name: 'AWS Architecture Icons', description: 'aws icons', source: 'a/aws.excalidrawlib', version: 1, id: '1' },
    { name: 'Stick figures', description: 'people', source: 'b/stick.excalidrawlib', version: 1, id: '2' },
    { name: 'AWS Serverless', description: 'lambda etc', source: 'c/aws-sls.excalidrawlib', version: 1, id: '3' }
  ];
  const stats = { 'a-aws': { total: 100 }, 'c-aws-sls': { total: 900 } };
  const hits = searchManifest(manifest, stats, 'aws');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].source, 'c/aws-sls.excalidrawlib'); // more downloads first
  assert.equal(hits[0].downloads, 900);
});

test('searchItems matches item names, skips unnamed', () => {
  const lib = JSON.parse(fs.readFileSync(new URL('./fixtures/test-library.excalidrawlib', import.meta.url), 'utf8'));
  const hits = searchItems(lib, { source: 's/x.excalidrawlib', name: 'X' }, 5, 'db');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].itemName, 'Test DB');
  assert.equal(hits[0].ref, 's/x.excalidrawlib#0');
  assert.equal(hits[0].elementCount, 3);
  assert.equal(searchItems(lib, { source: 's/x.excalidrawlib', name: 'X' }, 5, 'zzz').length, 0);
  // unnamed items must be skipped even when their elements would match
  const unnamedLib = { type: 'excalidrawlib', version: 2, libraryItems: [
    { status: 'published', elements: [{ id: 'u1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }] }
  ] };
  assert.equal(searchItems(unnamedLib, { source: 'u/u.excalidrawlib', name: 'U' }, 0, 'rectangle').length, 0);
});

test('curated set covers the main technical domains', () => {
  const all = Object.values(CURATED_LIBRARIES).flat().join(' ');
  for (const kw of ['aws', 'azure', 'gcp', 'uml', 'network']) assert.ok(all.includes(kw), kw);
});

const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-exca-libtest-'));
process.env.EXCALIDRAW_LIBRARY_CACHE_DIR = tmpCache;
const fixtureLib = JSON.parse(fs.readFileSync(new URL('./fixtures/test-library.excalidrawlib', import.meta.url), 'utf8'));
const manifestFixture = [{ name: 'Test Library', description: 'aws test icons', source: 'tester/test-lib.excalidrawlib', version: 3, id: 't1' }];
fs.writeFileSync(path.join(tmpCache, 'manifest.json'), JSON.stringify(manifestFixture));
fs.writeFileSync(path.join(tmpCache, 'stats.json'), JSON.stringify({ 'tester-test-lib': { total: 42 } }));
fs.writeFileSync(path.join(tmpCache, 'lib-tester-test-lib.json'), JSON.stringify({ manifestVersion: 3, library: fixtureLib }));

test('getManifest/getStats read from fresh cache without network', async () => {
  assert.deepEqual(await getManifest(), manifestFixture);
  assert.equal((await getStats())['tester-test-lib'].total, 42);
});

test('loadLibrary returns cached lib when manifest version matches', async () => {
  const lib = await loadLibrary(manifestFixture[0]);
  assert.equal(lib.libraryItems.length, 2);
});

test('searchLibraryItems finds items across cached libraries', async () => {
  const results = await searchLibraryItems('test db');
  assert.ok(results.some(r => r.itemName === 'Test DB' && r.ref === 'tester/test-lib.excalidrawlib#0'));
});

test('getItemByRef resolves and rejects bad refs', async () => {
  const { item } = await getItemByRef('tester/test-lib.excalidrawlib#0');
  assert.equal(item.name, 'Test DB');
  await assert.rejects(() => getItemByRef('nope/missing.excalidrawlib#0'), /not found/i);
});

for (const [name, fn] of tests) { await fn(); passed++; console.log(`ok - ${name}`); }
console.log(`\n${passed} tests passed`);
