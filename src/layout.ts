// Layout engine for Excalidraw scenes: spacing/sizing ("spacer") + edge-crossing
// minimization ("router") + issue detection ("validate").
//
// The spacer and router were each tuned by an autosearch loop against a fixed
// scorer (min-size, no overlap, >=40px gaps, arrows >=80px, no crossings).
// autoLayout() composes them; detectLayoutIssues() powers the validate_layout
// tool. All functions preserve element ids, count, and arrow bindings — only
// x/y/width/height (and fontSize/label-fit width) change.

export interface LayoutElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  label?: { text?: string } | null;
  start?: { id?: string } | null;
  end?: { id?: string } | null;
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
  [key: string]: any;
}

const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);
const isShape = (t: string): boolean => SHAPE_TYPES.has(t);

const GAP = 44;        // clear gap between shapes (>40 to satisfy spacing rules)
const ARROW_GAP = 84;  // wider gap for arrow-connected shapes (>=80px)
const CHAR_W = 0.55;   // rough label width per char per font px

// Resolve an arrow's endpoints from either the pre-sync ({start:{id}}) or the
// canvas-stored ({startBinding:{elementId}}) representation.
const startId = (e: LayoutElement): string | undefined => e.start?.id ?? e.startBinding?.elementId ?? undefined;
const endId = (e: LayoutElement): string | undefined => e.end?.id ?? e.endBinding?.elementId ?? undefined;

const center = (e: LayoutElement) => ({ x: e.x + (e.width || 0) / 2, y: e.y + (e.height || 0) / 2 });

function interArea(a: LayoutElement, b: LayoutElement): number {
  const ix = Math.max(0, Math.min(a.x + (a.width || 0), b.x + (b.width || 0)) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + (a.height || 0), b.y + (b.height || 0)) - Math.max(a.y, b.y));
  return ix * iy;
}

function edgeList(elements: LayoutElement[]): Array<{ a: string; b: string }> {
  const out: Array<{ a: string; b: string }> = [];
  for (const e of elements) {
    if (e.type !== 'arrow' && e.type !== 'line') continue;
    const a = startId(e), b = endId(e);
    if (a && b) out.push({ a, b });
  }
  return out;
}

// ---- Spacer: sizing + separation ----

function enforceSizes(elements: LayoutElement[]): void {
  for (const e of elements) {
    if (!isShape(e.type)) continue;
    e.width = Math.max(e.width || 0, 120);
    e.height = Math.max(e.height || 0, 60);
    const t = e.label?.text;
    if (t) {
      const fs = Math.max(e.fontSize || 16, 14);
      e.fontSize = fs;
      const longestLine = t.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
      const need = Math.ceil(longestLine * fs * CHAR_W + 16);
      if (e.width < need) e.width = need;
    }
  }
}

// Push overlapping / too-close shapes apart. Arrow-connected pairs get a wider gap.
function separate(shapes: LayoutElement[], connected?: Set<string>, gap = GAP, arrowGap = ARROW_GAP): void {
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < shapes.length; i++)
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i]!, b = shapes[j]!;
        const g = connected && connected.has(pairKey(a.id, b.id)) ? arrowGap : gap;
        const dx = (b.x + (b.width || 0) / 2) - (a.x + (a.width || 0) / 2);
        const dy = (b.y + (b.height || 0) / 2) - (a.y + (a.height || 0) / 2);
        const needX = ((a.width || 0) + (b.width || 0)) / 2 + g;
        const needY = ((a.height || 0) + (b.height || 0)) / 2 + g;
        if (Math.abs(dx) < needX && Math.abs(dy) < needY) {
          const pushX = needX - Math.abs(dx), pushY = needY - Math.abs(dy);
          if (pushX <= pushY) { const s = (dx === 0 ? 1 : Math.sign(dx)) * pushX / 2; a.x -= s; b.x += s; }
          else { const s = (dy === 0 ? 1 : Math.sign(dy)) * pushY / 2; a.y -= s; b.y += s; }
          moved = true;
        }
      }
    if (!moved) break;
  }
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---- Router: force-directed placement + crossing removal + compaction ----

function crossingCount(shapes: LayoutElement[], edges: Array<[number, number]>): number {
  const orient = (a: any, b: any, p: any) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  let count = 0;
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [a1, b1] = edges[i]!, [a2, b2] = edges[j]!;
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
      const p1 = center(shapes[a1]!), p2 = center(shapes[b1]!), p3 = center(shapes[a2]!), p4 = center(shapes[b2]!);
      const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
      if (d1 !== d2 && d3 !== d4 && d1 && d2 && d3 && d4) count++;
    }
  return count;
}

