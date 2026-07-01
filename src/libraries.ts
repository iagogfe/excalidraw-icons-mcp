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
