import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runControls, validateControlOptions } from './controls.mjs';
import { assessControlEvidence } from './evidence.mjs';
import { digest } from './runner.mjs';

const settings = { gatewayUrl: 'ws://127.0.0.1:19879', profile: 'router-test', maxTurns: 3, agentId: 'main', ownerProfileId: 'gateway-owner', sessionA: 'agent:main:dashboard:a', sessionB: 'agent:main:dashboard:b', prompt: 'Reply with one word: ready' };
function mock({ badShadow = false, failSecondSend = false } = {}) {
  const config = { agents: { entries: { main: { model: 'openai/gpt-6-luna' } } }, plugins: { entries: { 'deterministic-router': { config: { mode: 'shadow', protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionKeyHashes: ['original'], models: { SIMPLE: { provider: 'openai', model: 'gpt-6-luna' } } } } } } };
  const original = structuredClone(config), calls = [], overrides = new Map();
  let hash = 'h', sent = 0;
  return {
    config, original, calls, overrides,
    async request(method, p) {
      calls.push([method, p]);
      const router = config.plugins.entries['deterministic-router'].config;
      if (method === 'config.get') return { hash, config: structuredClone(config) };
      if (method === 'deterministic-router.status') return { status: 'available', effectiveMode: router.mode, autoSessionAllowlistCount: router.autoSessionKeyHashes.length, protectManualSelection: true, requireSessionKeyForAuto: true };
      if (method === 'sessions.describe') return { sessionId: p.key + ':id', agentId: 'main', createdActor: { type: 'human', identity: { type: 'profile', id: 'gateway-owner' } }, hasActiveRun: false, modelOverrideSource: overrides.has(p.key) ? 'user' : 'default', providerOverride: overrides.has(p.key) ? 'openai' : undefined, modelOverride: overrides.get(p.key) };
      if (method === 'sessions.patch') { if (p.model) overrides.set(p.key, p.model.split('/')[1]); else overrides.delete(p.key); return {}; }
      if (method === 'config.patch') {
        assert.equal(p.baseHash, hash); hash += 'x';
        const patch = JSON.parse(p.raw);
        if (patch.agents?.entries?.main?.model) config.agents.entries.main.model = patch.agents.entries.main.model;
        Object.assign(router, patch.plugins?.entries?.['deterministic-router']?.config ?? {});
        return {};
      }
      if (method === 'chat.send') { sent++; if (failSecondSend && sent === 2) throw Error('uncertain admission'); return { status: 'started', runId: 'run-' + sent }; }
      throw Error(method);
    },
    async waitForRun(runId) { return { state: 'final', resolvedModel: runId === 'run-1' ? 'openai/gpt-6-luna' : 'openai/gpt-6-sol' }; },
    async readEvidence(runId) {
      const index = Number(runId.split('-')[1]);
      if (index === 3) return [];
      const mode = index === 1 ? 'auto' : 'shadow';
      return [{ verificationLevel: 'selected-only', decisionId: runId + ':decision', runId, sessionKeyHash: digest(settings.sessionA).slice(0, 16), agentId: 'main', mode, classifierTier: 'SIMPLE', selectedProvider: 'openai', selectedModel: 'gpt-6-luna', manualLock: false, applied: index === 1 || badShadow }];
    },
  };
}

test('three-turn TEST target and budget are exact', () => {
  assert.equal(validateControlOptions(settings), settings);
  assert.throws(() => validateControlOptions({ ...settings, maxTurns: 4 }));
  assert.throws(() => validateControlOptions({ ...settings, gatewayUrl: 'ws://127.0.0.1:18789' }));
});
test('clear resumes AUTO, shadow yields, OFF is silent, B stays isolated and TEST restores', async () => {
  const rpc = mock();
  const report = await runControls(rpc, settings);
  assert.equal(report.result, 'PASS');
  assert.equal(report.restoration, 'PASS');
  assert.equal(report.turns, 3);
  assert.deepEqual(report.cases.map(x => x.status), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(rpc.config, rpc.original);
  assert.equal(rpc.overrides.size, 0);
  assert.equal(rpc.calls.filter(([m]) => m === 'chat.send').length, 3);
  assert.deepEqual(rpc.calls.filter(([m]) => m === 'sessions.patch').map(([, p]) => p.model), ['openai/gpt-6-sol', null]);
});
test('read-only controls dry-run sends no turns or mutations', async () => {
  const rpc = mock();
  assert.equal((await runControls(rpc, { ...settings, dryRun: true })).result, 'READY');
  assert.equal(rpc.calls.filter(([m]) => ['config.patch', 'sessions.patch', 'chat.send'].includes(m)).length, 0);
});
test('shadow contradiction withholds OFF and restores', async () => {
  const rpc = mock({ badShadow: true });
  const report = await runControls(rpc, settings);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.turns, 2);
  assert.equal(report.restoration, 'PASS');
  assert.deepEqual(rpc.config, rpc.original);
});
test('uncertain admission is counted once, no retry, restores', async () => {
  const rpc = mock({ failSecondSend: true });
  await assert.rejects(runControls(rpc, settings), /uncertain admission/);
  assert.equal(rpc.calls.filter(([m]) => m === 'chat.send').length, 2);
  assert.deepEqual(rpc.config, rpc.original);
  assert.equal(rpc.overrides.size, 0);
});
test('OFF decision is a failure, not a silent PASS', () => {
  const expected = { label: 'off', runId: 'r', sessionKeyHash: 'abc', agentId: 'main', completed: true };
  assert.equal(assessControlEvidence([{ verificationLevel: 'selected-only', decisionId: 'd', runId: 'r' }], expected).status, 'FAIL');
});
