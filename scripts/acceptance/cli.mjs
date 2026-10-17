#!/usr/bin/env node
import { readFileSync, writeFileSync, chmodSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { GatewayClient } from '@openclaw/gateway-client';
import { runAcceptance, validateOptions } from './runner.mjs';
import { parseJournal } from './evidence.mjs';

const [action, settingsPath] = process.argv.slice(2);
if (!['init-device', 'validate', 'dry-run', 'run', 'restore'].includes(action) || !settingsPath) throw new Error('Usage: node scripts/acceptance/cli.mjs init-device|validate|dry-run|run|restore <private-settings.json>');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
validateOptions(settings);
if (action === 'validate') {
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
if (action === 'run' && (process.env.ROUTER_ACCEPTANCE_LIVE !== 'YES' || process.env.ROUTER_ACCEPTANCE_APPROVED_TURNS !== String(settings.maxTurns))) throw new Error('Explicit live window and matching approved turn ceiling required');
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
const completed = new Map();
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
    if (!p?.runId || !['final', 'error', 'aborted'].includes(p.state)) return;
    completed.set(p.runId, p);
    waiters.get(p.runId)?.(p.state === 'final' ? null : new Error(`Turn ended ${p.state}`), p);
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
      if (completed.has(runId)) return completed.get(runId);
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(runId); reject(new Error('No terminal chat event; no retry')); }, ms);
        waiters.set(runId, (error, payload) => { clearTimeout(timer); waiters.delete(runId); error ? reject(error) : resolve(payload); });
      });
    },
    readEvidence: (runId, since) => {
      const output = execFileSync('journalctl', ['--user', '-u', 'openclaw-gateway-router-test.service', '--no-pager', '-o', 'cat', '--since', since], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      return parseJournal(output, runId);
    },
  };
  const recoveryFile = settings.deviceFile + '.restore.json';
  if (action === 'restore') {
    const saved = JSON.parse(readFileSync(recoveryFile, 'utf8'));
    if (saved.agentId !== settings.agentId) throw new Error('Recovery agent does not match settings');
    const current = await rpc.request('config.get', {});
    await rpc.request('config.patch', { baseHash: current.hash, raw: JSON.stringify({ agents: { entries: { [saved.agentId]: { model: saved.agentModel } } }, plugins: { entries: { 'deterministic-router': { config: { mode: saved.router.mode, autoSessionKeyHashes: saved.router.autoSessionKeyHashes } } } } }), replacePaths: ['plugins.entries.deterministic-router.config.autoSessionKeyHashes'] });
    const aResponse = await rpc.request('sessions.describe', { key: saved.sessionA });
    const a = aResponse?.entry ?? aResponse?.session ?? aResponse;
    if (a?.sessionId !== saved.sessionAId) throw new Error('A session generation changed; selection not cleared');
    if (a.modelOverrideSource === 'user') {
      if ((a.modelOverride ?? a.model) !== 'gpt-6-sol' || (a.providerOverride ?? a.modelProvider) !== 'openai') throw new Error('A selection changed; refusing to clear a different user choice');
      await rpc.request('sessions.patch', { key: saved.sessionA, model: null });
    }
    const verified = await rpc.request('config.get', {});
    const actualRouter = verified.config?.plugins?.entries?.['deterministic-router']?.config;
    if (JSON.stringify(actualRouter) !== JSON.stringify(saved.router) || verified.config?.agents?.entries?.[saved.agentId]?.model !== saved.agentModel) throw new Error('Recovery verification failed; inspect TEST manually');
    const selected = await rpc.request('sessions.describe', { key: saved.sessionA });
    const selectedEntry = selected?.entry ?? selected?.session ?? selected;
    if (selectedEntry.modelOverrideSource === 'user') throw new Error('A selection restoration not verified');
    unlinkSync(recoveryFile);
    process.stdout.write('TEST config and A selection restored and verified. No inference turns used.\n');
  } else if (action === 'dry-run') {
    const result = await runAcceptance(rpc, { ...settings, dryRun: true });
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    const onBaseline = baseline => {
      if (existsSync(recoveryFile)) throw new Error('Existing recovery file: restore or archive it before another run');
      writeFileSync(recoveryFile, JSON.stringify(baseline), { mode: 0o600, flag: 'wx' });
      chmodSync(recoveryFile, 0o600);
    };
    try {
      const result = await runAcceptance(rpc, { ...settings, shouldStop: () => interrupted, onBaseline }, record => process.stdout.write(JSON.stringify(record) + '\n'));
      if (settings.reportFile) { writeFileSync(settings.reportFile, JSON.stringify(result, null, 2), { mode: 0o600 }); chmodSync(settings.reportFile, 0o600); }
      process.stdout.write(JSON.stringify(result) + '\n');
      if (result.restoration === 'PASS' && existsSync(recoveryFile)) unlinkSync(recoveryFile);
      if (result.result !== 'PASS') process.exitCode = 1;
    } catch (error) {
      const report = error.report ?? { result: 'INCONCLUSIVE', restoration: 'UNVERIFIED', error: error.message };
      if (settings.reportFile) { writeFileSync(settings.reportFile, JSON.stringify(report, null, 2), { mode: 0o600 }); chmodSync(settings.reportFile, 0o600); }
      process.stdout.write(JSON.stringify(report) + '\n');
      if (report.restoration === 'PASS' && existsSync(recoveryFile)) unlinkSync(recoveryFile);
      process.exitCode = 1;
    }
  }
} finally {
  clearTimeout(timeout);
  await client.stopAndWait({ timeoutMs: 3000 });
}
