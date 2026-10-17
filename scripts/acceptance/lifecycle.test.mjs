import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runLifecycle, validateLifecycleOptions } from './lifecycle.mjs';
import { digest } from './runner.mjs';

const settings = { lifecycle: true, gatewayUrl: 'ws://127.0.0.1:19879', profile: 'router-test', agentId: 'main', ownerProfileId: 'gateway-owner', maxTurns: 3, prompt: 'Reply with one word: ready' };
const model = 'openai/gpt-6-sol';
function mock({ failAt, badDecision, badOwner, missingMethod, loseCreateAckAt } = {}) {
  const config = { agents: { entries: { main: { model: 'openai/gpt-6-luna' } } }, plugins: { entries: { 'deterministic-router': { config: { mode: 'shadow', protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionKeyHashes: [], models: { SIMPLE: { provider: 'openai', model: 'gpt-6-luna' } } } } } } };
  const original = structuredClone(config), entries = new Map(), calls = [];
  let hash = 'h', serial = 0, turns = 0;
  const methods = ['sessions.create', 'sessions.describe', 'sessions.reset', 'sessions.delete', 'sessions.patch', 'chat.send'].filter(x => x !== missingMethod);
  return { calls, config, original, entries, methods,
    async request(method, p) {
      calls.push([method, p]);
      if (method === failAt) throw Error(`${method} interrupted`);
      const router = config.plugins.entries['deterministic-router'].config;
      if (method === 'config.get') return { hash, config: structuredClone(config) };
      if (method === 'deterministic-router.status') return { status: 'available', effectiveMode: router.mode, protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionAllowlistCount: router.autoSessionKeyHashes.length };
      if (method === 'models.list') return { models: [{ provider: 'openai', id: 'gpt-6-sol', available: true }, { provider: 'openai', id: 'gpt-6-luna', available: true }] };
      if (method === 'sessions.create') {
        assert(!entries.has(p.key)); serial++;
        entries.set(p.key, { sessionId: `s-${serial}`, lifecycleRevision: `r-${serial}`, agentId: 'main', createdVia: 'operator', createdActor: { type: 'human', identity: { type: 'profile', id: badOwner ? 'other' : 'gateway-owner' } }, hasActiveRun: false, modelOverrideSource: 'default' });
        if (serial === loseCreateAckAt) throw Error('Creation acknowledgement lost');
        return { ok: true, key: p.key };
      }
      if (method === 'sessions.describe') return { entry: entries.has(p.key) ? structuredClone(entries.get(p.key)) : null };
      if (method === 'sessions.patch') {
        const e = entries.get(p.key); assert(e && e.sessionId === p.expectedSessionId && e.lifecycleRevision === p.expectedLifecycleRevision);
        if (p.model) Object.assign(e, { modelOverrideSource: 'user', providerOverride: 'openai', modelOverride: 'gpt-6-sol' });
        else Object.assign(e, { modelOverrideSource: 'default', providerOverride: undefined, modelOverride: undefined });
        return {};
      }
      if (method === 'sessions.reset') {
        const e = entries.get(p.key); assert(e && e.sessionId === p.expectedSessionId && e.modelOverrideSource !== 'user');
        e.lifecycleRevision = `r-${++serial}`; return { ok: true, entry: structuredClone(e) };
      }
      if (method === 'sessions.delete') {
        const e = entries.get(p.key); assert(e && e.sessionId === p.expectedSessionId && e.lifecycleRevision === p.expectedLifecycleRevision && e.modelOverrideSource !== 'user');
        entries.delete(p.key); return { deleted: true };
      }
      if (method === 'config.patch') {
        assert.equal(p.baseHash, hash); hash += 'x'; const patch = JSON.parse(p.raw);
        if (patch.agents?.entries?.main?.model) config.agents.entries.main.model = patch.agents.entries.main.model;
        Object.assign(router, patch.plugins?.entries?.['deterministic-router']?.config ?? {}); return {};
      }
      if (method === 'chat.send') { turns++; assert(turns <= 3); return { status: 'started', runId: `run-${turns}` }; }
      throw Error(method);
    },
    async waitForRun(runId) { return { state: 'final', resolvedModel: runId === 'run-3' ? model : 'openai/gpt-6-luna' }; },
    async readEvidence(runId) {
      const n = Number(runId.slice(-1)), key = [...entries.keys()].find(x => x.includes(n === 3 ? ':router-i7-b-' : ':router-i7-a-'));
      return [{ verificationLevel: 'selected-only', decisionId: `d-${n}`, runId, sessionKeyHash: digest(key).slice(0, 16), agentId: 'main', mode: 'auto', classifierTier: 'SIMPLE', selectedProvider: 'openai', selectedModel: 'gpt-6-luna', manualLock: n === 3, applied: badDecision && n === 2 ? false : n !== 3 }];
    },
  };
}

