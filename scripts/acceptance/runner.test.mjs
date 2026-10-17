import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAcceptance, validateOptions } from './runner.mjs';
const opts = { gatewayUrl: 'ws://127.0.0.1:19879', profile: 'router-test', maxTurns: 2, agentId: 'router-test', sessionA: 'a', sessionB: 'b', prompt: 'Reply with one word: ready' };
const base = { plugins: { entries: { 'deterministic-router': { config: { mode: 'shadow', protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionKeyHashes: [], models: { SIMPLE: { provider: 'openai', model: 'gpt-6-luna' } } } } } } };
test('target and budget fail closed', () => {
  assert.throws(() => validateOptions({ ...opts, gatewayUrl: 'ws://127.0.0.1:18789' }));
  assert.throws(() => validateOptions({ ...opts, maxTurns: 0 }));
});
test('manual then automatic turn; shadow restored', async () => {
  const calls = [], cfg = structuredClone(base), models = { a: null, b: null };
  let hash = 'h0';
  const rpc = {
    async request(method, p) {
      calls.push([method, p]);
      if (method === 'config.get') return { hash, config: cfg };
      if (method === 'deterministic-router.status') return { status: 'available', effectiveMode: cfg.plugins.entries['deterministic-router'].config.mode, protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionAllowlistCount: cfg.plugins.entries['deterministic-router'].config.autoSessionKeyHashes.length };
      if (method === 'sessions.describe') return { key: p.key, sessionId: p.key + 'id', agentId: 'router-test', createdActor: { type: 'human', source: 'profile' }, hasActiveRun: false, modelOverrideSource: models[p.key] ? 'user' : null, modelProvider: models[p.key]?.split('/')[0] ?? 'openai', model: models[p.key]?.split('/')[1] ?? 'gpt-6-sol' };
      if (method === 'sessions.patch') { models[p.key] = p.model; return {}; }
      if (method === 'config.patch') { assert.equal(p.baseHash, hash); Object.assign(cfg.plugins.entries['deterministic-router'].config, JSON.parse(p.raw).plugins.entries['deterministic-router'].config); hash += 'x'; return {}; }
      if (method === 'chat.send') return { status: 'started', runId: p.sessionKey + 'run' };
      throw Error(method);
    },
    async waitForRun() {},
  };
  const result = await runAcceptance(rpc, opts);
  assert.equal(result.turns, 2);
  assert.equal(result.providerVerification, 'DEFERRED');
  assert.equal(cfg.plugins.entries['deterministic-router'].config.mode, 'shadow');
  assert.deepEqual(cfg.plugins.entries['deterministic-router'].config.autoSessionKeyHashes, []);
  assert.equal(models.a, null);
  assert.equal(calls.filter(([m]) => m === 'chat.send').length, 2);
});
test('baseline mismatch spends zero turns', async () => {
  const rpc = { request: async method => method === 'config.get' ? { hash: 'x', config: { plugins: { entries: { 'deterministic-router': { config: { mode: 'auto' } } } } } } : null };
  await assert.rejects(runAcceptance(rpc, opts));
});
test('failed first turn does not retry and restores shadow', async () => {
  const cfg = structuredClone(base); let hash = 'h'; const models = { a: null, b: null }; let sends = 0;
  const rpc = {
    async request(method, p) {
      if (method === 'config.get') return { hash, config: cfg };
      if (method === 'deterministic-router.status') return { status: 'available', effectiveMode: cfg.plugins.entries['deterministic-router'].config.mode, protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionAllowlistCount: cfg.plugins.entries['deterministic-router'].config.autoSessionKeyHashes.length };
      if (method === 'sessions.describe') return { sessionId: p.key + 'id', agentId: 'router-test', createdActor: { type: 'human', source: 'profile' }, hasActiveRun: false, modelOverrideSource: models[p.key] ? 'user' : null, modelProvider: 'openai', model: models[p.key] ? 'gpt-6-sol' : 'gpt-6-sol' };
      if (method === 'sessions.patch') { models[p.key] = p.model; return {}; }
      if (method === 'config.patch') { Object.assign(cfg.plugins.entries['deterministic-router'].config, JSON.parse(p.raw).plugins.entries['deterministic-router'].config); hash += 'x'; return {}; }
      if (method === 'chat.send') { sends++; throw Error('uncertain admission'); }
      throw Error(method);
    },
  };
  await assert.rejects(runAcceptance(rpc, opts), /uncertain admission/);
  assert.equal(sends, 1);
  assert.equal(cfg.plugins.entries['deterministic-router'].config.mode, 'shadow');
  assert.deepEqual(cfg.plugins.entries['deterministic-router'].config.autoSessionKeyHashes, []);
  assert.equal(models.a, null);
});
