// Standardized icon libraries, bundled per-domain so all icons of a given domain
// share one consistent visual style (unlike community libraries.excalidraw.com items,
// which mix authors/styles and have no coverage for domains like Kubernetes).
//
// Four sources, tried local-first (fast, offline, bundled) then network fallback:
// - Local SVG files under icons/<domain>/** (bundled: kubernetes/. User-populated:
//   aws/azure/gcp/network — official vendor packages require manual download +
//   license acceptance, so we don't auto-fetch or redistribute them here).
// - simple-icons (CC0, npm dependency): thousands of brand/technology logos
//   (AWS, Azure, GCP, Docker, databases, ML frameworks, ...) in one consistent
//   monochrome style. Good for "this is an X" logos, not vendor architecture icons.
// - @tabler/icons (MIT, npm dependency): ~5000 generic line icons in one consistent
//   style — covers concepts with no brand/vendor, e.g. wifi, router, firewall, user,
//   desktop, server, cloud, shield.
// - Iconify (api.iconify.design, per-icon-set licenses shown in search results):
//   ~200k icons across hundreds of sets. Fetched on demand (not bundled — the full
//   collection is 400MB+) and cached to disk under icons/_cache/iconify/ so repeat
//   lookups are instant and work offline after the first fetch. Last-resort fallback
//   when nothing standardized/bundled matches.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as simpleIcons from 'simple-icons';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_ROOT = path.join(__dirname, '../icons');
const TABLER_ROOT = path.join(__dirname, '../node_modules/@tabler/icons/icons/outline');
const ICONIFY_CACHE_ROOT = path.join(ICONS_ROOT, '_cache/iconify');

export interface OfficialIconResult {
  ref: string; // "local:<relative path>" or "simple-icons:<slug>"
  name: string;
  domain: string;
  source: string;
}

function titleCaseFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function walkSvgs(dir: string, domain: string, out: OfficialIconResult[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSvgs(full, domain, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) {
      const rel = path.relative(ICONS_ROOT, full);
      out.push({
        ref: `local:${rel}`,
        name: titleCaseFromFilename(entry.name),
        domain,
        source: `bundled icons/${domain}`,
      });
    }
  }
}

let localIndexCache: OfficialIconResult[] | null = null;

function localIndex(): OfficialIconResult[] {
  if (localIndexCache) return localIndexCache;
  const out: OfficialIconResult[] = [];
  if (fs.existsSync(ICONS_ROOT)) {
    for (const domain of fs.readdirSync(ICONS_ROOT)) {
      const domainDir = path.join(ICONS_ROOT, domain);
      if (fs.statSync(domainDir).isDirectory()) {
        walkSvgs(domainDir, domain, out);
      }
    }
  }
  localIndexCache = out;
  return out;
}

let tablerIndexCache: string[] | null = null;

function tablerIndex(): string[] {
  if (tablerIndexCache) return tablerIndexCache;
  tablerIndexCache = fs.existsSync(TABLER_ROOT)
    ? fs.readdirSync(TABLER_ROOT).filter(f => f.endsWith('.svg'))
    : [];
  return tablerIndexCache;
}

function score(query: string, name: string): number {
  const q = query.toLowerCase().replace(/[-_]/g, ' ').trim();
  const n = name.toLowerCase().replace(/[-_]/g, ' ').trim();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  const qWords = q.split(/\s+/);
  if (qWords.every(w => n.includes(w))) return 40;
  return 0;
}

function localResults(query: string): Array<OfficialIconResult & { _score: number }> {
  const results: Array<OfficialIconResult & { _score: number }> = [];

  for (const item of localIndex()) {
    const s = score(query, item.name) || score(query, item.domain + ' ' + item.name);
    if (s > 0) results.push({ ...item, _score: s });
  }

  for (const [key, icon] of Object.entries(simpleIcons)) {
    if (!key.startsWith('si')) continue;
    const title = (icon as any).title as string;
    const slug = (icon as any).slug as string;
    const s = Math.max(score(query, title), score(query, slug));
    if (s > 0) {
      results.push({
        ref: `simple-icons:${slug}`,
        name: title,
        domain: 'logo',
        source: 'simple-icons (CC0)',
        _score: s - 5, // local/bundled architecture icons rank slightly above generic logos
      });
    }
  }

  for (const file of tablerIndex()) {
    const name = titleCaseFromFilename(file);
    const s = score(query, name);
    if (s > 0) {
      results.push({
        ref: `tabler:${file}`,
        name,
        domain: 'generic',
        source: '@tabler/icons (MIT)',
        _score: s - 2, // rank between bundled-official (0) and simple-icons (-5)
      });
    }
  }

  return results;
}

interface IconifySearchResponse {
  icons: string[]; // "prefix:name"
  collections?: Record<string, { name?: string; license?: { title?: string } }>;
}

