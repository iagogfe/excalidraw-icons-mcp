# Excalidraw Libraries Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI search community Excalidraw libraries (libraries.excalidraw.com) and insert official icons (e.g. AWS RDS) into the canvas instead of drawing generic shapes.

**Architecture:** New `src/libraries.ts` module holds pure functions (search ranking, item instantiation) and I/O (manifest/stats/library fetch with disk cache). Two new MCP tools in `src/index.ts` (`search_library_items`, `insert_library_item`) call into it; insertion reuses the existing `batchCreateElementsOnCanvas` sync. One minimal change in `src/server.ts`: `CreateElementSchema` becomes `.passthrough()` so library-element props (`angle`, `containerId`, `textAlign`, …) survive the zod parse (spec deviation, justified — without it icons lose fidelity).

**Tech Stack:** TypeScript (ESM, `npx tsc`), zod, `node-fetch` (already a dependency), node:assert for tests. No new dependencies.

## Global Constraints

- Node >= 18 (engines field); ESM only (`"type": "module"`); imports of local files use `.js` extension (TS ESM style, see `src/index.ts`).
- No new npm dependencies.
- Cache dir: `process.env.EXCALIDRAW_LIBRARY_CACHE_DIR || ~/.cache/mcp-excalidraw/libraries`; manifest/stats TTL 7 days; stale cache used when offline.
- v1 rejects items containing `type: "image"` elements (clear error).
- All code, comments and commit messages in English. Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verify with `npm run type-check` (must be clean) before every commit.
- Work on branch `feat/excalidraw-libraries` off `main`.

---

### Task 1: CreateElementSchema passthrough (server)

Library elements carry props the current schema strips (zod default strips unknown keys): `angle`, `seed`, `containerId`, `textAlign`, `verticalAlign`, `pressures`, `simulatePressure`, etc. Stripping breaks icon fidelity. Fix: `.passthrough()`.