function forceDirected(shapes: LayoutElement[], edges: Array<[number, number]>): void {
  const n = shapes.length;
  const W = 1000, H = 700;
  const k = Math.sqrt((W * H) / n);
  const pos = shapes.map((e) => ({ x: e.x + (e.width || 0) / 2, y: e.y + (e.height || 0) / 2 }));
  let temp = W / 10;
  for (let it = 0; it < 300; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i]!.x - pos[j]!.x, dy = pos[i]!.y - pos[j]!.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const rep = (k * k) / dist, ux = dx / dist, uy = dy / dist;
        disp[i]!.x += ux * rep; disp[i]!.y += uy * rep;
        disp[j]!.x -= ux * rep; disp[j]!.y -= uy * rep;
      }
    for (const [a, b] of edges) {
      const dx = pos[a]!.x - pos[b]!.x, dy = pos[a]!.y - pos[b]!.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const att = (dist * dist) / k, ux = dx / dist, uy = dy / dist;
      disp[a]!.x -= ux * att; disp[a]!.y -= uy * att;
      disp[b]!.x += ux * att; disp[b]!.y += uy * att;
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(disp[i]!.x, disp[i]!.y) || 0.01;
      pos[i]!.x += (disp[i]!.x / d) * Math.min(d, temp);
      pos[i]!.y += (disp[i]!.y / d) * Math.min(d, temp);
    }
    temp *= 0.98;
  }
  shapes.forEach((e, i) => { e.x = pos[i]!.x - (e.width || 0) / 2; e.y = pos[i]!.y - (e.height || 0) / 2; });
}

function reduceCrossings(shapes: LayoutElement[], edges: Array<[number, number]>): void {
  const swap = (a: LayoutElement, b: LayoutElement) => { const tx = a.x, ty = a.y; a.x = b.x; a.y = b.y; b.x = tx; b.y = ty; };
  let cur = crossingCount(shapes, edges);
  for (let pass = 0; pass < 30 && cur > 0; pass++) {
    let improved = false;
    for (let i = 0; i < shapes.length && cur > 0; i++)
      for (let j = i + 1; j < shapes.length; j++) {
        swap(shapes[i]!, shapes[j]!);
        const c = crossingCount(shapes, edges);
        if (c < cur) { cur = c; improved = true; }
        else swap(shapes[i]!, shapes[j]!);
      }
    if (!improved) break;
  }
}

function compact(shapes: LayoutElement[], edges: Array<[number, number]>): void {
  const adj: number[][] = shapes.map(() => []);
  for (const [a, b] of edges) { adj[a]!.push(b); adj[b]!.push(a); }
  const overlaps = (i: number): boolean => {
    const a = shapes[i]!;
    for (let j = 0; j < shapes.length; j++) {
      if (j === i) continue;
      if (interArea(a, shapes[j]!) > 0) return true;
    }
    return false;
  };
  const cur = crossingCount(shapes, edges);
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < shapes.length; i++) {
      if (adj[i]!.length === 0) continue;
      let cx = 0, cy = 0;
      for (const j of adj[i]!) { cx += shapes[j]!.x + (shapes[j]!.width || 0) / 2; cy += shapes[j]!.y + (shapes[j]!.height || 0) / 2; }
      cx /= adj[i]!.length; cy /= adj[i]!.length;
      const ox = shapes[i]!.x, oy = shapes[i]!.y;
      shapes[i]!.x = ox + (cx - (shapes[i]!.width || 0) / 2 - ox) * 0.3;
      shapes[i]!.y = oy + (cy - (shapes[i]!.height || 0) / 2 - oy) * 0.3;
      if (overlaps(i) || crossingCount(shapes, edges) > cur) { shapes[i]!.x = ox; shapes[i]!.y = oy; }
      else moved = true;
    }
    if (!moved) break;
  }
}

// ---- Public: compose everything ----

/**
 * Reposition/resize shapes so the diagram has no overlaps, adequate spacing,
 * and minimal arrow crossings. Mutates and returns the same array.
 */
export function autoLayout(elements: LayoutElement[]): LayoutElement[] {
  const shapes = elements.filter((e) => isShape(e.type));
  enforceSizes(elements);
  if (shapes.length >= 2) {
    const idx = new Map(shapes.map((e, i) => [e.id, i]));
    const edges: Array<[number, number]> = edgeList(elements)
      .map(({ a, b }) => [idx.get(a), idx.get(b)] as [number | undefined, number | undefined])
      .filter(([a, b]) => a != null && b != null) as Array<[number, number]>;
    const connected = new Set(edgeList(elements).map(({ a, b }) => pairKey(a, b)));
    // router: place, uncross, compact
    forceDirected(shapes, edges);
    separate(shapes);
    reduceCrossings(shapes, edges);
    compact(shapes, edges);
    // spacer: guarantee gaps (arrow-connected pairs wider) after tight packing
    separate(shapes, connected);
  }
  // normalize to a positive origin with a margin
  let minx = Infinity, miny = Infinity;
  for (const e of elements) { minx = Math.min(minx, e.x); miny = Math.min(miny, e.y); }
  if (isFinite(minx)) {
    const ox = 40 - minx, oy = 40 - miny;
    for (const e of elements) { e.x += ox; e.y += oy; }
  }
  return elements;
}

