// Self-check for cachePath: names that stay inside the cache directory resolve,
// names that escape it throw.
//
// Regression guard for the Semgrep path-traversal finding on src/libraries.ts.
// Traversal used to be blocked only as a side effect of statsKey stripping `/`
// while formatting stats.json keys — accidental, and POSIX-only, since `\`
// survived it and separates paths on Windows.
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { cachePath, getCacheDir } from '../dist/libraries.js';

const DIR = path.resolve(getCacheDir());

// Nomes legitimos: os que o statsKey produz.
for (const nome of ['lib-dwelle-network-topology-icons.json', 'manifest.json']) {
  assert.strictEqual(cachePath(nome), path.join(DIR, nome), `${nome}: should resolve inside the cache dir`);
}

const ESCAPES = [
  '../evil.json',
  '../../etc/passwd',
  'sub/../../evil.json',
  path.join('..', 'evil.json'),
  // Separador do Windows: e este que o statsKey nao neutraliza.
  ...(os.platform() === 'win32' ? ['..\\evil.json'] : []),
];

for (const nome of ESCAPES) {
  assert.throws(
    () => cachePath(nome),
    /outside the cache directory/,
    `${nome}: should have been refused`
  );
}

// Caminho absoluto e reancorado pelo path.join, nao aplicado como esta: vira
// "<cache>/tmp/evil.json", que continua dentro do diretorio e portanto passa.
// Fixado aqui porque um refactor para `path.resolve(dir, fileName)` mudaria
// isso em silencio — o resolve trataria o argumento absoluto como destino.
const absoluto = cachePath(path.join(path.sep, 'tmp', 'evil.json'));
assert.ok(absoluto.startsWith(DIR + path.sep), 'caminho absoluto deveria ser reancorado dentro do cache');

console.log(`OK — cachePath aceitou 3 nomes validos e recusou ${ESCAPES.length} travessias`);
