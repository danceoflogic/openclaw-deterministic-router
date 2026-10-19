// One explicitly requested task on router-test. Reuses its existing paired device.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto';
import { GatewayClient } from '@openclaw/gateway-client';

const [action, settingsPath] = process.argv.slice(2);
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
if (settings.gatewayUrl !== 'ws://127.0.0.1:19879') throw Error('This runner only supports isolated router-test');
const identity = JSON.parse(readFileSync(settings.deviceFile, 'utf8'));
let ready, rejectReady, finish, rejectFinish;
const hello = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
const terminal = new Promise((resolve, reject) => { finish = resolve; rejectFinish = reject; });
let activeRun;
const early = new Map();
const client = new GatewayClient({ url: settings.gatewayUrl, role: 'operator',
  scopes: ['operator.read', 'operator.write', 'operator.admin'], clientName: 'cli', mode: 'cli', deviceIdentity: identity,
  hostDeps: {
    signDevicePayload: (pem, payload) => sign(null, Buffer.from(payload), createPrivateKey(pem)).toString('base64url'),
    publicKeyRawBase64UrlFromPem: pem => createPublicKey(pem).export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url'),
    loadDeviceAuthToken: () => ({ token: readFileSync(settings.deviceFile + '.token', 'utf8').trim(), scopes: ['operator.read', 'operator.write', 'operator.admin'] }),
    storeDeviceAuthToken: ({ token }) => writeFileSync(settings.deviceFile + '.token', token, { mode: 0o600 }),
    clearDeviceAuthToken() {},
  },
  onHelloOk: ready, onConnectError: rejectReady,
  onEvent(event) {
    const value = event?.payload;
    if (event?.event !== 'chat' || !['final', 'error', 'aborted'].includes(value?.state)) return;
    early.set(value.runId, value);
    if (value.runId === activeRun) finish(value);
  },
});
const connectTimeout = setTimeout(() => rejectReady(Error('TEST connection timeout')), 20_000);
let taskTimeout;
try {
  client.start(); await hello; clearTimeout(connectTimeout);
  if (action === 'preflight') {
    const receipt = await client.request('config.get', {});
    const config = receipt.config ?? receipt.parsed;
    const command = config?.plugins?.entries?.codex?.config?.appServer?.command;
    if (settings.expectedManagedLaunch ? command !== undefined : command !== settings.expectedBinary) {
      throw Error('Gateway does not expose the selected native launch configuration');
    }
    // Discovery is read-only and starts no turn/inference. It also loads the
    // selected captured harness so the caller can verify its fixture marker.
    await client.request('models.list', { agentId: 'main', view: 'all', refresh: true });
    console.log('Gateway config/native catalog preflight completed; no task sent.');
  } else if (action === 'create') {
    const receipt = await client.request('sessions.create', { key: settings.sessionKey, agentId: 'main',
      label: settings.label, idempotencyKey: randomUUID() });
    await client.request('sessions.patch', { key: settings.sessionKey, thinkingLevel: 'high' });
    writeFileSync(settingsPath + '.created.json', JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log('Created isolated TEST session; no inference sent.');
  } else if (action === 'send') {
    const routing = await client.request('deterministic-router.status', {});
    if (routing.mode !== 'auto' || routing.autoSessionAllowlistCount !== 1) throw Error('TEST candidate router is not scoped AUTO');
    const ack = await client.request('chat.send', { sessionKey: settings.sessionKey, message: settings.prompt, idempotencyKey: randomUUID() });
    activeRun = ack.runId;
    writeFileSync(settingsPath + '.ack.json', JSON.stringify(ack, null, 2), { mode: 0o600 });
    if (early.has(activeRun)) finish(early.get(activeRun));
    taskTimeout = setTimeout(() => rejectFinish(Error('TEST task deadline reached; no automatic resend')), settings.timeoutMs ?? 300_000);
    const result = await terminal;
    writeFileSync(settingsPath + '.result.json', JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ runId: activeRun, state: result.state }));
    if (result.state !== 'final') process.exitCode = 1;
  } else if (action === 'describe') {
    const receipt = await client.request('sessions.describe', { key: settings.sessionKey });
    writeFileSync(settingsPath + '.describe.json', JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log('Saved authoritative TEST session description.');
  } else if (action === 'status') {
    const status = await client.request('deterministic-router.status', {});
    writeFileSync(settingsPath + '.status.json', JSON.stringify(status, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ mode: status.mode, protectManualSelection: status.protectManualSelection,
      requireSessionKeyForAuto: status.requireSessionKeyForAuto, autoSessionAllowlistCount: status.autoSessionAllowlistCount }));
  } else throw Error('Expected preflight, create, send, describe or status');
} finally {
  clearTimeout(connectTimeout); clearTimeout(taskTimeout); client.stop();
}