**Files:**
- Modify: `src/server.ts:115-168` (the `CreateElementSchema` object)

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/elements/batch` preserves unknown element props (later tasks rely on this when syncing instantiated library elements).

- [ ] **Step 1: Create branch**

```bash
cd /home/iago/projeto/mcp_excalidraw
git checkout main && git pull origin main
git checkout -b feat/excalidraw-libraries
```

- [ ] **Step 2: Apply the schema change**

In `src/server.ts`, the schema currently ends:

```ts
  // Image-specific properties
  fileId: z.string().optional(),
  status: z.string().optional(),
  scale: z.tuple([z.number(), z.number()]).optional(),
});
```

Change the closing to `.passthrough()` and add a comment:

```ts
  // Image-specific properties
  fileId: z.string().optional(),
  status: z.string().optional(),
  scale: z.tuple([z.number(), z.number()]).optional(),
  // Passthrough: library items and Excalidraw-native elements carry many more
  // props (angle, seed, containerId, textAlign, pressures, ...). Validate the
  // essentials above but preserve everything else instead of stripping it.
}).passthrough();
```

- [ ] **Step 3: Build and verify roundtrip preserves unknown props**

```bash
cd /home/iago/projeto/mcp_excalidraw
npm run build:server
cat > /tmp/passthrough-test.mjs <<'EOF'
import { spawn } from 'node:child_process';
import net from 'node:net';
const port = await new Promise(r => { const s = net.createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const srv = spawn('node', ['dist/server.js'], { env: {...process.env, PORT: String(port)}, stdio: ['ignore','ignore','inherit'] });
const wait = async (f,t=10000)=>{const s=Date.now();while(Date.now()-s<t){try{if(await f())return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('timeout')};
await wait(async()=>{const r=await fetch(`http://127.0.0.1:${port}/api/elements`).catch(()=>null);return r&&r.ok});
const el = { id:'pt1', type:'rectangle', x:10, y:10, width:120, height:60, angle:0.5, textAlign:'center', customProp:'kept' };
await fetch(`http://127.0.0.1:${port}/api/elements/batch`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({elements:[el]}) });
const back = (await (await fetch(`http://127.0.0.1:${port}/api/elements/pt1`)).json()).element;
srv.kill('SIGKILL');
if (back.angle === 0.5 && back.textAlign === 'center' && back.customProp === 'kept') console.log('PASSTHROUGH OK');
else { console.error('PASSTHROUGH FAIL', back); process.exit(1); }
EOF
node /tmp/passthrough-test.mjs
```

Expected: `PASSTHROUGH OK`

- [ ] **Step 4: Type-check and commit**

```bash
npm run type-check
git add src/server.ts
git commit -m "fix(server): preserve unknown element props in batch create

CreateElementSchema stripped props it did not list (zod default), losing
angle/containerId/textAlign etc. Needed for library items whose elements
carry the full Excalidraw prop set.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `instantiateLibraryItem` (pure) + fixture + unit tests

**Files:**
- Create: `src/libraries.ts` (types + instantiation only in this task)
- Create: `scripts/fixtures/test-library.excalidrawlib`
- Create: `scripts/test-libraries.mjs`
- Modify: `package.json` (add `test:libraries` script)

**Interfaces:**
- Consumes: `generateId` from `./types.js` (exists at `src/types.ts:317`).
- Produces (later tasks import these from `./libraries.js`):
  - `interface LibraryItem { id?: string; name?: string; status?: string; elements: any[] }`
  - `interface ExcalidrawLibrary { type: string; version: number; libraryItems: LibraryItem[] }`
  - `interface InstantiateResult { elements: any[]; anchorId: string; bbox: { x: number; y: number; width: number; height: number } }`
  - `function instantiateLibraryItem(item: LibraryItem, x: number, y: number, targetWidth?: number): InstantiateResult`

- [ ] **Step 1: Write the fixture**

Create `scripts/fixtures/test-library.excalidrawlib`:

```json
{
  "type": "excalidrawlib",
  "version": 2,
  "libraryItems": [
    {
      "id": "item1",
      "status": "published",
      "name": "Test DB",
      "elements": [
        { "id": "el1", "type": "rectangle", "x": 100, "y": 200, "width": 200, "height": 100, "angle": 0, "groupIds": ["gA"], "boundElements": [{ "id": "el2", "type": "text" }] },
        { "id": "el2", "type": "text", "x": 150, "y": 230, "width": 100, "height": 40, "fontSize": 20, "text": "DB", "containerId": "el1", "groupIds": ["gA"] },
        { "id": "el3", "type": "line", "x": 100, "y": 320, "width": 200, "height": 0, "points": [[0, 0], [200, 0]], "groupIds": ["gA"] }
      ]
    },
    {
      "id": "item2",
      "status": "published",
      "name": "Image Item",
      "elements": [
        { "id": "el4", "type": "image", "x": 0, "y": 0, "width": 50, "height": 50, "fileId": "f1" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/test-libraries.mjs`:

```js
// Unit tests for dist/libraries.js — no network. Run: npm run test:libraries
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { instantiateLibraryItem } from '../dist/libraries.js';

const lib = JSON.parse(fs.readFileSync(new URL('./fixtures/test-library.excalidrawlib', import.meta.url), 'utf8'));
const dbItem = lib.libraryItems[0];
const imgItem = lib.libraryItems[1];
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

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

console.log(`\n${passed} tests passed`);
```

Add to `package.json` scripts (after `"test:bind"`):

```json
    "test:libraries": "npm run build:server && node scripts/test-libraries.mjs",
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run test:libraries
```

Expected: FAIL — `Cannot find module '../dist/libraries.js'`

- [ ] **Step 4: Implement `src/libraries.ts` (types + instantiation)**

```ts
// Excalidraw community libraries (libraries.excalidraw.com) support:
// search library items and instantiate them onto the canvas.
// Pure functions (search ranking, instantiation) are separated from I/O
// (manifest/stats/library fetch with a disk cache) so they can be unit-tested
// without network access.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateId } from './types.js';

export interface LibraryManifestEntry {
  name: string;
  description: string;
  source: string; // e.g. "childishgirl/aws-architecture-icons.excalidrawlib"
  version: number;
  id: string;
}

export interface LibraryItem {
  id?: string;
  name?: string;
  status?: string;
  elements: any[];
}

export interface ExcalidrawLibrary {
  type: string;
  version: number;
  libraryItems: LibraryItem[];
}

export interface SearchResult {
  ref: string; // "<source>#<itemIndex>"
  itemName: string;
  libraryName: string;
  downloads: number;
  elementCount: number;
}

export interface InstantiateResult {
  elements: any[];
  anchorId: string;
  bbox: { x: number; y: number; width: number; height: number };
}

const VECTOR_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'arrow', 'text', 'line', 'freedraw']);
const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);

/**
 * Clone a library item's elements, translate the bounding-box origin to (x, y),
 * optionally scale to targetWidth, regenerate ids, remap groupIds and internal
 * references, and wrap everything in one shared group.
 */
export function instantiateLibraryItem(item: LibraryItem, x: number, y: number, targetWidth?: number): InstantiateResult {
  const src = item.elements || [];
  if (src.length === 0) throw new Error('Library item has no elements');
  const bad = src.find(e => !VECTOR_TYPES.has(e.type));
  if (bad) {
    throw new Error(
      bad.type === 'image'
        ? 'This library item uses embedded images, which are not supported yet — pick a vector item instead.'
        : `Unsupported element type "${bad.type}" in library item.`
    );
  }

  // Bounding box of the original item
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of src) {
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + (e.width || 0)); maxY = Math.max(maxY, e.y + (e.height || 0));
  }
  const scale = targetWidth && maxX - minX > 0 ? targetWidth / (maxX - minX) : 1;

  // New ids for every element and group; one extra shared group wraps the item
  const idMap = new Map<string, string>();
  for (const e of src) idMap.set(e.id, generateId());
  const groupMap = new Map<string, string>();
  const sharedGroup = generateId();

  const out: any[] = [];
  for (const e of src) {
    const c = JSON.parse(JSON.stringify(e));
    c.id = idMap.get(e.id);
    c.x = x + (e.x - minX) * scale;
    c.y = y + (e.y - minY) * scale;
    if (typeof c.width === 'number') c.width *= scale;
    if (typeof c.height === 'number') c.height *= scale;
    if (typeof c.fontSize === 'number') c.fontSize *= scale;
    if (Array.isArray(c.points)) c.points = c.points.map((p: [number, number]) => [p[0] * scale, p[1] * scale]);

    const groups: string[] = (c.groupIds || []).map((g: string) => {
      if (!groupMap.has(g)) groupMap.set(g, generateId());
      return groupMap.get(g)!;
    });
    groups.push(sharedGroup);
    c.groupIds = groups;

    if (Array.isArray(c.boundElements)) {
      c.boundElements = c.boundElements
        .map((b: any) => (b && idMap.has(b.id) ? { ...b, id: idMap.get(b.id) } : null))
        .filter(Boolean);
      if (c.boundElements.length === 0) c.boundElements = null;
    }
    if (c.containerId) c.containerId = idMap.get(c.containerId) ?? null;
    if (c.startBinding?.elementId) {
      c.startBinding = idMap.has(c.startBinding.elementId)
        ? { ...c.startBinding, elementId: idMap.get(c.startBinding.elementId) }
        : null;
    }
    if (c.endBinding?.elementId) {
      c.endBinding = idMap.has(c.endBinding.elementId)
        ? { ...c.endBinding, elementId: idMap.get(c.endBinding.elementId) }
        : null;
    }
    out.push(c);
  }

  // Anchor: largest shape (for arrow binding), falling back to the largest element
  const byArea = (list: any[]) => list.reduce((a, b) => ((a.width || 0) * (a.height || 0) >= (b.width || 0) * (b.height || 0) ? a : b));
  const shapes = out.filter(e => SHAPE_TYPES.has(e.type));
  const anchor = shapes.length > 0 ? byArea(shapes) : byArea(out);

  return {
    elements: out,
    anchorId: anchor.id,
    bbox: { x, y, width: (maxX - minX) * scale, height: (maxY - minY) * scale }
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:libraries
```

Expected: `6 tests passed`

- [ ] **Step 6: Commit**

```bash
git add src/libraries.ts scripts/fixtures/test-library.excalidrawlib scripts/test-libraries.mjs package.json
git commit -m "feat(libraries): library item instantiation with id/group remapping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Search (pure) + unit tests

**Files:**
- Modify: `src/libraries.ts` (append)
- Modify: `scripts/test-libraries.mjs` (append tests)

**Interfaces:**
- Produces:
  - `const CURATED_LIBRARIES: Record<string, string[]>` (source → domain keywords)
  - `function statsKey(source: string): string`
  - `function searchManifest(manifest: LibraryManifestEntry[], stats: Record<string, { total: number }>, query: string): Array<LibraryManifestEntry & { downloads: number }>`
  - `function searchItems(lib: ExcalidrawLibrary, entry: { source: string; name: string }, downloads: number, query: string): SearchResult[]`

- [ ] **Step 1: Write the failing tests (append to `scripts/test-libraries.mjs`, before the final `console.log`)**

```js
import { statsKey, searchManifest, searchItems, CURATED_LIBRARIES } from '../dist/libraries.js';

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
});

test('curated set covers the main technical domains', () => {
  const all = Object.values(CURATED_LIBRARIES).flat().join(' ');
  for (const kw of ['aws', 'azure', 'gcp', 'uml', 'network']) assert.ok(all.includes(kw), kw);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm run test:libraries
```

Expected: FAIL — `statsKey` not exported.

- [ ] **Step 3: Implement (append to `src/libraries.ts`)**

```ts
// ---- Search ----

// Curated libraries highlighted for technical diagrams. Keys are manifest
// `source` values (verified against the live manifest); values are the domain
// keywords that should pull the library into an item-level search.
export const CURATED_LIBRARIES: Record<string, string[]> = {
  'childishgirl/aws-architecture-icons.excalidrawlib': ['aws', 'rds', 's3', 'ec2', 'dynamodb', 'cloud'],
  'stojanovic/aws-serverless-icons-v2.excalidrawlib': ['aws', 'serverless', 'lambda'],
  'youritjang/azure-cloud-services.excalidrawlib': ['azure', 'cloud'],
  'clementbosc/gcp-icons.excalidrawlib': ['gcp', 'google cloud', 'bigquery', 'cloud'],
  'rohanp/system-design.excalidrawlib': ['system design', 'queue', 'cache', 'load balancer', 'database'],
  'youritjang/software-architecture.excalidrawlib': ['architecture', 'service', 'database', 'user'],
  'BjoernKW/UML-ER-library.excalidrawlib': ['uml', 'er', 'entity', 'class diagram'],
  'dwelle/network-topology-icons.excalidrawlib': ['network', 'router', 'firewall', 'switch'],
  'markopolo123/dev_ops.excalidrawlib': ['devops', 'ci', 'docker', 'kubernetes']
};

/** "author/name.excalidrawlib" -> "author-name" (the key format of stats.json). */
export function statsKey(source: string): string {
  return source.replace(/\.excalidrawlib$/i, '').replace(/\//g, '-');
}

const tokenize = (q: string): string[] => q.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2);

/** Match query tokens against library name+description; rank by total downloads. */
export function searchManifest(
  manifest: LibraryManifestEntry[],
  stats: Record<string, { total: number }>,
  query: string
): Array<LibraryManifestEntry & { downloads: number }> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return manifest
    .filter(e => {
      const hay = `${e.name} ${e.description}`.toLowerCase();
      return tokens.some(t => hay.includes(t));
    })
    .map(e => ({ ...e, downloads: stats[statsKey(e.source)]?.total ?? 0 }))
    .sort((a, b) => b.downloads - a.downloads);
}

/** Match query tokens against item names inside one downloaded library. */
export function searchItems(
  lib: ExcalidrawLibrary,
  entry: { source: string; name: string },
  downloads: number,
  query: string
): SearchResult[] {
  const tokens = tokenize(query);
  const out: SearchResult[] = [];
  (lib.libraryItems || []).forEach((item, i) => {
    if (!item.name) return;
    const name = item.name.toLowerCase();
    if (tokens.some(t => name.includes(t))) {
      out.push({
        ref: `${entry.source}#${i}`,
        itemName: item.name,
        libraryName: entry.name,
        downloads,
        elementCount: (item.elements || []).length
      });
    }
  });
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:libraries
```

Expected: `10 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/libraries.ts scripts/test-libraries.mjs
git commit -m "feat(libraries): manifest/item search ranked by downloads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: I/O — disk cache + fetch + orchestrators

**Files:**
- Modify: `src/libraries.ts` (append)
- Modify: `scripts/test-libraries.mjs` (append tests)

**Interfaces:**
- Produces:
  - `function getCacheDir(): string`
  - `async function getManifest(): Promise<LibraryManifestEntry[]>`
  - `async function getStats(): Promise<Record<string, { total: number }>>`
  - `async function loadLibrary(entry: LibraryManifestEntry): Promise<ExcalidrawLibrary>`
  - `async function searchLibraryItems(query: string, limit?: number): Promise<SearchResult[]>`
  - `async function getItemByRef(ref: string): Promise<{ item: LibraryItem; entry: LibraryManifestEntry }>`

- [ ] **Step 1: Write the failing tests (append to `scripts/test-libraries.mjs`, before the final `console.log`)**

These pre-populate a temp cache dir so no network is touched (fresh mtime = cache hit).

```js
import os from 'node:os';
import path from 'node:path';
import { getManifest, getStats, loadLibrary, searchLibraryItems, getItemByRef } from '../dist/libraries.js';

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
```

Also wrap the runner to support async tests — replace the existing `test` helper at the top of the file with:

```js
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
```

and replace the final `console.log(...)` line with:

```js
for (const [name, fn] of tests) { await fn(); passed++; console.log(`ok - ${name}`); }
console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm run test:libraries
```

Expected: FAIL — `getManifest` not exported.

- [ ] **Step 3: Implement (append to `src/libraries.ts`)**

```ts
// ---- I/O: disk cache + fetch ----

const LIBRARIES_BASE = 'https://libraries.excalidraw.com';
const MANIFEST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getCacheDir(): string {
  return process.env.EXCALIDRAW_LIBRARY_CACHE_DIR || path.join(os.homedir(), '.cache', 'mcp-excalidraw', 'libraries');
}

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${resp.statusText} for ${url}`);
  return resp.json();
}

function readCacheFile(fileName: string): { data: any; ageMs: number } | null {
  const fp = path.join(getCacheDir(), fileName);
  if (!fs.existsSync(fp)) return null;
  try {
    return { data: JSON.parse(fs.readFileSync(fp, 'utf8')), ageMs: Date.now() - fs.statSync(fp).mtimeMs };
  } catch {
    return null; // malformed cache — treat as absent
  }
}

function writeCacheFile(fileName: string, data: any): void {
  fs.mkdirSync(getCacheDir(), { recursive: true });
  fs.writeFileSync(path.join(getCacheDir(), fileName), JSON.stringify(data));
}

/** TTL'd fetch-through cache; falls back to stale cache when offline. */
async function cachedFetch(fileName: string, url: string, ttlMs: number): Promise<any> {
  const cached = readCacheFile(fileName);
  if (cached && cached.ageMs < ttlMs) return cached.data;
  try {
    const data = await fetchJson(url);
    writeCacheFile(fileName, data);
    return data;
  } catch (err) {
    if (cached) return cached.data; // stale-if-offline
    throw new Error(`Cannot reach ${url} and no local cache exists yet. Check your network and retry. (${(err as Error).message})`);
  }
}

export async function getManifest(): Promise<LibraryManifestEntry[]> {
  return cachedFetch('manifest.json', `${LIBRARIES_BASE}/libraries.json`, MANIFEST_TTL_MS);
}

export async function getStats(): Promise<Record<string, { total: number }>> {
  return cachedFetch('stats.json', `${LIBRARIES_BASE}/stats.json`, MANIFEST_TTL_MS);
}

/** Load one library; cached indefinitely, refetched when the manifest version changes. */
export async function loadLibrary(entry: LibraryManifestEntry): Promise<ExcalidrawLibrary> {
  const fileName = `lib-${statsKey(entry.source)}.json`;
  const cached = readCacheFile(fileName);
  if (cached && cached.data?.manifestVersion === entry.version) return cached.data.library;
  const library = await fetchJson(`${LIBRARIES_BASE}/libraries/${entry.source}`) as ExcalidrawLibrary;
  writeCacheFile(fileName, { manifestVersion: entry.version, library });
  return library;
}

function isLibraryCached(source: string): boolean {
  return fs.existsSync(path.join(getCacheDir(), `lib-${statsKey(source)}.json`));
}

/**
 * Search flow: match libraries in the manifest, then search item names inside
 * curated-domain matches, already-cached libraries, and the top manifest hits.
 */
export async function searchLibraryItems(query: string, limit = 10): Promise<SearchResult[]> {
  const [manifest, stats] = await Promise.all([getManifest(), getStats()]);
  const libHits = searchManifest(manifest, stats, query);
  const bySource = new Map(manifest.map(e => [e.source, e]));

  const tokens = query.toLowerCase();
  const curatedHits = Object.entries(CURATED_LIBRARIES)
    .filter(([, keywords]) => keywords.some(k => tokens.includes(k)))
    .map(([source]) => bySource.get(source))
    .filter((e): e is LibraryManifestEntry => !!e);

  // Libraries whose items we search: curated domain hits + cached matches + top-3 matches
  const toSearch = new Map<string, LibraryManifestEntry>();
  for (const e of curatedHits) toSearch.set(e.source, e);
  for (const e of libHits.filter(h => isLibraryCached(h.source))) toSearch.set(e.source, e);
  for (const e of libHits.slice(0, 3)) toSearch.set(e.source, e);

  const results: SearchResult[] = [];
  for (const entry of toSearch.values()) {
    try {
      const lib = await loadLibrary(entry);
      const downloads = stats[statsKey(entry.source)]?.total ?? 0;
      results.push(...searchItems(lib, entry, downloads, query));
    } catch (err) {
      logger.warn(`Skipping library ${entry.source}: ${(err as Error).message}`);
    }
  }
  results.sort((a, b) => b.downloads - a.downloads);
  return results.slice(0, limit);
}

/** Resolve a "<source>#<index>" ref back to the concrete library item. */
export async function getItemByRef(ref: string): Promise<{ item: LibraryItem; entry: LibraryManifestEntry }> {
  const hash = ref.lastIndexOf('#');
  if (hash < 1) throw new Error(`Invalid ref "${ref}" — expected "<source>#<itemIndex>" from search_library_items.`);
  const source = ref.slice(0, hash);
  const index = Number(ref.slice(hash + 1));
  const manifest = await getManifest();
  const entry = manifest.find(e => e.source === source);
  if (!entry) throw new Error(`Library "${source}" not found in the manifest — run search_library_items again.`);
  const lib = await loadLibrary(entry);
  const item = lib.libraryItems?.[index];
  if (!item) throw new Error(`Item index ${index} not found in "${source}" (has ${lib.libraryItems?.length ?? 0} items).`);
  return { item, entry };
}
```

Also add the logger and fetch imports at the top of `src/libraries.ts` (with the other imports — `node-fetch` matches the pattern in `src/index.ts` and avoids relying on the global fetch type):

```ts
import fetch from 'node-fetch';
import logger from './utils/logger.js';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:libraries
```

Expected: `14 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/libraries.ts scripts/test-libraries.mjs
git commit -m "feat(libraries): hybrid fetch + disk cache with stale-if-offline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: MCP tools + instructions (`src/index.ts`)

**Files:**
- Modify: `src/index.ts` — import, 2 tool definitions (append to the `tools` array, after `validate_layout`), 2 handlers (before `default:`), instructions append.

**Interfaces:**
- Consumes: `searchLibraryItems`, `getItemByRef`, `instantiateLibraryItem` from `./libraries.js`; existing `batchCreateElementsOnCanvas`.
- Produces: MCP tools `search_library_items`, `insert_library_item`.

- [ ] **Step 1: Add the import (next to the `./layout.js` import)**

```ts
import { searchLibraryItems, getItemByRef, instantiateLibraryItem } from './libraries.js';
```

- [ ] **Step 2: Append tool definitions to the `tools` array (after the `validate_layout` entry)**

```ts
  {
    name: 'search_library_items',
    description: 'Search community Excalidraw libraries (libraries.excalidraw.com) for ready-made icons and shapes — AWS/Azure/GCP icons, UML, network, system-design components. Returns matching items with a ref to pass to insert_library_item. Use this BEFORE drawing generic shapes for cloud/infra diagrams (e.g. search "aws rds" for an AWS database icon).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, e.g. "aws rds", "lambda", "load balancer", "uml class"' },
        limit: { type: 'number', description: 'Max results (default 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'insert_library_item',
    description: 'Insert a library item (found via search_library_items) onto the canvas at (x, y). The item is placed as a grouped unit. Returns the created element ids, an anchorId you can use to bind arrows (startElementId/endElementId), and the bounding box for positioning labels.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Item ref from search_library_items, e.g. "author/lib.excalidrawlib#3"' },
        x: { type: 'number', description: 'Target X for the item bounding-box origin' },
        y: { type: 'number', description: 'Target Y for the item bounding-box origin' },
        targetWidth: { type: 'number', description: 'Optional: scale the item uniformly to this width in px' }
      },
      required: ['ref', 'x', 'y']
    }
  }
```

- [ ] **Step 3: Add handlers (before `default:` in the tool-call switch)**

```ts
      case 'search_library_items': {
        const params = z.object({
          query: z.string(),
          limit: z.number().optional()
        }).parse(args);
        logger.info('Searching library items', { query: params.query });

        const results = await searchLibraryItems(params.query, params.limit ?? 10);

        if (results.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No library items matched "${params.query}". Try broader terms (e.g. "aws", "database", "network") or draw with basic shapes instead.`
            }]
          };
        }

        const lines = results.map(r =>
          `  ${r.ref}\n    ${r.itemName} — ${r.libraryName} (${r.downloads.toLocaleString()} downloads, ${r.elementCount} elements)`
        );
        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} library item(s) for "${params.query}":\n\n${lines.join('\n')}\n\nInsert one with insert_library_item using its ref. Pass targetWidth (~120-200px for node icons) to normalize sizes.`
          }]
        };
      }

      case 'insert_library_item': {
        const params = z.object({
          ref: z.string(),
          x: z.number(),
          y: z.number(),
          targetWidth: z.number().optional()
        }).parse(args);
        logger.info('Inserting library item', { ref: params.ref });

        const { item } = await getItemByRef(params.ref);
        const { elements, anchorId, bbox } = instantiateLibraryItem(item, params.x, params.y, params.targetWidth);

        const canvasElements = await batchCreateElementsOnCanvas(elements as unknown as ServerElement[]);
        if (!canvasElements) {
          throw new Error('Failed to insert library item: HTTP server unavailable');
        }

        return {
          content: [{
            type: 'text',
            text: `Inserted "${item.name ?? params.ref}" (${elements.length} elements) at (${params.x}, ${params.y}).\n\n` +
              `anchorId: ${anchorId} — bind arrows to it via startElementId/endElementId\n` +
              `bbox: x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} w=${Math.round(bbox.width)} h=${Math.round(bbox.height)} — keep >=40px clear around it\n` +
              `elementIds: ${elements.map((e: any) => e.id).join(', ')}\n\n✅ Synced to canvas`
          }]
        };
      }
```

