import { randomUUID } from 'node:crypto';
import { digest } from './runner.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const router = config => config?.plugins?.entries?.['deterministic-router']?.config;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const childPrefix = agentId => `agent:${agentId}:subagent:`;
export const isOpenClawSpawnedChild = (entry, agentId, parentKey, since) => entry?.key?.startsWith(childPrefix(agentId)) && entry.parentSessionKey === parentKey && entry.createdVia === 'spawn' && entry.createdAt >= since;
export const ISSUE8_PARENT_PROMPT = 'Prove formally, step by step, whether a replicated cache invalidation protocol with concurrent writes, delayed messages, and crash recovery can guarantee no stale reads. Derive the safe update ordering and provide a counterexample to an unsafe ordering. For the independent child step, call the OpenClaw sessions_spawn tool exactly once with runtime="subagent", context="isolated", and a task to read the first line of README.md and return only that line. Omit agentId so the isolated child targets this TEST main agent. Do not pass a model or other model-selection override. Do not use the native Codex spawn_agent tool for this experiment. Wait for the OpenClaw child result before finishing. Do not edit files, send external messages, or spawn additional agents.';
export const ISSUE8_CHILD_PROMPT = 'Hi. What is the first line of README.md?';

function resolvedModel(records, decision) {
  const native = records.filter(x => x.kind === 'model_identity_observed' && x.verificationLevel === 'runtime-model' && x.runId === decision.runId && x.decisionId === decision.decisionId && x.resolvedProvider && x.resolvedModel && (x.phase === 'ended' && x.outcome === 'completed' || x.source === 'agent_end_context'));
  const values = [...new Set(native.map(x => `${x.resolvedProvider}/${x.resolvedModel}`))];
  return values.length === 1 ? values[0] : null;
}

export function validateChildOptions(o) {
  assert(o?.childTest === true && o.lifecycle !== true, 'Explicit child-test settings required');
  assert(o?.gatewayUrl === 'ws://127.0.0.1:19879' && o.profile === 'router-test', 'Refusing non-TEST Gateway/profile');
  assert(o.agentId === 'main' && o.ownerProfileId === 'gateway-owner', 'Expected TEST agent and owner');
  assert(o.maxTurns === 4, 'Issue #8 has an exact four-turn ceiling');
  assert(typeof o.parentSession === 'string' && o.parentSession.startsWith('agent:main:dashboard:'), 'Exact private parent session required');
  assert(o.parentPrompt === ISSUE8_PARENT_PROMPT, 'Exact reviewed parent prompt required');
  assert(o.childPrompt === ISSUE8_CHILD_PROMPT, 'Only the fixed SIMPLE child follow-up is allowed');
  return o;
}

