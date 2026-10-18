#!/usr/bin/env node
import { readFileSync, writeFileSync, chmodSync, existsSync, unlinkSync, renameSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GatewayClient } from '@openclaw/gateway-client';
import { runAcceptance, validateOptions } from './runner.mjs';
import { runControls, validateControlOptions } from './controls.mjs';
import { runLifecycle, validateLifecycleOptions } from './lifecycle.mjs';
import { runChildPhase, validateChildOptions } from './child.mjs';
import { parseJournal } from './evidence.mjs';

const [action, settingsPath] = process.argv.slice(2);
if (!['init-device', 'validate', 'dry-run', 'run', 'resume-b', 'dry-run-controls', 'run-controls', 'dry-run-lifecycle', 'run-lifecycle', 'dry-run-child-parent', 'run-child-parent', 'dry-run-child-followup', 'run-child-followup', 'dry-run-child-first-turn', 'run-child-first-turn', 'restore'].includes(action) || !settingsPath) throw new Error('Usage: node scripts/acceptance/cli.mjs <action> <private-settings.json>');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
const childAction = action.includes('child-');
const firstTurnAction = action.endsWith('child-first-turn');
if (settings.lifecycle === true && !['validate', 'dry-run-lifecycle', 'run-lifecycle', 'restore'].includes(action)) throw new Error('Lifecycle settings require a lifecycle action');
if (settings.childTest === true && !['validate', 'dry-run-child-parent', 'run-child-parent', 'dry-run-child-followup', 'run-child-followup', 'dry-run-child-first-turn', 'run-child-first-turn', 'restore'].includes(action)) throw new Error('Child settings require a child action');
if (childAction || settings.childTest === true) validateChildOptions(settings);
else if (['dry-run-lifecycle', 'run-lifecycle'].includes(action) || settings.lifecycle === true) validateLifecycleOptions(settings);
else if (settings.maxTurns === 3) validateControlOptions(settings);
else validateOptions(settings);
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
if (['run', 'resume-b', 'run-controls', 'run-lifecycle', 'run-child-parent', 'run-child-followup', 'run-child-first-turn'].includes(action) && (process.env.ROUTER_ACCEPTANCE_LIVE !== 'YES' || process.env.ROUTER_ACCEPTANCE_APPROVED_TURNS !== String(settings.maxTurns))) throw new Error('Explicit live window and matching approved turn ceiling required');
const identity = JSON.parse(readFileSync(settings.deviceFile, 'utf8'));
const rawKey = createPublicKey(identity.publicKeyPem).export({ type: 'spki', format: 'der' }).subarray(-32);
if (createHash('sha256').update(rawKey).digest('hex') !== identity.deviceId) throw new Error('Device identity mismatch');
if (createPublicKey(createPrivateKey(identity.privateKeyPem)).export({ type: 'spki', format: 'pem' }) !== identity.publicKeyPem) throw new Error('Device key mismatch');
let ready, failed, hello;
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
  onHelloOk: value => { hello = value; ready(value); },
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
    methods: hello?.features?.methods ?? [],
    request: (method, params) => client.request(method, params),
    waitForRun: async (runId, key, ms) => {
      if (interrupted) throw new Error('Operator interrupted');
      const terminal = completed.has(runId) ? completed.get(runId) : await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(runId); reject(new Error('No terminal chat event; no retry')); }, ms);
        waiters.set(runId, (error, payload) => { clearTimeout(timer); waiters.delete(runId); error ? reject(error) : resolve(payload); });
      });
      if (terminal.sessionKey && terminal.sessionKey !== key) throw new Error('Terminal event session mismatch');
      return terminal;
    },
    readEvidence: (runId, since) => {
      const output = execFileSync('journalctl', ['--user', '-u', 'openclaw-gateway-router-test.service', '--no-pager', '-o', 'cat', '--since', since], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      return parseJournal(output, runId);
    },
    readAllEvidence: since => {
      const output = execFileSync('journalctl', ['--user', '-u', 'openclaw-gateway-router-test.service', '--no-pager', '-o', 'cat', '--since', since], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      return parseJournal(output);
    },
    readAuthoritativeSession: (key, exactPrompt) => {
      if (!firstTurnAction || settings.gatewayUrl !== 'ws://127.0.0.1:19879' || settings.profile !== 'router-test' || settings.agentId !== 'main') throw new Error('Authoritative read restricted to Issue #8 TEST');
      const executable = execFileSync('which', ['openclaw'], { encoding: 'utf8' }).trim();
      const packageRoot = dirname(realpathSync(executable));
      const moduleUrl = pathToFileURL(join(packageRoot, 'dist/plugin-sdk/session-store-runtime.js')).href;
      const script = 'const {getSessionEntry,loadTranscriptEventsSync}=await import(process.argv[1]); const entry=getSessionEntry({agentId:"main",sessionKey:process.argv[2],readConsistency:"latest"}); const priorExactPromptCount=entry&&process.argv[3]?loadTranscriptEventsSync({agentId:"main",sessionId:entry.sessionId,sessionKey:process.argv[2]}).filter(v=>v.message?.role==="user"&&v.message?.content===process.argv[3]).length:undefined; const result=entry?Object.assign({},entry,priorExactPromptCount===undefined?{}:{priorExactPromptCount}):null; process.stdout.write(JSON.stringify(result)); process.exit(0);';
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, moduleUrl, key, exactPrompt ?? ''], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, env: { ...process.env, OPENCLAW_STATE_DIR: '/home/stduser/.openclaw-router-test' } });
      return JSON.parse(output);
    },
  };
  const recoveryFile = settings.deviceFile + '.restore.json';
  if (action === 'restore') {
    const saved = JSON.parse(readFileSync(recoveryFile, 'utf8'));
    if (saved.agentId !== settings.agentId) throw new Error('Recovery agent does not match settings');
    const current = await rpc.request('config.get', {});
    await rpc.request('config.patch', { baseHash: current.hash, raw: JSON.stringify({ agents: { entries: { [saved.agentId]: { model: saved.agentModel } } }, plugins: { entries: { 'deterministic-router': { config: { mode: saved.router.mode, autoSessionKeyHashes: saved.router.autoSessionKeyHashes, ...(saved.firstTurn === true ? { autoSpawnParentGrants: saved.router.autoSpawnParentGrants ?? null } : {}) } } } } }), replacePaths: ['plugins.entries.deterministic-router.config.autoSessionKeyHashes', ...(saved.firstTurn === true ? ['plugins.entries.deterministic-router.config.autoSpawnParentGrants'] : [])] });
    if (saved.kind === 'lifecycle') {
      for (const key of [saved.sessionA, saved.sessionB]) {
        if (!key?.startsWith(`agent:${saved.agentId}:dashboard:router-i7-`)) throw new Error('Recovery key is not disposable');
        const response = await rpc.request('sessions.describe', { key });
        const entry = response?.entry ?? response?.session ?? response;
        if (!entry) continue;
        const known = saved.created?.find(x => x.key === key);
        if (!known) throw new Error('Unconfirmed disposable session exists; inspect TEST before recovery');
        if (entry.sessionId !== known.sessionId || entry.lifecycleRevision !== known.lifecycleRevision) throw new Error('Disposable session generation changed; refusing selection cleanup');
        if (entry.agentId !== saved.agentId || entry.createdActor?.type !== 'human' || entry.createdActor?.identity?.type !== 'profile' || entry.createdActor.identity.id !== settings.ownerProfileId || entry.hasActiveRun !== false) throw new Error('Disposable session attribution or idle state changed');
        if (entry.modelOverrideSource === 'user') {
          if (entry.modelOverride !== 'gpt-6-sol' || entry.providerOverride !== 'openai') throw new Error('Disposable selection changed; refusing to clear it');
          await rpc.request('sessions.patch', { key, agentId: saved.agentId, model: null, expectedSessionId: entry.sessionId, expectedLifecycleRevision: entry.lifecycleRevision });
        }
      }
    } else {
      const aResponse = await rpc.request('sessions.describe', { key: saved.sessionA });
      const a = aResponse?.entry ?? aResponse?.session ?? aResponse;
      if (a?.sessionId !== saved.sessionAId) throw new Error('A session generation changed; selection not cleared');
      if (a.modelOverrideSource === 'user') {
        if ((a.modelOverride ?? a.model) !== 'gpt-6-sol' || (a.providerOverride ?? a.modelProvider) !== 'openai') throw new Error('A selection changed; refusing to clear a different user choice');
        await rpc.request('sessions.patch', { key: saved.sessionA, model: null });
      }
    }
    const verified = await rpc.request('config.get', {});
    const actualRouter = verified.config?.plugins?.entries?.['deterministic-router']?.config;
    if (JSON.stringify(actualRouter) !== JSON.stringify(saved.router) || verified.config?.agents?.entries?.[saved.agentId]?.model !== saved.agentModel) throw new Error('Recovery verification failed; inspect TEST manually');
    const routerStatus = await rpc.request('deterministic-router.status', {});
    if (routerStatus?.status !== 'available' || (routerStatus.effectiveMode ?? routerStatus.mode) !== saved.router.mode || routerStatus.autoSessionAllowlistCount !== saved.router.autoSessionKeyHashes.length || (saved.firstTurn === true && routerStatus.autoSpawnParentGrantCount !== (saved.router.autoSpawnParentGrants?.length ?? 0)) || routerStatus.protectManualSelection !== true || routerStatus.requireSessionKeyForAuto !== true) throw new Error('Recovery router status does not match saved safeguards');
    if (saved.kind !== 'lifecycle' && saved.kind !== 'child') {
      const selected = await rpc.request('sessions.describe', { key: saved.sessionA });
      const selectedEntry = selected?.entry ?? selected?.session ?? selected;
      if (selectedEntry.modelOverrideSource !== null && selectedEntry.modelOverrideSource !== 'default') throw new Error('A selection restoration not verified');
    }
    unlinkSync(recoveryFile);
    process.stdout.write('TEST configuration and applicable selection restored and verified. No inference turns used.\n');
  } else if (['dry-run', 'dry-run-controls', 'dry-run-lifecycle', 'dry-run-child-parent', 'dry-run-child-followup', 'dry-run-child-first-turn'].includes(action)) {
    const prior = action === 'dry-run-child-followup' ? JSON.parse(readFileSync(settings.reportFile + '.child-parent.json', 'utf8')) : undefined;
    const result = childAction ? await runChildPhase(rpc, { ...settings, dryRun: true, recoveryPending: existsSync(recoveryFile) }, firstTurnAction ? 'first-turn' : action === 'dry-run-child-parent' ? 'parent' : 'followup', prior) : action === 'dry-run-lifecycle' ? await runLifecycle(rpc, { ...settings, dryRun: true, recoveryPending: existsSync(recoveryFile) }) : action === 'dry-run-controls' ? await runControls(rpc, { ...settings, dryRun: true }) : await runAcceptance(rpc, { ...settings, dryRun: true });
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    const previousReport = action === 'resume-b' ? JSON.parse(readFileSync(settings.reportFile, 'utf8')) : undefined;
    const outputPath = action === 'resume-b' ? settings.reportFile + '.resume.json' : action === 'run-controls' ? settings.reportFile + '.controls.json' : action === 'run-lifecycle' ? settings.reportFile + '.lifecycle.json' : action === 'run-child-parent' ? settings.reportFile + '.child-parent.json' : action === 'run-child-followup' ? settings.reportFile + '.child-followup.json' : action === 'run-child-first-turn' ? settings.reportFile + '.child-first-turn.json' : settings.reportFile;
    const onBaseline = baseline => {
      if (existsSync(recoveryFile)) throw new Error('Existing recovery file: restore or archive it before another run');
      writeFileSync(recoveryFile, JSON.stringify(baseline), { mode: 0o600, flag: 'wx' });
      chmodSync(recoveryFile, 0o600);
    };
    const onProgress = baseline => {
      if (!existsSync(recoveryFile)) throw new Error('Recovery file missing during lifecycle');
      const temporary = recoveryFile + '.tmp';
      writeFileSync(temporary, JSON.stringify(baseline), { mode: 0o600, flag: 'w' });
      chmodSync(temporary, 0o600);
      renameSync(temporary, recoveryFile);
    };
    try {
      const prior = action === 'run-child-followup' ? JSON.parse(readFileSync(settings.reportFile + '.child-parent.json', 'utf8')) : undefined;
      const result = childAction ? await runChildPhase(rpc, { ...settings, recoveryPending: existsSync(recoveryFile), shouldStop: () => interrupted, onBaseline }, firstTurnAction ? 'first-turn' : action === 'run-child-parent' ? 'parent' : 'followup', prior) : action === 'run-lifecycle' ? await runLifecycle(rpc, { ...settings, recoveryPending: existsSync(recoveryFile), shouldStop: () => interrupted, onBaseline, onProgress }, record => process.stdout.write(JSON.stringify(record) + '\n')) : action === 'run-controls' ? await runControls(rpc, { ...settings, shouldStop: () => interrupted, onBaseline }, record => process.stdout.write(JSON.stringify(record) + '\n')) : await runAcceptance(rpc, { ...settings, resumeB: action === 'resume-b', previousReport, shouldStop: () => interrupted, onBaseline }, record => process.stdout.write(JSON.stringify(record) + '\n'));
      if (outputPath) { writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600 }); chmodSync(outputPath, 0o600); }
      process.stdout.write(JSON.stringify(result) + '\n');
      if (result.restoration === 'PASS' && existsSync(recoveryFile)) unlinkSync(recoveryFile);
      if (result.result !== 'PASS') process.exitCode = 1;
    } catch (error) {
      const report = error.report ?? { result: 'INCONCLUSIVE', restoration: 'UNVERIFIED', error: error.message };
      if (outputPath) { writeFileSync(outputPath, JSON.stringify(report, null, 2), { mode: 0o600 }); chmodSync(outputPath, 0o600); }
      process.stdout.write(JSON.stringify(report) + '\n');
      if (report.restoration === 'PASS' && existsSync(recoveryFile)) unlinkSync(recoveryFile);
      process.exitCode = 1;
    }
  }
} finally {
  clearTimeout(timeout);
  await client.stopAndWait({ timeoutMs: 3000 });
}
