import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { digest, discoverSessions, runAcceptance, validateOptions } from './runner.mjs';
import { assessEvidence, parseJournal } from './evidence.mjs';

const options = { gatewayUrl: 'ws://127.0.0.1:19879', profile: 'router-test', maxTurns: 2, agentId: 'main', ownerProfileId: 'gateway-owner', sessionA: 'agent:main:dashboard:a', sessionB: 'agent:main:dashboard:b', prompt: 'Reply with one word: ready' };
function mock({ initialModel = 'openai/gpt-6-luna', missingAudit = false, badManual = false, ignoreSolPatch = false, failSend = false, failRestore = false, failClear = false } = {}) {
  const config = { agents: { defaults: { model: 'openai/gpt-6-sol' }, entries: { main: { model: initialModel } } }, plugins: { entries: { 'deterministic-router': { config: { mode: 'shadow', protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionKeyHashes: [], models: { SIMPLE: { provider: 'openai', model: 'gpt-6-luna' } } } } } } };
  const original = structuredClone(config);
  const overrides = new Map(), calls = [];
  let hash = 'h0';
  const rpc = {
    calls, config, original, overrides,
    async request(method, p) {
      calls.push([method, p]);
      const router = config.plugins.entries['deterministic-router'].config;
      if (method === 'config.get') return { hash, config: structuredClone(config) };
      if (method === 'deterministic-router.status') return { status: 'available', effectiveMode: router.mode, protectManualSelection: router.protectManualSelection, requireSessionKeyForAuto: router.requireSessionKeyForAuto, autoSessionAllowlistCount: router.autoSessionKeyHashes.length };
      if (method === 'sessions.list') return { sessions: [options.sessionA, options.sessionB, 'agent:main:main', 'agent:main:dashboard:anonymous'].map((key, index) => ({ key, agentId: 'main', createdVia: 'operator', createdActor: index === 3 ? null : { type: 'human', identity: { type: 'profile', id: 'gateway-owner' } } })) };
      if (method === 'sessions.describe') return { sessionId: p.key + ':id', agentId: 'main', createdActor: { type: 'human', identity: { type: 'profile', id: 'gateway-owner' } }, hasActiveRun: false, modelOverrideSource: overrides.has(p.key) ? 'user' : 'default', providerOverride: overrides.has(p.key) ? 'openai' : undefined, modelOverride: overrides.get(p.key) };
      if (method === 'sessions.patch') {
        if (p.model === null && failClear) throw Error('clear denied');
        if (p.model) overrides.set(p.key, p.model.split('/')[1]); else overrides.delete(p.key);
        return {};
      }
      if (method === 'config.patch') {
        assert.equal(p.baseHash, hash);
        const patch = JSON.parse(p.raw);
        const nextModel = patch.agents?.entries?.main?.model;
        if (nextModel && !(ignoreSolPatch && nextModel === 'openai/gpt-6-sol')) config.agents.entries.main.model = nextModel;
        const r = patch.plugins?.entries?.['deterministic-router']?.config;
        if (r) {
          if (r.mode === 'shadow' && failRestore) throw Error('restore denied');
          Object.assign(router, r);
        }
        hash += 'x';
        return {};
      }
      if (method === 'chat.send') {
        if (failSend) throw Error('uncertain admission');
        return { status: 'started', runId: p.sessionKey === options.sessionA ? 'run-a' : 'run-b' };
      }
      throw Error(method);
    },
    async waitForRun(runId) { return { state: 'final', resolvedModel: runId === 'run-a' ? 'openai/gpt-6-sol' : 'openai/gpt-6-luna' }; },
    async readEvidence(runId) {
      if (missingAudit) return [];
      const manual = runId === 'run-a';
      return [{ timestamp: '2026-10-17T18:00:00Z', decisionId: runId + '-decision', runId, sessionKeyHash: digest(manual ? options.sessionA : options.sessionB).slice(0, 16), agentId: 'main', verificationLevel: 'selected-only', mode: 'auto', classifierTier: 'SIMPLE', effectiveTier: 'SIMPLE', selectedProvider: 'openai', selectedModel: 'gpt-6-luna', manualLock: manual && !badManual, applied: !manual || badManual }];
    },
  };
  return rpc;
}

