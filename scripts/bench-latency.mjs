// Latency benchmark: end-to-end MCP tool calls over stdio (index.js) hitting a
// dedicated canvas server (server.js). No browser, no external network.
// Prints `METRIC <ms>` = median wall-time of 3 scenario repetitions.
// Usage: node scripts/bench-latency.mjs [--verbose]

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 3211;
const BASE = `http://127.0.0.1:${PORT}`;
const verbose = process.argv.includes('--verbose');

function log(...a) { if (verbose) console.error('[bench]', ...a); }

// --- boot canvas server ---------------------------------------------------
const canvas = spawn('node', ['dist/server.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'ignore', 'ignore'],
});
let up = false;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(`${BASE}/api/elements`);
    if (r.ok) { up = true; break; }
  } catch { /* not yet */ }
  await sleep(100);
}
if (!up) { canvas.kill(); throw new Error('canvas server did not start'); }
log('canvas up');

// --- boot MCP server (stdio) ----------------------------------------------
const mcp = spawn('node', ['dist/index.js'], {
  env: { ...process.env, EXPRESS_SERVER_URL: BASE },
  stdio: ['pipe', 'pipe', 'ignore'],
});

const pending = new Map();
let buf = '';
mcp.stdout.on('data', chunk => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  const p = new Promise(res => pending.set(id, res));
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return p;
}
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
}
async function call(name, args) {
  const r = await rpc('tools/call', { name, arguments: args });
  if (r.error) throw new Error(`tools/call ${name}: ${r.error.message}`);
  return r;
}

await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'bench', version: '0' },
});
notify('notifications/initialized');
log('mcp up');

// --- scenario -------------------------------------------------------------
function rect(i, prefix) {
  return {
    type: 'rectangle', id: `${prefix}-${i}`,
    x: (i % 10) * 200, y: Math.floor(i / 10) * 120,
    width: 160, height: 80, backgroundColor: '#d0ebff', text: `node ${i}`,
  };
}

const SEARCHES = ['s3', 'ec2', 'pod', 'bigquery', 'app service', 'router', 'postgresql', 'eks', 'key vault', 'deployment'];

async function scenario(tag) {
  await call('clear_canvas', {});
  // 20 single creates
  for (let i = 0; i < 20; i++) await call('create_element', rect(i, `${tag}-c`));
  // 5 batches of 20
  for (let b = 0; b < 5; b++) {
    await call('batch_create_elements', {
      elements: Array.from({ length: 20 }, (_, i) => rect(b * 20 + i, `${tag}-b`)),
    });
  }
  // 10 updates
  for (let i = 0; i < 10; i++) {
    await call('update_element', { id: `${tag}-c-${i}`, backgroundColor: '#ffec99', x: i * 7 });
  }
  // 10 gets + 10 queries
  for (let i = 0; i < 10; i++) await call('get_element', { id: `${tag}-b-${i}` });
  for (let i = 0; i < 10; i++) await call('query_elements', { type: 'rectangle' });
  // 5 describes
  for (let i = 0; i < 5; i++) await call('describe_scene', {});
  // 10 local icon searches (no network: local sources fill limit 3)
  for (const q of SEARCHES) await call('search_official_icon', { query: q, limit: 3 });
  // 10 deletes
  for (let i = 0; i < 10; i++) await call('delete_element', { id: `${tag}-c-${i}` });
}

// warmup (not measured)
await scenario('warm');
log('warmup done');

const times = [];
for (let rep = 0; rep < 3; rep++) {
  const t0 = performance.now();
  await scenario(`r${rep}`);
  const ms = performance.now() - t0;
  times.push(ms);
  log(`rep ${rep}: ${ms.toFixed(0)} ms`);
}

times.sort((a, b) => a - b);
const median = times[1];
console.log(`reps: ${times.map(t => t.toFixed(0)).join(' ')}`);
console.log(`METRIC ${median.toFixed(0)}`);

mcp.kill();
canvas.kill();
