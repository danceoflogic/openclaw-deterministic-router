import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runChildPhase, ISSUE8_PARENT_PROMPT, ISSUE8_CHILD_PROMPT } from './child.mjs';
import { digest } from './runner.mjs';
import { classifyByRules, DEFAULT_ROUTING_CONFIG } from '@blockrun/router-core';

const parentKey = 'agent:main:dashboard:issue8-parent';
const childKey = 'agent:main:subagent:issue8-child';
const baseline = { mode: 'shadow', protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionKeyHashes: [], models: { SIMPLE: { provider: 'openai', model: 'gpt-6-luna' }, COMPLEX: { provider: 'openai', model: 'gpt-6-sol' } } };
const settings = { childTest: true, gatewayUrl: 'ws://127.0.0.1:19879', profile: 'router-test', agentId: 'main', ownerProfileId: 'gateway-owner', maxTurns: 4, parentSession: parentKey, parentPrompt: ISSUE8_PARENT_PROMPT, childPrompt: ISSUE8_CHILD_PROMPT };

test('Issue #8 exact prompts classify as strong parent and SIMPLE child', () => {
  const classify = prompt => classifyByRules(prompt, undefined, Math.ceil(prompt.length / 4), DEFAULT_ROUTING_CONFIG.scoring).tier;
  assert.equal(classify(ISSUE8_PARENT_PROMPT), 'REASONING');
  assert.equal(classify(ISSUE8_CHILD_PROMPT), 'SIMPLE');
});

function fixture({ manualChild = false } = {}) {
  const config = { agents: { entries: { main: { model: 'openai/gpt-6-luna' } } }, plugins: { entries: { 'deterministic-router': { config: structuredClone(baseline) } } } };
  let sent = 0, patches = 0;
  const parent = { sessionId: 'parent-generation', agentId: 'main', createdVia: 'operator', createdActor: { type: 'human', identity: { type: 'profile', id: 'gateway-owner' } }, hasActiveRun: false, modelOverrideSource: 'default' };
  const child = { sessionId: 'child-generation', agentId: 'main', createdVia: 'spawn', createdActor: { type: 'agent', id: 'main' }, parentSessionKey: parentKey, hasActiveRun: false, modelOverrideSource: manualChild ? 'user' : 'auto', modelProvider: 'openai', model: 'gpt-6-sol' };
  const record = (key, runId, model, applied, reason) => {
    const decisionId = `${runId}-decision`;
    return [
      { verificationLevel: 'selected-only', decisionId, runId, sessionKeyHash: digest(key).slice(0, 16), agentId: 'main', mode: 'auto', effectiveTier: model === 'gpt-6-luna' ? 'SIMPLE' : 'REASONING', selectedProvider: 'openai', selectedModel: model, manualLock: false, applied, reason },
      { kind: 'model_identity_observed', verificationLevel: 'runtime-model', source: 'agent_end_context', decisionId, runId, resolvedProvider: 'openai', resolvedModel: applied ? model : 'gpt-6-sol' },
    ];
  };
  const rpc = {
    async request(method, params) {
      if (method === 'config.get') return { hash: `hash-${patches}`, config };
      if (method === 'deterministic-router.status') { const r = config.plugins.entries['deterministic-router'].config; return { status: 'available', effectiveMode: r.mode, autoSessionAllowlistCount: r.autoSessionKeyHashes.length, protectManualSelection: true, requireSessionKeyForAuto: true }; }
      if (method === 'sessions.describe') return { entry: params.key === parentKey ? parent : params.key === childKey && sent ? child : null };
      if (method === 'sessions.list') return { sessions: sent ? [{ key: childKey, parentSessionKey: parentKey, createdVia: 'spawn', createdAt: Date.now() }] : [] };
      if (method === 'config.patch') { const patch = JSON.parse(params.raw); if (patch.agents) Object.assign(config.agents.entries.main, patch.agents.entries.main); if (patch.plugins) Object.assign(config.plugins.entries['deterministic-router'].config, patch.plugins.entries['deterministic-router'].config); patches++; return {}; }
      if (method === 'chat.send') { sent++; return { status: 'started', runId: sent === 1 ? 'parent-run' : 'child-followup-run' }; }
      throw new Error(`Unexpected RPC ${method}`);
    },
    async waitForRun() { return { state: 'final' }; },
    async readAllEvidence() { return sent === 1 ? [...record(parentKey, 'parent-run', 'gpt-6-sol', true), ...record(childKey, 'child-bootstrap-run', 'gpt-6-luna', false, 'session is not allowlisted for AUTO; fail-closed without override')] : record(childKey, 'child-followup-run', 'gpt-6-luna', true); },
    counts: () => ({ sent, patches }),
  };
  return rpc;
}

test('Issue #8 dry-run is read-only and requires exactly four approved turns', async () => {
  const rpc = fixture();
  const result = await runChildPhase(rpc, { ...settings, dryRun: true }, 'parent');
  assert.equal(result.result, 'READY');
  assert.deepEqual(rpc.counts(), { sent: 0, patches: 0 });
  await assert.rejects(runChildPhase(rpc, { ...settings, maxTurns: 3, dryRun: true }, 'parent'), /four-turn ceiling/);
});

test('Issue #8 parent and exact-key child follow-up restore SHADOW after each phase', async () => {
  const rpc = fixture();
  const parent = await runChildPhase(rpc, settings, 'parent');
  assert.equal(parent.result, 'PASS');
  assert.equal(parent.restoration, 'PASS');
  assert.equal(parent.turns, 2);
  assert.equal(parent.cases[1].resolvedModel, 'openai/gpt-6-sol');
  const followup = await runChildPhase(rpc, settings, 'followup', parent);
  assert.equal(followup.result, 'PASS');
  assert.equal(followup.restoration, 'PASS');
  assert.equal(followup.turns, 3);
  assert.equal(followup.cases.at(-1).resolvedModel, 'openai/gpt-6-luna');
  assert.deepEqual(rpc.counts(), { sent: 2, patches: 6 });
});

test('Issue #8 refuses follow-up after child selection changes', async () => {
  const rpc = fixture({ manualChild: true });
  const prior = { result: 'PASS', restoration: 'PASS', phase: 'parent', turns: 2, child: { key: childKey, sessionId: 'child-generation', parentKey, parentSessionId: 'parent-generation' } };
  await assert.rejects(runChildPhase(rpc, settings, 'followup', prior), /Child generation\/provenance\/selection changed/);
  assert.deepEqual(rpc.counts(), { sent: 0, patches: 0 });
});
