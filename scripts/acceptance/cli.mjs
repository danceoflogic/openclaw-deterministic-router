#!/usr/bin/env node
import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { GatewayClient } from '@openclaw/gateway-client';
import { runAcceptance, validateOptions } from './runner.mjs';

const [action, settingsPath] = process.argv.slice(2);
if (!['init-device', 'dry-run', 'run'].includes(action) || !settingsPath) throw new Error('Usage: node scripts/acceptance/cli.mjs init-device|dry-run|run <private-settings.json>');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
validateOptions(settings);
if (action === 'dry-run') {
  process.stdout.write('Offline validation passed; Gateway calls: 0; inference turns: 0.\n');
  process.exit(0);
}
if (action === 'init-device') {
  if (existsSync(settings.deviceFile)) throw new Error('Device file already exists');
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const deviceId = createHash('sha256').update(raw).digest('hex');
  writeFileSync(settings.deviceFile, JSON.stringify({ deviceId, publicKeyPem, privateKeyPem }), { mode: 0o600, flag: 'wx' });
  chmodSync(settings.deviceFile, 0o600);
  process.stdout.write('Private device identity created. Pair it as an operator with read, write and admin scopes before run.\n');
  process.exit(0);
}
if (process.env.ROUTER_ACCEPTANCE_LIVE !== 'YES' || process.env.ROUTER_ACCEPTANCE_APPROVED_TURNS !== String(settings.maxTurns)) throw new Error('Explicit live window and matching approved turn ceiling required');
const identity = JSON.parse(readFileSync(settings.deviceFile, 'utf8'));
const rawKey = createPublicKey(identity.publicKeyPem).export({ type: 'spki', format: 'der' }).subarray(-32);
if (createHash('sha256').update(rawKey).digest('hex') !== identity.deviceId) throw new Error('Device identity mismatch');
if (createPublicKey(createPrivateKey(identity.privateKeyPem)).export({ type: 'spki', format: 'pem' }) !== identity.publicKeyPem) throw new Error('Device key mismatch');
let ready, failed;
const readyPromise = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
const waiters = new Map();
let interrupted = false;
for (const signalName of ['SIGINT', 'SIGTERM']) process.on(signalName, () => {
  interrupted = true;
  for (const waiter of waiters.values()) waiter(new Error('Operator interrupted'));
});
const completed = new Set();
const tokenFile = settings.deviceFile + '.token';
const client = new GatewayClient({
  url: settings.gatewayUrl, role: 'operator', scopes: ['operator.read', 'operator.write', 'operator.admin'],
  clientName: 'cli', mode: 'cli', deviceIdentity: identity,
  ...(process.env.OPENCLAW_GATEWAY_TOKEN ? { token: process.env.OPENCLAW_GATEWAY_TOKEN } : {}),
  hostDeps: {
    signDevicePayload: (pem, payload) => sign(null, Buffer.from(payload), createPrivateKey(pem)).toString('base64url'),
    publicKeyRawBase64UrlFromPem: pem => createPublicKey(pem).export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url'),
    loadDeviceAuthToken: () => existsSync(tokenFile) ? { token: readFileSync(tokenFile, 'utf8').trim(), scopes: ['operator.read', 'operator.write', 'operator.admin'] } : null,
    storeDeviceAuthToken: ({ token }) => { writeFileSync(tokenFile, token, { mode: 0o600 }); chmodSync(tokenFile, 0o600); },
    clearDeviceAuthToken: () => {},
  },
  onHelloOk: ready,
  onConnectError: failed,
  onEvent: evt => {
    if (evt?.event !== 'chat') return;
    const p = evt.payload;
    if (p?.state !== 'final' || !p.runId) return;
    completed.add(p.runId);
    waiters.get(p.runId)?.();
  },
});
const timeout = setTimeout(() => failed(new Error('Device connection/pairing timed out; approve exact request with openclaw devices list/approve')), 15000);
try {
  client.start();
  await readyPromise;
  clearTimeout(timeout);
  const rpc = {
    request: (method, params) => client.request(method, params),
    waitForRun: async (runId, _key, ms) => {
      if (interrupted) throw new Error('Operator interrupted');
      if (completed.has(runId)) return;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(runId); reject(new Error('No terminal chat event; no retry')); }, ms);
        waiters.set(runId, error => { clearTimeout(timer); waiters.delete(runId); error ? reject(error) : resolve(); });
      });
    },
  };
  const result = await runAcceptance(rpc, { ...settings, shouldStop: () => interrupted }, record => process.stdout.write(JSON.stringify(record) + '\n'));
  process.stdout.write(JSON.stringify(result) + '\n');
} finally {
  clearTimeout(timeout);
  await client.stopAndWait({ timeoutMs: 3000 });
}