export async function runChildPhase(rpc, options, phase, prior) {
  const o = validateChildOptions(options);
  const call = (method, params = {}) => rpc.request(method, params);
  const get = () => call('config.get');
  const describe = async key => {
    const response = await call('sessions.describe', { key });
    return response?.entry ?? response?.session ?? null;
  };
  const status = () => call('deterministic-router.status');
  const firstTurn = phase === 'first-turn';
  assert(['parent', 'followup', 'first-turn'].includes(phase), 'Unknown Issue #8 child phase');
  const report = { result: 'INCONCLUSIVE', phase, turns: 0, cases: [], restoration: 'UNVERIFIED', providerVerification: 'DEFERRED' };
  let baseline, defaultModel, routerArmed = false, agentArmed = false, error;
  const verifyBaseline = async () => {
    const c = (await get()).config;
    const s = await status();
    assert(same(router(c), baseline) && c.agents?.entries?.[o.agentId]?.model === defaultModel && s?.status === 'available' && (s.effectiveMode ?? s.mode) === baseline.mode && s.autoSessionAllowlistCount === baseline.autoSessionKeyHashes.length && (!firstTurn || s.autoSpawnParentGrantCount === (baseline.autoSpawnParentGrants?.length ?? 0)), 'TEST router/agent baseline restoration not verified');
  };
  const setRouter = async (mode, hashes, grants) => {
    const c = await get();
    assert(c?.hash, 'Config CAS hash unavailable');
    routerArmed = true;
    await call('config.patch', { baseHash: c.hash, raw: JSON.stringify({ plugins: { entries: { 'deterministic-router': { config: { mode, autoSessionKeyHashes: hashes, ...(firstTurn ? { autoSpawnParentGrants: grants ?? null } : {}) } } } } }), replacePaths: ['plugins.entries.deterministic-router.config.autoSessionKeyHashes', ...(firstTurn ? ['plugins.entries.deterministic-router.config.autoSpawnParentGrants'] : [])] });
    const actual = router((await get()).config), s = await status();
    assert(actual?.mode === mode && same(actual.autoSessionKeyHashes, hashes) && (!firstTurn || same(actual.autoSpawnParentGrants ?? null, grants ?? null)) && s?.status === 'available' && (s.effectiveMode ?? s.mode) === mode && s.autoSessionAllowlistCount === hashes.length && (!firstTurn || s.autoSpawnParentGrantCount === (grants?.length ?? 0)) && s.protectManualSelection === true && s.requireSessionKeyForAuto === true, 'TEST router guards not verified');
  };
  const setAgent = async model => {
    const c = await get();
    assert(c?.hash, 'Config CAS hash unavailable');
    agentArmed = true;
    await call('config.patch', { baseHash: c.hash, raw: JSON.stringify({ agents: { entries: { [o.agentId]: { model } } } }) });
    assert((await get()).config?.agents?.entries?.[o.agentId]?.model === model, 'TEST agent default not verified');
  };
  try {
    const initial = await get();
    baseline = structuredClone(router(initial?.config));
    defaultModel = initial?.config?.agents?.entries?.[o.agentId]?.model;
    assert(initial?.hash && typeof defaultModel === 'string' && baseline?.mode === 'shadow' && baseline.protectManualSelection === true && baseline.requireSessionKeyForAuto === true && Array.isArray(baseline.autoSessionKeyHashes), 'Guarded TEST SHADOW baseline unavailable');
    const s = await status();
    assert(s?.status === 'available' && (s.effectiveMode ?? s.mode) === 'shadow' && s.protectManualSelection === true && s.requireSessionKeyForAuto === true, 'Published TEST safeguards unavailable');
    assert(baseline.models?.SIMPLE?.provider === 'openai' && baseline.models.SIMPLE.model === 'gpt-6-luna' && baseline.models?.COMPLEX?.model === 'gpt-6-sol', 'TEST Sol/Luna targets unavailable');
    const parent = await describe(o.parentSession);
    assert(parent?.sessionId && parent.agentId === o.agentId && parent.createdVia === 'operator' && parent.createdActor?.type === 'human' && parent.createdActor?.identity?.type === 'profile' && parent.createdActor.identity.id === o.ownerProfileId && parent.hasActiveRun === false, 'Human-owned idle parent unavailable');
    assert((parent.modelOverrideSource === null || parent.modelOverrideSource === 'default') && !parent.modelOverride && !parent.providerOverride, 'Parent has a manual model selection or unknown selection state');
    if (phase === 'parent' || firstTurn) {
      let grant;
      if (firstTurn) {
        assert(Array.isArray(baseline.autoSpawnParentGrants) ? baseline.autoSpawnParentGrants.length === 0 : baseline.autoSpawnParentGrants === undefined, 'Existing TEST spawn grants are outside this experiment');
        assert(baseline.autoSessionKeyHashes.length === 0, 'Existing TEST AUTO allowlist is outside this experiment');
        assert(s.autoSpawnParentGrantCount === 0, 'First-turn candidate build not loaded or grant baseline unknown');
        assert(typeof rpc.readAuthoritativeSession === 'function', 'Authoritative TEST session reader unavailable');
        const authoritativeParent = await rpc.readAuthoritativeSession(o.parentSession);
        assert(authoritativeParent?.sessionId === parent.sessionId && typeof authoritativeParent.lifecycleRevision === 'string' && authoritativeParent.lifecycleRevision.length > 0 && authoritativeParent.createdVia === 'operator' && authoritativeParent.createdActor?.type === 'human' && authoritativeParent.createdActor.source === 'profile' && authoritativeParent.createdActor.id === o.ownerProfileId && authoritativeParent.spawnDepth === 0 && authoritativeParent.archivedAt === undefined, 'Exact parent incarnation/creator unavailable');
        grant = { parentSessionKeyHash: digest(o.parentSession), parentSessionId: parent.sessionId, parentLifecycleRevision: authoritativeParent.lifecycleRevision, parentCreatorProfileId: o.ownerProfileId };
      }
      const tools = await call('tools.effective', { sessionKey: o.parentSession });
      assert(tools?.agentId === o.agentId && tools.toolAccess?.checked === 'live-session' && tools.toolAccess.tools?.some(tool => tool.id === 'sessions_spawn' && tool.status === 'available') && tools.groups?.some(group => group.tools?.some(tool => tool.id === 'sessions_spawn' && tool.source === 'core' && tool.deniedBySession !== true)), 'OpenClaw sessions_spawn unavailable in TEST parent effective tool preview');
      assert(!o.recoveryPending, 'Outstanding private recovery file');
      if (o.dryRun) return { ...report, result: 'READY', restoration: 'NOT_NEEDED', gatewayMutations: 0 };
      await o.onBaseline?.({ kind: 'child', firstTurn, router: baseline, agentModel: defaultModel, agentId: o.agentId, sessionA: o.parentSession, sessionAId: parent.sessionId });
      if (defaultModel !== 'openai/gpt-6-sol') await setAgent('openai/gpt-6-sol');
      await setRouter('auto', [digest(o.parentSession)], firstTurn ? [grant] : undefined);
      assert(!o.shouldStop?.(), 'Operator interrupted before parent send');
      const startedAt = new Date(Date.now() - 1000).toISOString();
      report.turns = 1;
      const ack = await call('chat.send', { sessionKey: o.parentSession, message: o.parentPrompt, idempotencyKey: randomUUID() });
      assert(ack?.status === 'started' && typeof ack.runId === 'string', 'Parent admission unconfirmed; no retry');
      const terminal = await rpc.waitForRun(ack.runId, o.parentSession, 180000);
      assert(terminal?.state === 'final', 'Parent completion unconfirmed');
      let children = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        const page = await call('sessions.list', { agentId: o.agentId, limit: 200, excludeCron: true, excludeSystem: true });
        assert(Array.isArray(page?.sessions) && page.sessions.length < 200, 'Bounded child inventory unavailable');
        children = page.sessions.filter(x => isOpenClawSpawnedChild(x, o.agentId, o.parentSession, Date.parse(startedAt)));
        if (children.length) break;
        await pause(250);
      }
      assert(children.length === 1, 'Expected exactly one newly spawned child');
      let child = await describe(children[0].key);
      for (let attempt = 0; child?.hasActiveRun && attempt < 80; attempt++) { await pause(250); child = await describe(children[0].key); }
      assert(child?.sessionId && child.sessionId !== parent.sessionId && child.agentId === o.agentId && child.spawnDepth === parent.spawnDepth + 1 && child.createdVia === 'spawn' && child.createdActor?.type === 'agent' && child.createdActor.id === o.agentId && child.parentSessionKey === o.parentSession && child.hasActiveRun === false, 'Child provenance or idle state mismatch');
      assert(child.modelOverrideSource === 'auto' && child.modelProvider === 'openai' && child.model === 'gpt-6-sol', 'Child did not inherit an automatic Sol starting model');
      if (firstTurn) {
        const authoritativeChild = await rpc.readAuthoritativeSession(children[0].key);
        assert(authoritativeChild?.sessionId === child.sessionId && authoritativeChild.lifecycleRevision && authoritativeChild.createdVia === 'spawn' && authoritativeChild.createdActor?.type === 'agent' && authoritativeChild.createdActor.id === o.agentId && authoritativeChild.spawnDepth === 1 && authoritativeChild.parentSessionKey === o.parentSession && authoritativeChild.spawnedBy === o.parentSession && authoritativeChild.spawnedBySessionId === grant.parentSessionId && authoritativeChild.parentSessionLifecycleRevision === grant.parentLifecycleRevision && authoritativeChild.modelOverrideSource === 'auto', 'Authoritative child spawn lineage or model selection mismatch');
      }
      let records = await rpc.readAllEvidence(startedAt);
      const parentHash = digest(o.parentSession).slice(0, 16), childHash = digest(children[0].key).slice(0, 16);
      const decisions = records.filter(x => x.verificationLevel === 'selected-only' && x.decisionId && [parentHash, childHash].includes(x.sessionKeyHash));
      const p = decisions.find(x => x.runId === ack.runId && x.sessionKeyHash === parentHash);
      const childDecisions = decisions.filter(x => x.sessionKeyHash === childHash);
      assert(p && childDecisions.length === 1, 'Independent parent/child router decisions not uniquely correlated');
      const d = childDecisions[0];
      assert(typeof child.lastRunId === 'string' && child.lastRunId === d.runId && child.abortedLastRun !== true, 'Child session last run does not match independent router decision');
      const runIds = new Set(decisions.map(x => x.runId));
      report.turns = runIds.size;
      report.cases = [
        { id: 'parent', runId: ack.runId, sessionKeyHash: parentHash, tier: p.effectiveTier, selectedModel: `${p.selectedProvider}/${p.selectedModel}`, applied: p.applied, autoAuthorization: p.autoAuthorization, resolvedModel: resolvedModel(records, p) },
        { id: 'child-bootstrap', runId: d.runId, sessionKeyHash: childHash, tier: d.effectiveTier, selectedModel: `${d.selectedProvider}/${d.selectedModel}`, applied: d.applied, manualLock: d.manualLock, autoAuthorization: d.autoAuthorization, resolvedModel: resolvedModel(records, d) },
      ];
      assert(report.turns >= 2 && report.turns <= 3 && p.applied === true && (!firstTurn || p.autoAuthorization === 'exact-session') && ['COMPLEX','REASONING'].includes(p.effectiveTier) && p.selectedProvider === 'openai' && p.selectedModel === 'gpt-6-sol' && report.cases[0].resolvedModel === 'openai/gpt-6-sol', 'Parent strong-model evidence or turn budget mismatch');
      assert(d.agentId === o.agentId && d.runId !== ack.runId && d.manualLock === false && (firstTurn
        ? d.mode === 'auto' && d.applied === true && d.autoAuthorization === 'spawn-parent' && ['SIMPLE', 'MEDIUM'].includes(d.effectiveTier) && d.selectedProvider === 'openai' && d.selectedModel === 'gpt-6-luna' && report.cases[1].resolvedModel === 'openai/gpt-6-luna'
        : d.applied === false && d.reason === 'session is not allowlisted for AUTO; fail-closed without override' && report.cases[1].resolvedModel === 'openai/gpt-6-sol'), 'Child bootstrap or OpenClaw resolution not confirmed');
      report.child = { key: children[0].key, sessionId: child.sessionId, runId: d.runId, parentKey: o.parentSession, parentSessionId: parent.sessionId };
      report.result = 'PASS';
    } else {
      assert(prior?.result === 'PASS' && prior?.restoration === 'PASS' && prior?.phase === 'parent' && prior.turns >= 2 && prior.turns <= 3, 'Verified parent report required');
      const key = prior.child?.key;
      assert(typeof key === 'string' && key.startsWith(childPrefix(o.agentId)) && typeof prior.child.runId === 'string' && prior.child.parentKey === o.parentSession && prior.child.parentSessionId === parent.sessionId, 'Saved child scope/parent changed');
      const child = await describe(key);
      assert(child?.sessionId === prior.child.sessionId && child.lastRunId === prior.child.runId && child.agentId === o.agentId && child.createdVia === 'spawn' && child.createdActor?.type === 'agent' && child.createdActor.id === o.agentId && child.parentSessionKey === o.parentSession && child.hasActiveRun === false && child.modelOverrideSource === 'auto', 'Child generation/provenance/selection changed');
      assert(!o.recoveryPending, 'Outstanding private recovery file');
      if (o.dryRun) return { ...report, result: 'READY', restoration: 'NOT_NEEDED', gatewayMutations: 0, remainingTurns: 4 - prior.turns };
      assert(prior.turns < 4 && !o.shouldStop?.(), 'Four-turn ceiling exhausted or operator interrupted');
      await o.onBaseline?.({ kind: 'child', router: baseline, agentModel: defaultModel, agentId: o.agentId, sessionA: o.parentSession, sessionAId: parent.sessionId, childKey: key, childSessionId: child.sessionId });
      await setRouter('auto', [digest(key)]);
      const startedAt = new Date(Date.now() - 1000).toISOString();
      report.turns = prior.turns + 1;
      const ack = await call('chat.send', { sessionKey: key, message: o.childPrompt, idempotencyKey: randomUUID() });
      assert(ack?.status === 'started' && typeof ack.runId === 'string', 'Child follow-up admission unconfirmed; no retry');
      const terminal = await rpc.waitForRun(ack.runId, key, 90000);
      const records = await rpc.readAllEvidence(startedAt);
      const decisions = records.filter(x => x.verificationLevel === 'selected-only' && x.runId === ack.runId && x.sessionKeyHash === digest(key).slice(0, 16));
      const d = decisions.length === 1 ? decisions[0] : null;
      report.cases = [...prior.cases, { id: 'child-followup', runId: ack.runId, sessionKeyHash: digest(key).slice(0, 16), tier: d?.effectiveTier, selectedModel: d ? `${d.selectedProvider}/${d.selectedModel}` : null, applied: d?.applied, manualLock: d?.manualLock, resolvedModel: d ? resolvedModel(records, d) : null }];
      assert(terminal?.state === 'final' && d && d.agentId === o.agentId && d.mode === 'auto' && d.effectiveTier === 'SIMPLE' && d.selectedProvider === 'openai' && d.selectedModel === 'gpt-6-luna' && d.applied === true && d.manualLock === false && report.cases.at(-1).resolvedModel === 'openai/gpt-6-luna', 'Child independent Luna routing not confirmed');
      report.result = 'PASS';
    }
    return report;
  } catch (cause) {
    error = cause;
    report.error = cause.message;
    if (o.dryRun) return { ...report, result: 'BLOCKED', turns: 0, restoration: 'NOT_NEEDED', gatewayMutations: 0 };
    cause.report = report;
    throw cause;
  } finally {
    const failures = [];
    if (routerArmed) try { await setRouter(baseline.mode, baseline.autoSessionKeyHashes, baseline.autoSpawnParentGrants); } catch (cause) { failures.push(cause); }
    if (agentArmed) try { await setAgent(defaultModel); } catch (cause) { failures.push(cause); }
    if (routerArmed || agentArmed) try { await verifyBaseline(); } catch (cause) { failures.push(cause); }
    if (failures.length) {
      report.restoration = 'FAIL'; report.restorationErrors = failures.map(x => x.message);
      const combined = new AggregateError(error ? [error, ...failures] : failures, 'Issue #8 restoration failed');
      combined.report = report; throw combined;
    }
    report.restoration = routerArmed || agentArmed ? 'PASS' : 'NOT_NEEDED';
  }
}
