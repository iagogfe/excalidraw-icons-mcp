// Eval harness: recall@3 of search_official_icon over a fixed gold set.
// Deterministic/offline: network (iconify) is disabled so only bundled sources count.
// Usage: node scripts/eval-icon-search.mjs [--verbose]

import { searchOfficialIcons } from '../dist/officialIcons.js';

// Kill network so iconify fallback never pollutes results (it catches and returns []).
globalThis.fetch = () => Promise.reject(new Error('offline eval'));

// Each case: query as an agent would phrase it -> regexes; hit if ANY of the top-3
// refs matches ANY regex.
const GOLD = [
  // AWS
  { q: 's3', expect: [/Arch_Amazon-Simple-Storage-Service_48/] },
  { q: 's3 bucket', expect: [/Arch_Amazon-Simple-Storage-Service_48/] },
  { q: 'ec2', expect: [/Arch_Amazon-EC2_48/] },
  { q: 'ec2 instance', expect: [/Arch_Amazon-EC2/] },
  { q: 'lambda', expect: [/Arch_AWS-Lambda_48/] },
  { q: 'aws lambda', expect: [/Arch_AWS-Lambda_48/] },
  { q: 'sqs', expect: [/Arch_Amazon-Simple-Queue-Service_48/] },
  { q: 'sns', expect: [/Arch_Amazon-Simple-Notification-Service_48/] },
  { q: 'eks', expect: [/Arch_Amazon-Elastic-Kubernetes-Service_48/] },
  { q: 'application load balancer', expect: [/Application-Load-Balancer/] },
  { q: 'aws load balancer', expect: [/Elastic-Load-Balancing/] },
  { q: 'aws waf', expect: [/Arch_AWS-WAF_48/] },
  { q: 'dynamodb', expect: [/Arch_Amazon-DynamoDB_48/] },
  { q: 'api gateway', expect: [/Arch_Amazon-API-Gateway_48/, /developer_services_api_gateway/] },
  // Azure
  { q: 'app service', expect: [/App-Services\.svg/] },
  { q: 'azure functions', expect: [/Function-Apps/] },
  { q: 'azure vm', expect: [/azure\/Virtual-Machine/] },
  { q: 'virtual machine', expect: [/Virtual-Machine/, /compute_virtual_machine/] },
  { q: 'blob storage', expect: [/Storage-Accounts\.svg/, /Blob-Block/] },
  { q: 'cosmos db', expect: [/Azure-Cosmos-DB/] },
  { q: 'azure kubernetes', expect: [/Kubernetes-Services/, /AKS-Automatic/] },
  { q: 'key vault', expect: [/Key-Vaults/] },
  { q: 'application gateway', expect: [/Application-Gateways/] },
  // GCP
  { q: 'bigquery', expect: [/gcp\/bigquery/] },
  { q: 'cloud run', expect: [/cloud_run\.svg/] },
  { q: 'gke', expect: [/google_kubernetes_engine/] },
  { q: 'cloud sql', expect: [/cloud_sql\.svg/] },
  { q: 'pub sub', expect: [/gcp\/pubsub/] },
  { q: 'pubsub', expect: [/gcp\/pubsub/] },
  { q: 'compute engine', expect: [/compute_engine\.svg/] },
  { q: 'cloud storage', expect: [/gcp\/cloud_storage\.svg/] },
  // Oracle
  { q: 'autonomous database', expect: [/database_autonomous/] },
  { q: 'oci load balancer', expect: [/networking.*load_balancer/] },
  { q: 'object storage', expect: [/storage_object_storage/] },
  { q: 'oracle compute vm', expect: [/compute_virtual_machine/] },
  // Kubernetes
  { q: 'pod', expect: [/resources\/pod\.svg/] },
  { q: 'deployment', expect: [/resources\/deploy\.svg/] },
  { q: 'ingress', expect: [/resources\/ing\.svg/] },
  { q: 'kubernetes service', expect: [/resources\/svc\.svg/] },
  { q: 'configmap', expect: [/resources\/cm\.svg/] },
  { q: 'statefulset', expect: [/resources\/sts\.svg/] },
  // Brands / generic
  { q: 'postgresql', expect: [/simple-icons:postgresql/] },
  { q: 'redis', expect: [/simple-icons:redis/] },
  { q: 'kafka', expect: [/simple-icons:apachekafka/] },
];

const verbose = process.argv.includes('--verbose');
let hits = 0;
const misses = [];

for (const { q, expect } of GOLD) {
  const results = await searchOfficialIcons(q, 3);
  const refs = results.map(r => r.ref);
  const hit = refs.some(ref => expect.some(re => re.test(ref)));
  if (hit) hits++;
  else misses.push({ q, got: refs });
  if (verbose) {
    console.log(`${hit ? 'HIT ' : 'MISS'} ${q.padEnd(28)} -> ${refs.join(' | ') || '(nothing)'}`);
  }
}

const recall = (hits / GOLD.length) * 100;
if (misses.length && !verbose) {
  console.log('Misses:');
  for (const m of misses) console.log(`  ${m.q.padEnd(28)} -> ${m.got.join(' | ') || '(nothing)'}`);
}
console.log(`recall@3: ${hits}/${GOLD.length}`);
console.log(`METRIC ${recall.toFixed(1)}`);