export interface LayoutIssue {
  type: 'overlap' | 'cramped' | 'tiny_shape' | 'text_overflow' | 'short_arrow' | 'crossing' | 'offscreen';
  severity: 'high' | 'medium' | 'low';
  elementIds: string[];
  detail: string;
}

/**
 * Inspect a scene and return layout problems (for the validate_layout tool).
 * Read-only: does not mutate the scene.
 */
export function detectLayoutIssues(elements: LayoutElement[]): { score: number; issues: LayoutIssue[] } {
  const shapes = elements.filter((e) => isShape(e.type));
  const issues: LayoutIssue[] = [];

  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!, b = shapes[j]!;
      if (interArea(a, b) > 0) {
        issues.push({ type: 'overlap', severity: 'high', elementIds: [a.id, b.id], detail: `${a.id} overlaps ${b.id}` });
        continue;
      }
      const overX = Math.min(a.x + (a.width || 0), b.x + (b.width || 0)) > Math.max(a.x, b.x);
      const overY = Math.min(a.y + (a.height || 0), b.y + (b.height || 0)) > Math.max(a.y, b.y);
      if (overY && !overX) { const g = Math.max(a.x, b.x) - Math.min(a.x + (a.width || 0), b.x + (b.width || 0)); if (g >= 0 && g < 40) issues.push({ type: 'cramped', severity: 'medium', elementIds: [a.id, b.id], detail: `${a.id} and ${b.id} are ${Math.round(g)}px apart (<40)` }); }
      if (overX && !overY) { const g = Math.max(a.y, b.y) - Math.min(a.y + (a.height || 0), b.y + (b.height || 0)); if (g >= 0 && g < 40) issues.push({ type: 'cramped', severity: 'medium', elementIds: [a.id, b.id], detail: `${a.id} and ${b.id} are ${Math.round(g)}px apart (<40)` }); }
    }

  for (const e of shapes) {
    if ((e.width || 0) < 120 || (e.height || 0) < 60)
      issues.push({ type: 'tiny_shape', severity: 'medium', elementIds: [e.id], detail: `${e.id} is ${Math.round(e.width || 0)}x${Math.round(e.height || 0)} (min 120x60)` });
    const t = e.label?.text;
    if (t) {
      const fs = e.fontSize || 16;
      const longestLine = t.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
      const need = longestLine * fs * CHAR_W + 16;
      if (need > (e.width || 0)) issues.push({ type: 'text_overflow', severity: 'medium', elementIds: [e.id], detail: `label of ${e.id} needs ~${Math.round(need)}px but width is ${Math.round(e.width || 0)}` });
    }
  }

  const byId = new Map(elements.map((e) => [e.id, e]));
  for (const e of elements) {
    if (e.type !== 'arrow' && e.type !== 'line') continue;
    const a = startId(e), b = endId(e);
    if (!a || !b) continue;
    const s = byId.get(a), d = byId.get(b);
    if (s && d) {
      const dist = Math.hypot(center(s).x - center(d).x, center(s).y - center(d).y) - ((s.width || 0) + (d.width || 0)) / 2;
      if (dist < 80) issues.push({ type: 'short_arrow', severity: 'low', elementIds: [e.id, a, b], detail: `${a}->${b} shapes ~${Math.round(Math.max(0, dist))}px apart (<80)` });
    }
  }

  // negative coordinates (off the top-left of the canvas)
  for (const e of elements) {
    if (e.x < 0 || e.y < 0) issues.push({ type: 'offscreen', severity: 'low', elementIds: [e.id], detail: `${e.id} at (${Math.round(e.x)}, ${Math.round(e.y)}) has negative coordinates` });
  }

  // arrow crossings
  const idx = new Map(shapes.map((e, i) => [e.id, i]));
  const edges: Array<{ id: string; a: number; b: number }> = [];
  for (const e of elements) {
    if (e.type !== 'arrow' && e.type !== 'line') continue;
    const a = startId(e), b = endId(e);
    if (a && b && idx.has(a) && idx.has(b)) edges.push({ id: e.id, a: idx.get(a)!, b: idx.get(b)! });
  }
  const orient = (a: any, b: any, p: any) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i]!, e2 = edges[j]!;
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
      const p1 = center(shapes[e1.a]!), p2 = center(shapes[e1.b]!), p3 = center(shapes[e2.a]!), p4 = center(shapes[e2.b]!);
      const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
      if (d1 !== d2 && d3 !== d4 && d1 && d2 && d3 && d4)
        issues.push({ type: 'crossing', severity: 'medium', elementIds: [e1.id, e2.id], detail: `arrows ${e1.id} and ${e2.id} cross` });
    }

  const weight: Record<LayoutIssue['severity'], number> = { high: 10, medium: 4, low: 1 };
  const score = issues.reduce((s, it) => s + weight[it.severity], 0);
  return { score, issues };
}
