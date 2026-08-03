// Regression test: a Mermaid diagram sent to the canvas must come back as
// Excalidraw elements.
//
// The conversion runs in the browser, not in Node: POST /api/elements/from-mermaid
// only broadcasts over WebSocket, and the frontend calls parseMermaidToExcalidraw
// and syncs the result back. So only a real page proves it works — which is also
// why bumping a dependency of @excalidraw/mermaid-to-excalidraw (nanoid) cannot be
// verified by `npm run build` alone.
//
// Requires chromium: `npx playwright install chromium`. Run: `npm run test:mermaid`.
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

async function waitFor(fn, { timeout = 30000, interval = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch { /* ainda nao */ }
    await new Promise(r => setTimeout(r, interval));
  }
  return null;
}

const DIAGRAM = `flowchart TD
  A[Cliente] --> B{Autenticado?}
  B -- sim --> C[Servico]
  B -- nao --> D[Login]
  C --> E[(Banco)]`;

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['dist/server.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let browser;
  const erros = [];
  const logs = [];
  try {
    await waitFor(async () => (await fetch(`${base}/api/elements`).catch(() => null))?.ok);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => {
      logs.push(m.text());
      if (m.type() === 'error') erros.push('console: ' + m.text());
    });

    await page.goto(base);
    await page.waitForSelector('canvas', { timeout: 20000 });
    // A pagina precisa ter aberto o WebSocket antes do broadcast, senao a
    // mensagem de conversao se perde e o teste falha por corrida, nao por bug.
    await page.waitForTimeout(2000);

    const r = await fetch(`${base}/api/elements/from-mermaid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mermaidDiagram: DIAGRAM }),
    });
    if (!r.ok) throw new Error(`from-mermaid respondeu ${r.status}`);

    // A asserção é sobre a conversão, não sobre o estado do servidor. Depois de
    // converter, o handler chama `syncToBackend`, que hoje aborta com
    // "Excalidraw API not available" — `excalidrawAPI` chega null no closure do
    // handler de WebSocket. Enquanto isso não for corrigido, o servidor termina
    // com zero elementos mesmo quando a conversão deu certo, e assertar ali
    // mediria aquele bug em vez desta biblioteca.
    const convertido = await waitFor(async () => {
      const linha = logs.find(l => /Mermaid diagram converted successfully: (\d+) elements/.test(l));
      return linha ? Number(linha.match(/(\d+) elements/)[1]) : null;
    });

    if (erros.length) {
      console.log('--- erros do browser ---');
      erros.slice(0, 8).forEach(e => console.log(e));
    }

    // 5 nós + 4 arestas geram bem mais que 3 elementos. O limite baixo evita
    // depender do número exato, que muda com a versão do mermaid, mas ainda
    // pega "converteu nada".
    const quebrou = erros.some(e => /nanoid|is not a function|Cannot find module|Failed to fetch dynamically/i.test(e));
    const ok = !!convertido && convertido >= 3 && !quebrou;
    console.log(ok
      ? `PASS: mermaid convertido em ${convertido} elementos`
      : `FAIL: ${!convertido ? 'a conversão não completou' : quebrou ? 'erro no browser durante a conversão' : `só ${convertido} elementos`}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (browser) await browser.close();
    server.kill('SIGKILL');
  }
}

main().catch(e => { console.error(e); process.exit(2); });
