// Canvas open-time measurement harness (autosearch-hitl).
// Boots the built canvas server on a free port, seeds a deterministic scene,
// then loads the page N times in headless chromium measuring two numbers:
//   t_interactive = ms from navigation until the Excalidraw canvas is painted
//   t_scene       = ms from navigation until the main thread quiesces after the
//                   seeded elements have loaded (captures redundant load/convert cost)
// Prints median over N runs as JSON. Lower is better. t_scene is the optimization
// target; t_interactive is observability.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

const RUNS = Number(process.env.RUNS || 5);
const SEED_COUNT = Number(process.env.SEED_COUNT || 30);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

async function waitFor(fn, { timeout = 20000, interval = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await fn()) return true; } catch {}
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('waitFor timeout');
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function buildSeed(n) {
  const cols = 6, gap = 220, gy = 140;
  const els = [];
  for (let i = 0; i < n; i++) {
    els.push({
      id: `seed-${i}`,
      type: 'rectangle',
      x: 100 + (i % cols) * gap,
      y: 100 + Math.floor(i / cols) * gy,
      width: 160,
      height: 80,
      backgroundColor: '#a5d8ff',
      strokeColor: '#1971c2',
      text: `Node ${i}`
    });
  }
  return els;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  let browser;
  try {
    // Wait for server up
    await waitFor(async () => {
      const r = await fetch(`${base}/api/elements`).catch(() => null);
      return r && r.ok;
    });

    // Seed deterministic scene
    const seedRes = await fetch(`${base}/api/elements/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements: buildSeed(SEED_COUNT) })
    });
    if (!seedRes.ok) throw new Error(`seed failed: ${seedRes.status}`);

    browser = await chromium.launch({ headless: true });
    const interactive = [];
    const scene = [];
    const apiCounts = [];

    for (let run = 0; run < RUNS; run++) {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Install probes at document start: nav baseline, long tasks, and an
      // instrumented fetch that records every /api/elements load completion.
      await page.addInitScript(() => {
        window.__navStart = performance.now();
        window.__lastLongTaskEnd = 0;
        window.__apiElementsCount = 0;
        window.__apiElementsLast = 0;
        try {
          const po = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              window.__lastLongTaskEnd = Math.max(window.__lastLongTaskEnd, e.startTime + e.duration);
            }
          });
          po.observe({ entryTypes: ['longtask'] });
        } catch {}
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
          const url = String(args[0]?.url || args[0] || '');
          const resp = await origFetch(...args);
          if (url.includes('/api/elements') && !url.includes('/sync')) {
            window.__apiElementsCount++;
            window.__apiElementsLast = performance.now();
          }
          return resp;
        };
      });

      await page.goto(base, { waitUntil: 'commit' });

      // t_interactive: canvas element painted
      await page.waitForSelector('.excalidraw canvas', { state: 'attached', timeout: 20000 });
      const tInteractive = await page.evaluate(() => performance.now() - window.__navStart);

      // t_scene: element loads have settled — at least one /api/elements load
      // happened AND no new one for 800ms AND main thread quiet. Settled time =
      // max(last element-load completion, last long-task end) relative to nav.
      await page.waitForFunction(
        () => window.__apiElementsCount > 0 &&
              (performance.now() - window.__apiElementsLast) > 800 &&
              (performance.now() - window.__lastLongTaskEnd) > 800,
        undefined,
        { timeout: 25000, polling: 100 }
      );
      const { tScene, apiCount } = await page.evaluate(() => ({
        tScene: Math.max(window.__apiElementsLast, window.__lastLongTaskEnd) - window.__navStart,
        apiCount: window.__apiElementsCount
      }));

      interactive.push(tInteractive);
      scene.push(tScene);
      apiCounts.push(apiCount);
      await context.close();
    }

    const out = {
      runs: RUNS,
      seedCount: SEED_COUNT,
      t_interactive_median_ms: Math.round(median(interactive)),
      t_scene_median_ms: Math.round(median(scene)),
      api_elements_requests_median: median(apiCounts),
      t_interactive_runs: interactive.map(Math.round),
      t_scene_runs: scene.map(Math.round),
      api_elements_runs: apiCounts
    };
    console.log(JSON.stringify(out, null, 2));
    // Machine-readable last line for the loop
    console.log(`METRIC t_scene=${out.t_scene_median_ms} t_interactive=${out.t_interactive_median_ms}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }
}

main().catch((e) => { console.error('MEASURE_ERROR', e); process.exit(1); });
