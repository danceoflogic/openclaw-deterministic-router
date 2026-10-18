import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runChildPhase, ISSUE8_PARENT_PROMPT, ISSUE8_CHILD_PROMPT, isOpenClawSpawnedChild } from './child.mjs';
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
  assert.match(ISSUE8_PARENT_PROMPT, /OpenClaw sessions_spawn/);
  assert.match(ISSUE8_PARENT_PROMPT, /Do not use the native Codex spawn_agent/);
  assert.match(ISSUE8_PARENT_PROMPT, /Do not pass a model/);
});

test('Issue #8 child inventory rejects a native Codex child and false spawn provenance', () => {
  const row = { key: childKey, parentSessionKey: parentKey, createdVia: 'spawn', createdAt: 100 };
  assert.equal(isOpenClawSpawnedChild(row, 'main', parentKey, 99), true);
  assert.equal(isOpenClawSpawnedChild({ ...row, key: 'codex-thread:native-child' }, 'main', parentKey, 99), false);
  assert.equal(isOpenClawSpawnedChild({ ...row, createdVia: 'codex-native' }, 'main', parentKey, 99), false);
});

function fixture({ manualChild = false, spawnTool = true, childRunId = 'child-bootstrap-run', firstTurn = false, grantFeature = true, badLineage = false, priorPromptCount = 0 } = {}) {
  const config = { agents: { entries: { main: { model: 'openai/gpt-6-luna' } } }, plugins: { entries: { 'deterministic-router': { config: structuredClone(baseline) } } } };
  let sent = 0, patches = 0;
  const parent = { sessionId: 'parent-generation', spawnDepth: 0, agentId: 'main', createdVia: 'operator', createdActor: { type: 'human', identity: { type: 'profile', id: 'gateway-owner' } }, hasActiveRun: false, modelOverrideSource: 'default' };
  const child = { sessionId: 'child-generation', spawnDepth: 1, lastRunId: childRunId, agentId: 'main', createdVia: 'spawn', createdActor: { type: 'agent', id: 'main' }, parentSessionKey: parentKey, hasActiveRun: false, modelOverrideSource: manualChild ? 'user' : 'auto', modelProvider: 'openai', model: 'gpt-6-sol' };
  const record = (key, runId, model, applied, reason, autoAuthorization) => {
    const decisionId = `${runId}-decision`;
    return [
      { verificationLevel: 'selected-only', decisionId, runId, sessionKeyHash: digest(key).slice(0, 16), agentId: 'main', mode: 'auto', effectiveTier: model === 'gpt-6-luna' ? 'SIMPLE' : 'REASONING', selectedProvider: 'openai', selectedModel: model, manualLock: false, applied, reason, autoAuthorization },
      { kind: 'model_identity_observed', verificationLevel: 'runtime-model', source: 'agent_end_context', decisionId, runId, resolvedProvider: 'openai', resolvedModel: applied ? model : 'gpt-6-sol' },
    ];
  };
  const rpc = {
    async request(method, params) {
      if (method === 'config.get') return { hash: `hash-${patches}`, config };
      if (method === 'deterministic-router.status') { const r = config.plugins.entries['deterministic-router'].config; return { status: 'available', effectiveMode: r.mode, autoSessionAllowlistCount: r.autoSessionKeyHashes.length, ...(grantFeature ? { autoSpawnParentGrantCount: r.autoSpawnParentGrants?.length ?? 0 } : {}), protectManualSelection: true, requireSessionKeyForAuto: true }; }
      if (method === 'tools.effective') return { agentId: 'main', toolAccess: { checked: 'live-session', tools: spawnTool ? [{ id: 'sessions_spawn', status: 'available' }] : [] }, groups: [{ tools: spawnTool ? [{ id: 'sessions_spawn', source: 'core' }] : [] }] };
      if (method === 'sessions.describe') return { entry: params.key === parentKey ? parent : params.key === childKey && sent ? child : null };
      if (method === 'sessions.list') return { sessions: sent ? [{ key: childKey, parentSessionKey: parentKey, createdVia: 'spawn', createdAt: Date.now() }] : [] };
      if (method === 'config.patch') { const patch = JSON.parse(params.raw); if (patch.agents) Object.assign(config.agents.entries.main, patch.agents.entries.main); if (patch.plugins) { const target = config.plugins.entries['deterministic-router'].config; const values = patch.plugins.entries['deterministic-router'].config; Object.assign(target, values); if (values.autoSpawnParentGrants === null) delete target.autoSpawnParentGrants; } patches++; return {}; }
      if (method === 'chat.send') { sent++; return { status: 'started', runId: sent === 1 ? 'parent-run' : 'child-followup-run' }; }
      throw new Error(`Unexpected RPC ${method}`);
    },
    async waitForRun() { return { state: 'final' }; },
    async readAuthoritativeSession(key) { return key === parentKey ? { sessionId: parent.sessionId, lifecycleRevision: 'parent-revision', createdVia: 'operator', createdActor: { type: 'human', source: 'profile', id: 'gateway-owner' }, spawnDepth: 0, priorExactPromptCount: priorPromptCount } : key === childKey ? { sessionId: child.sessionId, lifecycleRevision: 'child-revision', createdVia: 'spawn', createdActor: { type: 'agent', id: 'main' }, spawnDepth: 1, parentSessionKey: parentKey, spawnedBy: parentKey, spawnedBySessionId: parent.sessionId, parentSessionLifecycleRevision: badLineage ? 'wrong-revision' : 'parent-revision', modelOverrideSource: 'auto' } : null; },
    async readAllEvidence() { return sent === 1 ? [...record(parentKey, 'parent-run', 'gpt-6-sol', true, undefined, 'exact-session'), ...record(childKey, 'child-bootstrap-run', 'gpt-6-luna', firstTurn, firstTurn ? undefined : 'session is not allowlisted for AUTO; fail-closed without override', firstTurn ? 'spawn-parent' : undefined)] : record(childKey, 'child-followup-run', 'gpt-6-luna', true); },
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
  const absent = await runChildPhase(fixture({ spawnTool: false }), { ...settings, dryRun: true }, 'parent');
  assert.equal(absent.result, 'BLOCKED');
  assert.match(absent.error, /sessions_spawn unavailable/);
});

