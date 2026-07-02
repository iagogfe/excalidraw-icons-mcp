// Excalidraw community libraries (libraries.excalidraw.com) support:
// search library items and instantiate them onto the canvas.
// Pure functions (search ranking, instantiation) are separated from I/O
// (manifest/stats/library fetch with a disk cache) so they can be unit-tested
// without network access.

import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import logger from './utils/logger.js';
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

  const queryLower = query.toLowerCase();
  const queryTokens = new Set(tokenize(query));
  const curatedHits = Object.entries(CURATED_LIBRARIES)
    .filter(([, keywords]) => keywords.some(k =>
      k.includes(' ') ? queryLower.includes(k) : queryTokens.has(k)
    ))
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
  const idxStr = ref.slice(hash + 1);
  if (!/^\d+$/.test(idxStr)) {
    throw new Error(`Invalid ref "${ref}" — expected "<source>#<itemIndex>" from search_library_items.`);
  }
  const index = Number(idxStr);
  const manifest = await getManifest();
  const entry = manifest.find(e => e.source === source);
  if (!entry) throw new Error(`Library "${source}" not found in the manifest — run search_library_items again.`);
  const lib = await loadLibrary(entry);
  const item = lib.libraryItems?.[index];
  if (!item) throw new Error(`Item index ${index} not found in "${source}" (has ${lib.libraryItems?.length ?? 0} items).`);
  return { item, entry };
}