- [ ] **Step 4: Append to `MCP_INSTRUCTIONS` (add to the WORKFLOW section, after the autoLayout line)**

```
- For cloud infrastructure (AWS/Azure/GCP), UML, network, or system-design diagrams: call search_library_items first and insert official icons with insert_library_item instead of drawing generic shapes (e.g. an AWS database -> the RDS icon).
```

- [ ] **Step 5: Build, type-check, and verify tools are registered over stdio**

```bash
npm run type-check && npm run build:server
cat > /tmp/tools-test.mjs <<'EOF'
import { spawn } from 'child_process';
const p = spawn('node', ['dist/index.js'], { stdio: ['pipe','pipe','pipe'], env: {...process.env, ENABLE_CANVAS_SYNC: 'false'} });
let buf = '';
p.stdout.on('data', d => { buf += d; for (const line of buf.split('\n')) { if (!line.trim()) continue; try { const m = JSON.parse(line); if (m.id === 2) { const names = m.result.tools.map(t => t.name); console.log('search tool:', names.includes('search_library_items'), '| insert tool:', names.includes('insert_library_item')); p.kill(); process.exit(names.includes('search_library_items') && names.includes('insert_library_item') ? 0 : 1); } } catch {} } });
p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}}})+'\n');
setTimeout(()=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})+'\n'),300);
setTimeout(()=>{console.log('timeout');p.kill();process.exit(1)},4000);
EOF
node /tmp/tools-test.mjs
```