test('TEST isolation and two-turn budget fail closed', () => {
  assert.throws(() => validateOptions({ ...options, gatewayUrl: 'ws://127.0.0.1:18789' }));
  assert.throws(() => validateOptions({ ...options, maxTurns: 3 }));
  assert.throws(() => validateOptions({ ...options, sessionB: options.sessionA }));
});
test('session-key hash is exact SHA-256; journal parser correlates run only', () => {
  assert.equal(digest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual(parseJournal('[deterministic-router] {"runId":"other"}\n[deterministic-router] {"runId":"target","decisionId":"d"}', 'target'), [{ runId: 'target', decisionId: 'd' }]);
});
test('discovery ignores main root and operator rows lacking the specified actor', async () => {
  assert.deepEqual(await discoverSessions(mock(), 'main', 'gateway-owner'), [options.sessionA, options.sessionB]);
});
test('A manual precedence and genuine B Sol-default to Luna pass; exact settings restored', async () => {
  const rpc = mock({ initialModel: 'openai/gpt-6-sol' });
  const result = await runAcceptance(rpc, options);
  assert.equal(result.result, 'PASS');
  assert.equal(result.restoration, 'PASS');
  assert.equal(result.turns, 2);
  assert.deepEqual(result.cases.map(x => x.status), ['PASS', 'PASS']);
  assert.deepEqual(rpc.config, rpc.original);
  assert.equal(rpc.overrides.size, 0);
  const sends = rpc.calls.filter(([method]) => method === 'chat.send');
  assert.equal(sends.length, 2);
  const beforeB = rpc.calls.findIndex(([method, p]) => method === 'chat.send' && p.sessionKey === options.sessionB);
  assert(rpc.calls.slice(0, beforeB).some(([method, p]) => method === 'config.patch' && p.raw.includes('"model":"openai/gpt-6-sol"')));
});
test('default Sol patch ignored: B is withheld; Luna-to-Luna cannot pass', async () => {
  const rpc = mock({ ignoreSolPatch: true });
  await assert.rejects(runAcceptance(rpc, options), /Agent-specific default is not openai\/gpt-6-sol/);
  assert.equal(rpc.calls.filter(([method]) => method === 'chat.send').length, 1);
  assert.deepEqual(rpc.config, rpc.original);
});
test('missing correlated audit is inconclusive and B withheld', async () => {
  const rpc = mock({ missingAudit: true });
  const result = await runAcceptance(rpc, options);
  assert.equal(result.result, 'INCONCLUSIVE');
  assert.equal(result.turns, 1);
  assert.equal(result.restoration, 'PASS');
});
test('dry-run checks live TEST preconditions with no mutations or inference', async () => {
  const rpc = mock();
  const result = await runAcceptance(rpc, { ...options, sessionA: undefined, sessionB: undefined, dryRun: true });
  assert.equal(result.result, 'READY');
  assert.equal(result.gatewayMutations, 0);
  assert.equal(result.turns, 0);
  assert.equal(rpc.calls.filter(([method]) => ['config.patch', 'sessions.patch', 'chat.send'].includes(method)).length, 0);
});
test('original nonempty allowlist and shadow mode are restored exactly', async () => {
  const rpc = mock();
  rpc.config.plugins.entries['deterministic-router'].config.autoSessionKeyHashes = ['unrelated-hash'];
  rpc.original.plugins.entries['deterministic-router'].config.autoSessionKeyHashes = ['unrelated-hash'];
  const result = await runAcceptance(rpc, options);
  assert.equal(result.result, 'PASS');
  assert.deepEqual(rpc.config, rpc.original);
});
test('manual-lock contradiction fails and B withheld', async () => {
  const rpc = mock({ badManual: true });
  const result = await runAcceptance(rpc, options);
  assert.equal(result.result, 'FAIL');
  assert.equal(result.turns, 1);
});
test('uncertain admission spends one turn, never retries, and restores', async () => {
  const rpc = mock({ failSend: true });
  await assert.rejects(runAcceptance(rpc, options), /uncertain admission/);
  assert.equal(rpc.calls.filter(([method]) => method === 'chat.send').length, 1);
  assert.deepEqual(rpc.config, rpc.original);
});
test('router restore failure does not prevent A selection cleanup', async () => {
  const rpc = mock({ failRestore: true });
  await assert.rejects(runAcceptance(rpc, options), error => error instanceof AggregateError && /Router shadow restoration/.test(error.errors[0].message));
  assert.equal(rpc.overrides.size, 0);
});
test('primary failure and independent restoration failures are all surfaced', async () => {
  const rpc = mock({ failSend: true, failRestore: true, failClear: true });
  await assert.rejects(runAcceptance(rpc, options), error => error instanceof AggregateError && error.errors.some(x => /uncertain admission/.test(x.message)) && error.errors.some(x => /Router shadow restoration/.test(x.message)) && error.errors.some(x => /A selection cleanup/.test(x.message)));
});
test('missing or contradictory decision never becomes PASS', () => {
  const expected = { label: 'automatic-routing', runId: 'r', sessionKeyHash: 'abc', agentId: 'main', completed: true };
  assert.equal(assessEvidence([], expected).status, 'INCONCLUSIVE');
  assert.equal(assessEvidence([{ decisionId: 'd', runId: 'r', sessionKeyHash: 'abc', agentId: 'main', verificationLevel: 'selected-only', mode: 'auto', classifierTier: 'SIMPLE', selectedProvider: 'openai', selectedModel: 'gpt-6-luna', manualLock: true, applied: false }], expected).status, 'FAIL');
});
