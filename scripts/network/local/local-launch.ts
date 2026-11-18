/** Vérifie l’accès direct local et le renouvellement TLS sans changer de salon. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { get } from 'node:http';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { setTimeout as wait } from 'node:timers/promises';
import { createLocalNetwork } from '../../../server/net/local/localNetwork.js';

const dir = mkdtempSync(join(tmpdir(), 'crashout-local-test-'));
const child = spawn(process.execPath, ['dist/server/index.js'], {
  env: { ...process.env, PORT: '0', CRASHOUT_LOCAL_NETWORK: '1', CRASHOUT_LOCAL_HTTPS_PORT: '0',
    CRASHOUT_LOCAL_CA_DIR: dir, CRASHOUT_SOLO_TEST: '0', CRASHOUT_DEV_TOOLS: '0',
    CRASHOUT_PUBLIC_URL: 'https://ancienne-adresse.test' },
});
const exit = once(child, 'exit');
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });

try {
  for (let i = 0; i < 120 && !/Local:\s+http:/.test(output); i++) await wait(50);
  const url = output.match(/Local:\s+(http:\/\/localhost:\d+)/)?.[1];
  assert.ok(url, output);
  const response = await fetch(url + '/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const admin = await fetch(url + '/api/admin');
  assert.equal(admin.status, 200);
  assert.equal((await fetch(url + '/oz')).status, 200);
  assert.equal((await fetch(url + '/play')).status, 200);
  assert.equal((await fetch(url + '/un-ancien-chemin')).status, 404);
  // Un Host public relayé sur la machine locale ne doit pas bénéficier de l’accès direct.
  const forwarded = await new Promise<number | undefined>((resolve, reject) => {
    get(url + '/api/admin', { headers: { Host: 'demo.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(forwarded, 401);
  const wrongOrigin = new WebSocket(url.replace('http:', 'ws:') + '/ws/oz', { origin: 'https://demo.example' });
  const [failure] = await once(wrongOrigin, 'error');
  assert.match(failure.message, /401/);
  const info = await (await fetch(url + '/api/session')).json();
  assert.ok(info.localNetwork);
  assert.ok(info.baseUrls.every((base: string) => base.startsWith('http://')));
  assert.ok(info.secureBaseUrls.every((base: string) => base.startsWith('https://')));
  assert.ok(!JSON.stringify(info).includes('ancienne-adresse.test'));
  const certificate = await fetch(url + '/certificat-local.cer');
  assert.equal(certificate.status, 200);
  const root = new X509Certificate(Buffer.from(await certificate.arrayBuffer()));
  const ca = readFileSync(join(dir, 'authority', 'ca.pem'));
  assert.equal(root.fingerprint256, new X509Certificate(ca).fingerprint256);
  const reset = await fetch(url + '/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset', room: info.room }) });
  assert.equal(reset.status, 200);
  assert.equal((await (await fetch(url + '/api/session')).json()).room, info.room);
  console.log('✓ Lancement local : table sans cookie, Oz, URL joueur HTTP, certificat et salon stable après reset');

  process.env.CRASHOUT_LOCAL_CA_DIR = dir;
  let addresses = ['192.0.2.11'];
  const network = createLocalNetwork((_req, res) => { res.end('ok'); }, () => addresses);
  try {
    network.https.listen(0, '127.0.0.1');
    await once(network.https, 'listening');
    const port = (network.https.address() as AddressInfo).port;
    const peer = async () => {
      const socket = connect({ host: '127.0.0.1', port, servername: 'localhost', ca });
      try {
        await once(socket, 'secureConnect', { signal: AbortSignal.timeout(2500) });
        return new X509Certificate(socket.getPeerCertificate().raw);
      } finally { socket.destroy(); }
    };
    const before = await peer();
    assert.equal(before.checkIP(addresses[0]), addresses[0]);
    addresses = ['192.0.2.62'];
    assert.deepEqual(network.addresses(3001).baseUrls, ['http://192.0.2.62:3001']);
    assert.deepEqual(network.addresses(3001).secureBaseUrls, []);
    network.refresh();
    assert.deepEqual(network.addresses(3001).secureBaseUrls, [`https://192.0.2.62:${port}`]);
    const after = await peer();
    assert.notEqual(after.fingerprint256, before.fingerprint256);
    assert.equal(after.checkIP(addresses[0]), addresses[0]);
    assert.equal(after.checkIP('192.0.2.11'), undefined);
    console.log('✓ Changement d’adresse : QR actualisé et certificat remplacé sans redémarrer');
  } finally { network.https.close(); }
} finally {
  child.kill();
  await exit;
  rmSync(dir, { recursive: true, force: true });
}