Expected: `search tool: true | insert tool: true`

- [ ] **Step 6: Run the full unit suite again, then commit**

```bash
npm run test:libraries
git add src/index.ts
git commit -m "feat(mcp): search_library_items + insert_library_item tools

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification, spec update, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-excalidraw-libraries-design.md` (record the passthrough deviation)

**Interfaces:** none — verification and delivery.

- [ ] **Step 1: Start the canvas server and run a real search→insert**

```bash
cd /home/iago/projeto/mcp_excalidraw
npm run build
PORT=3000 node dist/server.js &   # or run in background via your harness
sleep 2
cat > /tmp/e2e-lib.mjs <<'EOF'
import { spawn } from 'child_process';
const p = spawn('node', ['dist/index.js'], { stdio: ['pipe','pipe','pipe'], env: {...process.env, ENABLE_CANVAS_SYNC: 'true', EXPRESS_SERVER_URL: 'http://127.0.0.1:3000'} });
let ref = null;
p.stdout.on('data', d => { for (const line of (''+d).split('\n')) { if (!line.trim()) continue; try { const m = JSON.parse(line);
  if (m.id === 2) { const text = m.result.content[0].text; console.log('SEARCH:\n' + text.split('\n').slice(0,6).join('\n')); const match = text.match(/^\s+(\S+#\d+)$/m); if (!match) { console.error('no ref found'); process.exit(1); } ref = match[1];
    p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'insert_library_item',arguments:{ref, x: 200, y: 200, targetWidth: 160}}})+'\n'); }
  if (m.id === 3) { console.log('INSERT:\n' + m.result.content[0].text.split('\n').slice(0,4).join('\n')); p.kill(); process.exit(0); }
} catch {} } });
p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'t',version:'1'}}})+'\n');
setTimeout(()=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'search_library_items',arguments:{query:'aws rds database'}}})+'\n'),400);
setTimeout(()=>{console.log('timeout');p.kill();process.exit(1)},30000);
EOF
node /tmp/e2e-lib.mjs
```

