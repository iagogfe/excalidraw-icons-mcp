// Regression test: an arrow loaded through our convert pipeline must stay normalized
// (points[0] === [0,0]). Before the fix, convertToExcalidrawElements left points[0] at
// [0.5, 0]; Excalidraw then logged "Linear element is not normalized" and flung the arrow
// off-screen on the first drag/select — it looked like it vanished.
// Drives a real browser drag and asserts: no normalize error, arrow present, on-screen.
// Requires chromium: `npx playwright install chromium`. Run: `npm run test:arrow-drag`.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
async function waitFor(fn, { timeout = 20000, interval = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, interval)); }
  throw new Error('waitFor timeout');
}

// Free arrow (no shape bindings). With WITHLABEL=0, omit the bound label to isolate the trigger.
const WITHLABEL = process.env.WITHLABEL !== '0';
const SEED = [
  { id: 't-arrow', type: 'arrow', x: 200, y: 240, width: 300, height: 0, points: [[0,0],[300,0]],
    strokeColor: '#1971c2', endArrowhead: 'arrow',
    ...(WITHLABEL ? { boundElements: [{ type: 'text', id: 't-label' }] } : {}) },
  ...(WITHLABEL ? [{ id: 't-label', type: 'text', x: 320, y: 227, width: 60, height: 25, text: 'HTTP', fontSize: 20,
    textAlign: 'center', verticalAlign: 'middle', containerId: 't-arrow', strokeColor: '#1971c2' }] : []),
];

async function arrowOnServer(base) {
  const r = await fetch(`${base}/api/elements`);
  const j = await r.json();
  const els = j.elements || [];
  return els.find(e => e.id === 't-arrow' && !e.isDeleted);
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['dist/server.js'], { env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'inherit'] });
  let browser;
  const consoleErrors = [];
  try {
    await waitFor(async () => { const r = await fetch(`${base}/api/elements`).catch(() => null); return r && r.ok; });
    const res = await fetch(`${base}/api/elements/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ elements: SEED }) });
    if (!res.ok) throw new Error(`seed failed: ${res.status}`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });

    await page.goto(base);
    // Wait until the arrow is in the scene (rendered): the app syncs to server; check the excalidraw canvas exists and give it a beat.
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const before = await arrowOnServer(base);
    // Dump the arrow AS EXCALIDRAW LOADED IT (from localStorage) to check normalization.
    const loaded = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        try {
          const v = JSON.parse(localStorage.getItem(localStorage.key(i)));
          const arr = Array.isArray(v) ? v : (v && v.elements);
          if (Array.isArray(arr)) { const a = arr.find(e => e.id === 't-arrow'); if (a) return { x: a.x, y: a.y, points: a.points }; }
        } catch {}
      }
      return null;
    });
    console.log('arrow as loaded by excalidraw:', JSON.stringify(loaded));
    // Map scene → screen: canvas bounding rect (accounts for the app header) + persisted zoom/scroll.
    const view = await page.evaluate(() => {
      let scrollX = 0, scrollY = 0, zoom = 1;
      for (let i = 0; i < localStorage.length; i++) {
        try {
          const v = JSON.parse(localStorage.getItem(localStorage.key(i)));
          const st = v && (v.appState || v.state || v);
          if (st && typeof st.scrollX === 'number' && st.zoom) {
            scrollX = st.scrollX; scrollY = st.scrollY;
            zoom = typeof st.zoom === 'object' ? st.zoom.value : st.zoom;
          }
        } catch {}
      }
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { scrollX, scrollY, zoom, left: r.left, top: r.top };
    });
    const toScreen = (sx, sy) => ({ x: view.left + (sx + view.scrollX) * view.zoom, y: view.top + (sy + view.scrollY) * view.zoom });
    // Grab the arrow a quarter along (scene 275,240 — off the central bend handle) and drag it down 60px to MOVE it.
    const grab = toScreen(275, 240);
    console.log('view:', JSON.stringify(view), 'grab screen:', JSON.stringify(grab));
    await page.mouse.click(grab.x, grab.y);
    await page.waitForTimeout(120);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y + 60, { steps: 12 });
    await page.mouse.up();
    // Let autosync (debounced) flush to the server.
    await page.waitForTimeout(2500);
    const after = await arrowOnServer(base);

    console.log('arrow before drag:', before ? 'PRESENT' : 'ABSENT');
    console.log('arrow after  drag:', after ? 'PRESENT' : 'ABSENT');
    if (after) console.log('after points:', JSON.stringify(after.points), 'x:', after.x, 'y:', after.y);
    const normErr = consoleErrors.some(e => /not normalized/i.test(e));
    // The bug flings the arrow to absurd coordinates (x ~4096) → off-screen "disappearance".
    const coords = after ? [after.x, after.y, ...(after.points || []).flat()].map(Math.abs) : [];
    const flung = coords.some(c => c > 2000);
    if (consoleErrors.length) { console.log('--- browser errors ---'); consoleErrors.slice(0, 6).forEach(e => console.log(e)); }

    const ok = !!before && !!after && !normErr && !flung;
    console.log(ok ? 'PASS: arrow moved cleanly, normalized, on-screen'
      : `FAIL: ${!after ? 'arrow gone' : normErr ? 'not-normalized error' : flung ? 'arrow flung off-screen' : 'unknown'}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (browser) await browser.close();
    server.kill('SIGKILL');
  }
}
main().catch(e => { console.error(e); process.exit(2); });
