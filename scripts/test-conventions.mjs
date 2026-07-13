// Self-check for diagram conventions: every declared type has non-empty
// content covering the sections the guide promises.
import assert from 'node:assert';
import { DIAGRAM_CONVENTIONS, DIAGRAM_TYPES } from '../dist/diagramConventions.js';

const EXPECTED = ['network', 'cloud-aws', 'cloud-gcp', 'cloud-azure', 'c4', 'erd', 'flowchart', 'sequence'];

assert.deepStrictEqual([...DIAGRAM_TYPES].sort(), [...EXPECTED].sort(), 'type list drifted');

for (const type of DIAGRAM_TYPES) {
  const text = DIAGRAM_CONVENTIONS[type];
  assert.ok(text && text.length > 300, `${type}: convention too short`);
  assert.ok(text.startsWith('# '), `${type}: missing title heading`);
}

// Cloud conventions must mandate boundary containers; flowchart must fix shape semantics.
for (const type of ['cloud-aws', 'cloud-gcp', 'cloud-azure']) {
  assert.ok(/boundary|Containers/i.test(DIAGRAM_CONVENTIONS[type]), `${type}: no container/boundary rules`);
}
assert.ok(/diamond/i.test(DIAGRAM_CONVENTIONS.flowchart), 'flowchart: no decision-diamond rule');

console.log(`OK — ${DIAGRAM_TYPES.length} diagram conventions validated`);