Expected: SEARCH lists AWS items with refs; INSERT reports anchorId + bbox + `✅ Synced to canvas`. Open http://localhost:3000 — a real AWS icon should be on the canvas.

- [ ] **Step 2: Record the spec deviation**

Append to `docs/superpowers/specs/2026-07-01-excalidraw-libraries-design.md`:

```markdown
## Deviation (implementation)

"Canvas server untouched" was relaxed by one minimal change: `CreateElementSchema`
in `src/server.ts` gained `.passthrough()`. The zod default (strip) removed
library-element props (`angle`, `containerId`, `textAlign`, …), breaking icon
fidelity. No endpoint or behavior changes beyond preserving unknown props.
```

- [ ] **Step 3: Full verification + commit + PR**

```bash
npm run type-check && npm run test:libraries
git add docs/superpowers/specs/2026-07-01-excalidraw-libraries-design.md
git commit -m "docs: record CreateElementSchema passthrough deviation in spec

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin feat/excalidraw-libraries
gh pr create --repo iagogfe/mcp_excalidraw --base main --head feat/excalidraw-libraries \
  --title "feat(mcp): community library support (search + insert official icons)" \
  --body "Implements docs/superpowers/specs/2026-07-01-excalidraw-libraries-design.md — search_library_items + insert_library_item tools, hybrid disk cache, id/group remapping instantiation, instructions update. Unit tests: npm run test:libraries (no network). E2E verified against live canvas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR URL printed. Kill the background canvas server afterwards.