test('exact TEST profile and three-turn ceiling', () => {
  assert.equal(validateLifecycleOptions(settings), settings);
  assert.throws(() => validateLifecycleOptions({ ...settings, maxTurns: 4 }));
  assert.throws(() => validateLifecycleOptions({ ...settings, gatewayUrl: 'ws://127.0.0.1:18789' }));
  assert.throws(() => validateLifecycleOptions({ ...settings, sessionA: 'valuable' }));
});
test('read-only dry-run makes zero writes and states creation attribution remains unverified', async () => {
  const rpc = mock(); const result = await runLifecycle(rpc, { ...settings, dryRun: true });
  assert.equal(result.result, 'INCONCLUSIVE'); assert.equal(result.gatewayMutations, 0);
  assert(!rpc.calls.some(([m]) => ['sessions.create', 'sessions.reset', 'sessions.delete', 'sessions.patch', 'config.patch', 'chat.send'].includes(m)));
});
test('missing lifecycle method blocks before any mutation', async () => {
  const rpc = mock({ missingMethod: 'sessions.delete' });
  const result = await runLifecycle(rpc, { ...settings, dryRun: true });
  assert.equal(result.result, 'BLOCKED'); assert.match(result.reason, /sessions.delete/);
  assert(!rpc.calls.some(([m]) => m === 'chat.send'));
});
test('reset, delete/recreate, and B manual isolation use exactly three turns and restore', async () => {
  const rpc = mock(); const progress = [];
  const result = await runLifecycle(rpc, { ...settings, onBaseline: x => progress.push(x), onProgress: x => progress.push(x) });
  assert.equal(result.result, 'PASS'); assert.equal(result.restoration, 'PASS'); assert.equal(result.turns, 3);
  assert.deepEqual(result.cases.map(x => x.status), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(rpc.config, rpc.original);
  assert.equal(rpc.calls.filter(([m]) => m === 'chat.send').length, 3);
  assert.equal(rpc.calls.filter(([m]) => m === 'sessions.reset').length, 1);
  assert.equal(rpc.calls.filter(([m]) => m === 'sessions.delete').length, 1);
  assert.equal(rpc.calls.filter(([m]) => m === 'sessions.create').length, 3);
  assert(progress.length >= 3);
  assert([...rpc.entries.values()].every(x => x.modelOverrideSource === 'default'));
});
test('unattributed creation halts before reset, delete or inference', async () => {
  const rpc = mock({ badOwner: true });
  await assert.rejects(runLifecycle(rpc, settings), /Lifecycle run or restoration failed/);
  assert(!rpc.calls.some(([m]) => ['sessions.reset', 'sessions.delete', 'chat.send'].includes(m)));
  assert.deepEqual(rpc.config, rpc.original);
});
test('failed turn withholds later turns and restores config and B selection', async () => {
  const rpc = mock({ badDecision: true });
  const result = await runLifecycle(rpc, settings);
  assert.equal(result.result, 'FAIL'); assert.equal(result.turns, 2); assert.equal(result.restoration, 'PASS');
  assert.deepEqual(rpc.config, rpc.original);
  assert([...rpc.entries.values()].every(x => x.modelOverrideSource === 'default'));
});
test('uncertain send admission is counted once and not retried', async () => {
  const rpc = mock({ failAt: 'chat.send' });
  await assert.rejects(runLifecycle(rpc, settings), /chat.send interrupted/);
  assert.equal(rpc.calls.filter(([m]) => m === 'chat.send').length, 1);
  assert.deepEqual(rpc.config, rpc.original);
});
test('interrupted reset restores both disposable selections and the agent default', async () => {
  const rpc = mock({ failAt: 'sessions.reset' });
  await assert.rejects(runLifecycle(rpc, settings), /sessions.reset interrupted/);
  assert.equal(rpc.calls.filter(([m]) => m === 'chat.send').length, 0);
  assert.deepEqual(rpc.config, rpc.original);
  assert([...rpc.entries.values()].every(x => x.modelOverrideSource === 'default'));
});
test('persisted creation with lost acknowledgement retains recovery for inspection', async () => {
  for (const serial of [1, 2, 4]) {
    const rpc = mock({ loseCreateAckAt: serial });
    let caught;
    try { await runLifecycle(rpc, settings); } catch (error) { caught = error; }
    assert(caught instanceof AggregateError);
    assert.equal(caught.report.restoration, 'FAIL');
    assert(caught.report.restorationErrors.some(x => /absence verification failed/.test(x)));
    assert.deepEqual(rpc.config, rpc.original);
    assert.equal(rpc.calls.filter(([method]) => method === 'chat.send').length, serial === 4 ? 1 : 0);
  }
});
