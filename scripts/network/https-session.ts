/**
 * Teste le serveur compilé en HTTP, HTTPS et derrière une URL publique.
 * Liens : server/net/sessionHttp.ts, scripts/network/fixtures/.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { get } from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { setTimeout as wait } from 'node:timers/promises';

const key = fileURLToPath(new URL('./fixtures/localhost-key.pem', import.meta.url));
const cert = fileURLToPath(new URL('./fixtures/localhost-cert.pem', import.meta.url));

/** Lance une instance compilée avec un port libre et sans hériter des réglages de séance. */
function launch(env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    env: { ...process.env, PORT: '0', CRASHOUT_TLS_KEY: undefined,
      CRASHOUT_TLS_CERT: undefined, CRASHOUT_PUBLIC_URL: undefined, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  return {
    output: () => output,
    exit: once(child, 'exit'),
    /** Attend que le serveur annonce son adresse ou arrête le scénario après deux secondes. */
    async origin() {
      const deadline = Date.now() + 2000;
      do {
        const url = output.match(/Local:\s+(https?:\/\/localhost:\d+)/)?.[1];
        if (url) return url;
        await wait(10);
      } while (Date.now() < deadline && child.exitCode === null);
      throw new Error(`Adresse serveur manquante. ${output}`);
    },
    stop: () => child.kill(),
  };
}

/** Lit une réponse HTTPS avec le seul certificat auto-signé prévu pour ce test. */
function readHttps(url: string): Promise<{ body: string; status: number | undefined }> {
  return new Promise((resolve, reject) => {
    get(url, { ca: fixtureCert }, res => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ body, status: res.statusCode }));
    }).on('error', reject);
  });
}

const fixtureCert = readFileSync(cert);
const http = launch({ CRASHOUT_PUBLIC_URL: 'https://session.example.test/' });
try {
  const url = await http.origin();
  const session = await (await fetch(`${url}/api/session`)).json();
  assert.match(session.room, /^[A-HJ-NP-Z2-9]{5}$/);
  const phone = await fetch(`${url}/play?room=${session.room}`);
  assert.equal(phone.status, 200);
  assert.match(await phone.text(), /Rejoindre la partie/);
  assert.equal(session.baseUrls[0], 'https://session.example.test');
  assert.equal(session.ozUrls[0], 'https://session.example.test/oz');
  assert.equal(session.secure, true);
} finally {
  http.stop();
  await http.exit;
}

const plain = launch();
try {
  const url = await plain.origin();
  const session = await (await fetch(`${url}/api/session`)).json();
  assert.equal(session.secure, false);
  assert.deepEqual(session.ozUrls, session.baseUrls.map((base: string) => `${base}/oz`));
  assert.match(plain.output(), /capteurs iOS indisponibles/);
} finally {
  plain.stop();
  await plain.exit;
}

const tls = launch({ CRASHOUT_TLS_KEY: key, CRASHOUT_TLS_CERT: cert });
try {
  const url = await tls.origin();
  const table = await readHttps(url);
  assert.equal(table.status, 200);
  assert.match(table.body, /Crashout Circuit/i);
  const { body } = await readHttps(`${url}/api/session`);
  const session = JSON.parse(body);
  assert.equal(session.secure, true);
  assert.ok(session.baseUrls.every((base: string) => base.startsWith('https://')));
  assert.deepEqual(session.ozUrls, session.baseUrls.map((base: string) => `${base}/oz`));
  const oz = new WebSocket(`${url.replace('https:', 'wss:')}/ws/oz`, { ca: fixtureCert });
  try {
    const [state] = await once(oz, 'message', { signal: AbortSignal.timeout(2000) });
    assert.equal(JSON.parse(state.toString()).type, 'State');
  } finally {
    oz.terminate();
  }
  const playerPage = await readHttps(`${url}/play?room=${session.room}`);
  assert.equal(playerPage.status, 200);
  assert.match(playerPage.body, /Rejoindre la partie/);
  const player = new WebSocket(`${url.replace('https:', 'wss:')}/ws/player`, { ca: fixtureCert });
  try {
    await once(player, 'message', { signal: AbortSignal.timeout(2000) });
    const confirmation = once(player, 'joined-seat', { signal: AbortSignal.timeout(2000) });
    player.on('message', bytes => {
      const message = JSON.parse(bytes.toString());
      if (message.type === 'Joined') player.emit('joined-seat', message.seat);
    });
    player.send(JSON.stringify({ type: 'Join', t: Date.now(), room: session.room, seat: 'A-pilot' }));
    const [seat] = await confirmation;
    assert.equal(seat, 'A-pilot');
  } finally {
    player.terminate();
  }
} finally {
  tls.stop();
  await tls.exit;
}

for (const [env, error] of [
  [{ CRASHOUT_TLS_KEY: key }, /doivent être définies ensemble/],
  [{ CRASHOUT_TLS_KEY: `${key}.absente`, CRASHOUT_TLS_CERT: cert }, /Impossible de charger/],
] as const) {
  const invalid = launch(env);
  try {
    const [code] = await invalid.exit;
    assert.equal(code, 1);
    assert.match(invalid.output(), error);
  } finally {
    invalid.stop();
  }
}
console.log('✓ HTTPS : pages table et téléphone, WSS Oz et joueur, URL publique, comportement HTTP et erreurs de certificats');