test('Issue #8 first-turn preflight checks candidate and parent incarnation without writes', async () => {
  const rpc = fixture({ firstTurn: true });
  const ready = await runChildPhase(rpc, { ...settings, dryRun: true }, 'first-turn');
  assert.equal(ready.result, 'READY');
  assert.deepEqual(rpc.counts(), { sent: 0, patches: 0 });
  const absent = await runChildPhase(fixture({ firstTurn: true, grantFeature: false }), { ...settings, dryRun: true }, 'first-turn');
  assert.equal(absent.result, 'BLOCKED');
  assert.match(absent.error, /candidate build not loaded/);
  const repeated = fixture({ firstTurn: true, priorPromptCount: 1 });
  const blocked = await runChildPhase(repeated, { ...settings, dryRun: true }, 'first-turn');
  assert.equal(blocked.result, 'BLOCKED');
  assert.match(blocked.error, /already received the exact test prompt/);
  assert.deepEqual(repeated.counts(), { sent: 0, patches: 0 });
});

test('Issue #8 first-turn child uses its own Luna run and restores absent grant field', async () => {
  const rpc = fixture({ firstTurn: true });
  const result = await runChildPhase(rpc, settings, 'first-turn');
  assert.equal(result.result, 'PASS');
  assert.equal(result.restoration, 'PASS');
  assert.equal(result.turns, 2);
  assert.equal(result.cases[0].resolvedModel, 'openai/gpt-6-sol');
  assert.equal(result.cases[1].autoAuthorization, 'spawn-parent');
  assert.equal(result.cases[1].resolvedModel, 'openai/gpt-6-luna');
  assert.deepEqual(rpc.counts(), { sent: 1, patches: 4 });
});

test('Issue #8 first-turn rejects mismatched authoritative child lineage and restores', async () => {
  const rpc = fixture({ firstTurn: true, badLineage: true });
  await assert.rejects(runChildPhase(rpc, settings, 'first-turn'), /Authoritative child spawn lineage/);
  assert.deepEqual(rpc.counts(), { sent: 1, patches: 4 });
});

test('Issue #8 parent and exact-key child follow-up restore SHADOW after each phase', async () => {
  const rpc = fixture();
  const parent = await runChildPhase(rpc, settings, 'parent');
  assert.equal(parent.result, 'PASS');
  assert.equal(parent.restoration, 'PASS');
  assert.equal(parent.turns, 2);
  assert.equal(parent.child.runId, 'child-bootstrap-run');
  assert.equal(parent.cases[1].resolvedModel, 'openai/gpt-6-sol');
  const followup = await runChildPhase(rpc, settings, 'followup', parent);
  assert.equal(followup.result, 'PASS');
  assert.equal(followup.restoration, 'PASS');
  assert.equal(followup.turns, 3);
  assert.equal(followup.cases.at(-1).resolvedModel, 'openai/gpt-6-luna');
  assert.deepEqual(rpc.counts(), { sent: 2, patches: 6 });
});

test('Issue #8 cannot pass a child decision from another session run', async () => {
  const rpc = fixture({ childRunId: 'unrelated-run' });
  await assert.rejects(runChildPhase(rpc, settings, 'parent'), /Child session last run does not match/);
  assert.deepEqual(rpc.counts(), { sent: 1, patches: 4 });
});

test('Issue #8 refuses follow-up after child selection changes', async () => {
  const rpc = fixture({ manualChild: true });
  const prior = { result: 'PASS', restoration: 'PASS', phase: 'parent', turns: 2, child: { key: childKey, sessionId: 'child-generation', runId: 'child-bootstrap-run', parentKey, parentSessionId: 'parent-generation' } };
  await assert.rejects(runChildPhase(rpc, settings, 'followup', prior), /Child generation\/provenance\/selection changed/);
  assert.deepEqual(rpc.counts(), { sent: 0, patches: 0 });
});