async function iconifySearch(query: string, limit: number): Promise<Array<OfficialIconResult & { _score: number }>> {
  try {
    const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as IconifySearchResponse;
    return (data.icons || []).map((full, i) => {
      const [prefix, name] = full.split(':');
      const license = prefix ? data.collections?.[prefix]?.license?.title : undefined;
      return {
        ref: `iconify:${full}`,
        name: titleCaseFromFilename(name || full),
        domain: 'iconify',
        source: `Iconify/${prefix}${license ? ` (${license})` : ''}`,
        _score: 30 - i * 0.1, // below local/tabler, above nothing; API already ranks by relevance
      };
    });
  } catch {
    return []; // network unavailable — local sources are still usable
  }
}

export async function searchOfficialIcons(query: string, limit = 10): Promise<OfficialIconResult[]> {
  const results = localResults(query);

  if (results.length < limit) {
    results.push(...await iconifySearch(query, limit - results.length));
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit).map(({ _score, ...r }) => r);
}

async function resolveIconify(ref: string): Promise<{ data: Buffer; mimeType: string }> {
  const full = ref.slice('iconify:'.length);
  if (!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(full)) {
    throw new Error(`Invalid iconify ref: "${ref}"`);
  }
  const cachePath = path.join(ICONIFY_CACHE_ROOT, `${full.replace(':', '__')}.svg`);
  const resolvedCache = path.resolve(cachePath);
  if (!resolvedCache.startsWith(path.resolve(ICONIFY_CACHE_ROOT) + path.sep)) {
    throw new Error(`Invalid iconify ref: "${ref}"`);
  }

  if (fs.existsSync(resolvedCache)) {
    return { data: fs.readFileSync(resolvedCache), mimeType: 'image/svg+xml' };
  }

  const [prefix, name] = full.split(':');
  const res = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
  if (!res.ok) throw new Error(`Iconify fetch failed for "${ref}": ${res.status}`);
  const svg = await res.text();
  fs.mkdirSync(ICONIFY_CACHE_ROOT, { recursive: true });
  fs.writeFileSync(resolvedCache, svg, 'utf-8');
  return { data: Buffer.from(svg, 'utf-8'), mimeType: 'image/svg+xml' };
}

// Recolors a single-color icon SVG: swaps currentColor (tabler-style, stroke-based)
// and injects an inherited fill on the root <svg> (simple-icons/iconify-style, no
// per-path fill so they default to black). Multi-color bundled icons (e.g. Kubernetes'
// Inkscape-authored SVGs with explicit per-path colors) are left alone unless the
// caller passes a color anyway, in which case this may flatten them — that's expected,
// recoloring is opt-in per add_image call.
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl)a?\([0-9.,%\s]+\)$|^[a-zA-Z]+$/;

export function recolorSvg(svg: string, color: string): string {
  if (!SAFE_COLOR.test(color)) {
    throw new Error(`Invalid color: "${color}" (expected hex, rgb()/hsl(), or a CSS color name)`);
  }
  let out = svg.replace(/currentColor/g, color);
  // Only inject a fill on the root <svg> if it doesn't already declare one — outline
  // sets (tabler) deliberately set fill="none" and rely on stroke (handled above via
  // currentColor); adding a second fill= there would produce invalid duplicate-attribute
  // XML that browsers/canvas decoders reject outright.
  const openTagEnd = out.indexOf('>');
  const openTag = openTagEnd === -1 ? '' : out.slice(0, openTagEnd);
  if (/^\s*<svg\b/.test(out) && !/\bfill\s*=/.test(openTag)) {
    out = out.replace(/^(\s*<svg\b)/, `$1 fill="${color}"`);
  }
  return out;
}

export async function resolveIconRef(ref: string): Promise<{ data: Buffer; mimeType: string }> {
  if (ref.startsWith('local:')) {
    const rel = ref.slice('local:'.length);
    const full = path.join(ICONS_ROOT, rel);
    const resolved = path.resolve(full);
    if (!resolved.startsWith(path.resolve(ICONS_ROOT) + path.sep)) {
      throw new Error(`Invalid icon ref: "${ref}" resolves outside the icons directory`);
    }
    return { data: fs.readFileSync(resolved), mimeType: 'image/svg+xml' };
  }
  if (ref.startsWith('simple-icons:')) {
    const slug = ref.slice('simple-icons:'.length);
    const key = 'si' + slug.charAt(0).toUpperCase() + slug.slice(1);
    const icon = (simpleIcons as any)[key];
    if (!icon) throw new Error(`Unknown simple-icons ref: "${ref}"`);
    return { data: Buffer.from(icon.svg as string, 'utf-8'), mimeType: 'image/svg+xml' };
  }
  if (ref.startsWith('tabler:')) {
    const file = ref.slice('tabler:'.length);
    const resolved = path.resolve(path.join(TABLER_ROOT, file));
    if (!resolved.startsWith(path.resolve(TABLER_ROOT) + path.sep)) {
      throw new Error(`Invalid icon ref: "${ref}"`);
    }
    return { data: fs.readFileSync(resolved), mimeType: 'image/svg+xml' };
  }
  if (ref.startsWith('iconify:')) {
    return resolveIconify(ref);
  }
  throw new Error(`Unrecognized icon ref format: "${ref}" (expected "local:...", "simple-icons:...", "tabler:...", or "iconify:...")`);
}
