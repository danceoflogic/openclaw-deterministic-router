import { randomUUID } from 'node:crypto';
import { digest } from './runner.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const router = c => c?.plugins?.entries?.['deterministic-router']?.config;
const selection = e => e?.modelOverrideSource === 'user' ? `${e.providerOverride}/${e.modelOverride}` : null;
const clear = e => (e?.modelOverrideSource === 'default' || e?.modelOverrideSource === null || e?.modelOverrideSource === undefined) && !e?.modelOverride && !e?.providerOverride;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = e => `${e.sessionId}/${e.lifecycleRevision}`;
const missing = response => response == null || response.entry === null || response.session === null;
const methods = ['sessions.create', 'sessions.describe', 'sessions.reset', 'sessions.delete', 'sessions.patch', 'chat.send'];

export function validateLifecycleOptions(o) {
  assert(o?.gatewayUrl === 'ws://127.0.0.1:19879' && o.profile === 'router-test', 'Refusing non-TEST Gateway/profile');
  assert(o.agentId && /^[a-z0-9_-]+$/i.test(o.agentId), 'Explicit TEST agent required');
  assert(o.ownerProfileId && /^[a-z0-9_-]+$/i.test(o.ownerProfileId), 'Human profile required');
  assert(o.maxTurns === 3, 'Lifecycle requires exact three-turn ceiling');
  assert(o.prompt === 'Reply with one word: ready', 'Only the fixed short fixture is allowed');
  assert(!o.sessionA && !o.sessionB, 'Lifecycle creates its own disposable sessions; do not supply valuable session keys');
  return o;
}

export async function runLifecycle(rpc, options, observe = () => {}) {
  const o = validateLifecycleOptions(options);
  const report = { result: 'INCONCLUSIVE', turns: 0, cases: [], providerVerification: 'DEFERRED', restoration: 'UNVERIFIED', unknownStateLive: 'NOT_RUN' };
  const call = (method, params = {}) => rpc.request(method, params);
  const get = () => call('config.get');
  const read = async key => {
    const response = await call('sessions.describe', { key });
    const e = response?.entry ?? response?.session ?? response;
    assert(e?.sessionId && e?.lifecycleRevision && e?.agentId === o.agentId, 'Session identity/generation unavailable');
    assert(key.startsWith(`agent:${o.agentId}:dashboard:router-i7-`) && e.createdVia === 'operator' && e.createdActor?.type === 'human' && e.createdActor?.identity?.type === 'profile' && e.createdActor.identity.id === o.ownerProfileId, 'Disposable session attribution/scope mismatch');
    assert(e.hasActiveRun === false, 'Disposable session is not idle');
    return e;
  };
  const patchConfig = async (fields, replacePaths = []) => {
    const c = await get();
    assert(c?.hash, 'Config CAS hash unavailable');
    await call('config.patch', { baseHash: c.hash, raw: JSON.stringify(fields), ...(replacePaths.length ? { replacePaths } : {}) });
  };
  let baseline, originalModel, aKey, bKey, a, b, createdA = false, createdB = false, attemptedA = false, attemptedB = false, routerArmed = false, agentArmed = false, bSelectionArmed = false, primaryError;
  const assertB = async () => {
    const now = await read(bKey);
    assert(identity(now) === identity(b) && selection(now) === 'openai/gpt-6-sol', 'B manual selection or generation changed');
  };
  const setRouter = async (mode, hashes) => {
    routerArmed = true;
    await patchConfig({ plugins: { entries: { 'deterministic-router': { config: { mode, autoSessionKeyHashes: hashes } } } } }, ['plugins.entries.deterministic-router.config.autoSessionKeyHashes']);
    const c = router((await get()).config), s = await call('deterministic-router.status');
    assert(c?.mode === mode && same(c.autoSessionKeyHashes, hashes) && s?.status === 'available' && (s.effectiveMode ?? s.mode) === mode && s.autoSessionAllowlistCount === hashes.length && s.protectManualSelection === true && s.requireSessionKeyForAuto === true, 'Router mode/guards not verified');
  };
  const setAgent = async model => {
    agentArmed = true;
    await patchConfig({ agents: { entries: { [o.agentId]: { model } } } });
    assert((await get()).config?.agents?.entries?.[o.agentId]?.model === model, 'Agent default not verified');
  };
  const send = async (key, label, manual) => {
    assert(!o.shouldStop?.(), 'Operator interrupted; no further turn');
    assert(report.turns < o.maxTurns, 'Inference budget exhausted');
    assert((await get()).config?.agents?.entries?.[o.agentId]?.model === 'openai/gpt-6-sol', 'Sol default absent');
    const s = await call('deterministic-router.status');
    assert(s?.status === 'available' && (s.effectiveMode ?? s.mode) === 'auto' && s.protectManualSelection === true && s.requireSessionKeyForAuto === true && s.autoSessionAllowlistCount === 2, 'AUTO guard not armed');
    const e = await read(key);
    assert((manual ? selection(e) === 'openai/gpt-6-sol' : clear(e)), `${label}: authoritative selection mismatch`);
    await assertB();
    const row = { id: label, status: 'INCONCLUSIVE', sessionKeyHash: digest(key).slice(0, 16), sessionId: e.sessionId, lifecycleRevision: e.lifecycleRevision, startedAt: new Date().toISOString() };
    report.cases.push(row);
    report.turns++;
    const ack = await call('chat.send', { sessionKey: key, message: o.prompt, idempotencyKey: randomUUID() });
    assert(ack?.status === 'started' && typeof ack.runId === 'string', `${label}: admission unconfirmed; no retry`);
    row.runId = ack.runId;
    const terminal = await rpc.waitForRun(ack.runId, key, 90000);
    row.turnCompletion = terminal?.state === 'final' ? 'completed' : 'unconfirmed';
    const records = await rpc.readEvidence(ack.runId, row.startedAt);
    const decisions = (records ?? []).filter(x => x.verificationLevel === 'selected-only' && x.decisionId);
    const d = decisions.length === 1 ? decisions[0] : null;
    row.routerMode = d?.mode; row.manualLock = d?.manualLock; row.applied = d?.applied;
    row.selectedModel = d?.selectedProvider && d?.selectedModel ? `${d.selectedProvider}/${d.selectedModel}` : null;
    row.resolvedModel = terminal?.resolvedModel ?? null;
    if (row.turnCompletion !== 'completed' || !d || d.runId !== row.runId || d.sessionKeyHash !== row.sessionKeyHash || d.agentId !== o.agentId) row.status = 'INCONCLUSIVE';
    else row.status = d.mode === 'auto' && d.classifierTier === 'SIMPLE' && row.selectedModel === 'openai/gpt-6-luna' && d.manualLock === manual && d.applied === !manual && (!row.resolvedModel || row.resolvedModel === (manual ? 'openai/gpt-6-sol' : 'openai/gpt-6-luna')) ? 'PASS' : 'FAIL';
    observe(row);
    await assertB();
    return row;
  };
  const waitIdle = async key => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await call('sessions.describe', { key });
      const e = response?.entry ?? response?.session ?? response;
      if (e?.hasActiveRun === false) return read(key);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Session remained active after terminal event; no further turn sent');
  };
  try {
    const initial = await get();
    baseline = structuredClone(router(initial?.config));
    originalModel = initial?.config?.agents?.entries?.[o.agentId]?.model;
    assert(initial?.hash && baseline?.mode === 'shadow' && baseline.protectManualSelection === true && baseline.requireSessionKeyForAuto === true && Array.isArray(baseline.autoSessionKeyHashes) && typeof originalModel === 'string', 'Guarded TEST baseline unavailable');
    const s = await call('deterministic-router.status');
    assert(s?.status === 'available' && (s.effectiveMode ?? s.mode) === 'shadow' && s.protectManualSelection === true && s.requireSessionKeyForAuto === true && s.autoSessionAllowlistCount === baseline.autoSessionKeyHashes.length, 'Published shadow baseline unavailable');
    const available = new Set(rpc.methods ?? []);
    assert(methods.every(x => available.has(x)), `Supported lifecycle method discovery missing: ${methods.filter(x => !available.has(x)).join(', ')}`);
    const catalog = await call('models.list', { view: 'default' });
    const rows = catalog?.models ?? catalog;
    assert(Array.isArray(rows) && ['gpt-6-sol', 'gpt-6-luna'].every(model => rows.some(x => x.provider === 'openai' && (x.id === model || x.model === model) && x.available !== false)), 'Required Sol/Luna models unavailable in TEST catalog');
    assert(baseline.models?.SIMPLE?.provider === 'openai' && baseline.models.SIMPLE.model === 'gpt-6-luna', 'SIMPLE target is not Luna');
    if (o.recoveryPending) return { ...report, result: 'BLOCKED', restoration: 'NOT_NEEDED', reason: 'Outstanding private recovery file' };
    if (o.dryRun) return { ...report, result: 'INCONCLUSIVE', restoration: 'NOT_NEEDED', gatewayMutations: 0, reason: 'Read-only prerequisites pass; disposable human-owned sessions can only be verified after supported sessions.create in the approved live run' };
    const suffix = randomUUID();
    aKey = `agent:${o.agentId}:dashboard:router-i7-a-${suffix}`;
    bKey = `agent:${o.agentId}:dashboard:router-i7-b-${suffix}`;
    assert(missing(await call('sessions.describe', { key: aKey })) && missing(await call('sessions.describe', { key: bKey })), 'Generated disposable key already exists');
    await o.onBaseline?.({ kind: 'lifecycle', router: baseline, agentModel: originalModel, agentId: o.agentId, sessionA: aKey, sessionB: bKey, created: [] });
    attemptedA = true;
    const createdFirst = await call('sessions.create', { key: aKey, agentId: o.agentId, label: `router-i7-a-${suffix}`, idempotencyKey: randomUUID() });
    assert(createdFirst?.ok === true && createdFirst.key === aKey && !createdFirst.runStarted && !createdFirst.runId, 'A creation acknowledgment/zero-turn condition unavailable');
    createdA = true; a = await read(aKey);
    await o.onProgress?.({ kind: 'lifecycle', router: baseline, agentModel: originalModel, agentId: o.agentId, sessionA: aKey, sessionB: bKey, created: [{ key: aKey, sessionId: a.sessionId, lifecycleRevision: a.lifecycleRevision }] });
    attemptedB = true;
    const createdSecond = await call('sessions.create', { key: bKey, agentId: o.agentId, label: `router-i7-b-${suffix}`, idempotencyKey: randomUUID() });
    assert(createdSecond?.ok === true && createdSecond.key === bKey && !createdSecond.runStarted && !createdSecond.runId, 'B creation acknowledgment/zero-turn condition unavailable');
    createdB = true; b = await read(bKey);
    await o.onProgress?.({ kind: 'lifecycle', router: baseline, agentModel: originalModel, agentId: o.agentId, sessionA: aKey, sessionB: bKey, created: [{ key: aKey, sessionId: a.sessionId, lifecycleRevision: a.lifecycleRevision }, { key: bKey, sessionId: b.sessionId, lifecycleRevision: b.lifecycleRevision }] });
    assert(clear(a) && clear(b), 'New disposable sessions are not clear');
    if (originalModel !== 'openai/gpt-6-sol') await setAgent('openai/gpt-6-sol');
    bSelectionArmed = true;
    await call('sessions.patch', { key: bKey, agentId: o.agentId, model: 'openai/gpt-6-sol', expectedSessionId: b.sessionId, expectedLifecycleRevision: b.lifecycleRevision });
    await assertB();
    await call('sessions.patch', { key: aKey, agentId: o.agentId, model: 'openai/gpt-6-sol', expectedSessionId: a.sessionId, expectedLifecycleRevision: a.lifecycleRevision });
    assert(selection(await read(aKey)) === 'openai/gpt-6-sol', 'A manual selection did not persist');
    await call('sessions.patch', { key: aKey, agentId: o.agentId, model: null, expectedSessionId: a.sessionId, expectedLifecycleRevision: a.lifecycleRevision });
    const beforeReset = await read(aKey);
    assert(identity(beforeReset) === identity(a) && clear(beforeReset), 'A generation/selection changed before reset');
    const reset = await call('sessions.reset', { key: aKey, agentId: o.agentId, reason: 'reset', expectedSessionId: a.sessionId });
    const afterReset = await read(aKey);
    assert(identity(afterReset) !== identity(a) && clear(afterReset), 'Reset did not create a clear new generation');
    a = afterReset;
    await o.onProgress?.({ kind: 'lifecycle', router: baseline, agentModel: originalModel, agentId: o.agentId, sessionA: aKey, sessionB: bKey, created: [{ key: aKey, sessionId: a.sessionId, lifecycleRevision: a.lifecycleRevision }, { key: bKey, sessionId: b.sessionId, lifecycleRevision: b.lifecycleRevision }] });
    assert(reset?.ok === true, 'Reset acknowledgment unavailable');
    await setRouter('auto', [digest(aKey), digest(bKey)]);
    if ((report.result = (await send(aKey, 'reset-clear-auto', false)).status) !== 'PASS') return report;
    a = await waitIdle(aKey);
    await call('sessions.delete', { key: aKey, agentId: o.agentId, expectedSessionId: a.sessionId, expectedLifecycleRevision: a.lifecycleRevision, deleteTranscript: true });
    createdA = false;
    const absent = await call('sessions.describe', { key: aKey });
    assert(missing(absent), 'Deleted A remains present');
    const recreatedAck = await call('sessions.create', { key: aKey, agentId: o.agentId, label: `router-i7-a-${suffix}`, idempotencyKey: randomUUID() });
    assert(recreatedAck?.ok === true && recreatedAck.key === aKey && !recreatedAck.runStarted && !recreatedAck.runId, 'Recreation acknowledgment/zero-turn condition unavailable');
    createdA = true;
    const recreated = await read(aKey);
    assert(identity(recreated) !== identity(a) && clear(recreated), 'Recreated A inherited identity or selection');
    a = recreated;
    await o.onProgress?.({ kind: 'lifecycle', router: baseline, agentModel: originalModel, agentId: o.agentId, sessionA: aKey, sessionB: bKey, created: [{ key: aKey, sessionId: a.sessionId, lifecycleRevision: a.lifecycleRevision }, { key: bKey, sessionId: b.sessionId, lifecycleRevision: b.lifecycleRevision }] });
    if ((report.result = (await send(aKey, 'recreated-clear-auto', false)).status) !== 'PASS') return report;
    if ((report.result = (await send(bKey, 'isolated-manual', true)).status) !== 'PASS') return report;
    report.result = 'PASS';
    return report;
  } catch (error) {
    primaryError = error;
    report.result = 'INCONCLUSIVE';
    report.error = error.message;
    if (o.dryRun) return { ...report, result: 'BLOCKED', turns: 0, gatewayMutations: 0, restoration: 'NOT_NEEDED', reason: error.message };
    error.report = report;
    throw error;
  } finally {
    const failures = [];
    if (routerArmed) try { await setRouter(baseline.mode, baseline.autoSessionKeyHashes); assert(same(router((await get()).config), baseline), 'Router baseline differs'); } catch (e) { failures.push(`Router restoration failed: ${e.message}`); }
    if (agentArmed) try { await setAgent(originalModel); } catch (e) { failures.push(`Agent default restoration failed: ${e.message}`); }
    if (createdB && bSelectionArmed) try { await assertB(); await call('sessions.patch', { key: bKey, agentId: o.agentId, model: null, expectedSessionId: b.sessionId, expectedLifecycleRevision: b.lifecycleRevision }); assert(clear(await read(bKey)), 'B selection clear not verified'); } catch (e) { failures.push(`B selection restoration failed: ${e.message}`); }
    if (createdA && a) try {
      const current = await read(aKey);
      assert(identity(current) === identity(a), 'A generation changed');
      if (selection(current) === 'openai/gpt-6-sol') {
        await call('sessions.patch', { key: aKey, agentId: o.agentId, model: null, expectedSessionId: a.sessionId, expectedLifecycleRevision: a.lifecycleRevision });
        assert(clear(await read(aKey)), 'A selection clear not verified');
      } else assert(clear(current), 'A selection changed; refusing cleanup');
    } catch (e) { failures.push(`A selection restoration failed: ${e.message}`); }
    // Preserve the disposable sessions for auditable lifecycle evidence; never
    // delete a session whose generation or human attribution has changed.
    if (createdA) try { assert(identity(await read(aKey)) === identity(a), 'A generation changed'); } catch (e) { failures.push(`A final identity verification failed: ${e.message}`); }
    if (createdB) try { assert(identity(await read(bKey)) === identity(b), 'B generation changed'); } catch (e) { failures.push(`B final identity verification failed: ${e.message}`); }
    if (attemptedA && !createdA) try { assert(missing(await call('sessions.describe', { key: aKey })), 'A exists after unconfirmed creation or deletion'); } catch (e) { failures.push(`A absence verification failed: ${e.message}`); }
    if (attemptedB && !createdB) try { assert(missing(await call('sessions.describe', { key: bKey })), 'B exists after unconfirmed creation'); } catch (e) { failures.push(`B absence verification failed: ${e.message}`); }
    if (baseline) try { const c = (await get()).config; assert(same(router(c), baseline) && c.agents?.entries?.[o.agentId]?.model === originalModel, 'Final config differs'); } catch (e) { failures.push(`Final TEST config verification failed: ${e.message}`); }
    if (failures.length) {
      report.restoration = 'FAIL'; report.restorationErrors = failures;
      const failure = new AggregateError(primaryError ? [primaryError, ...failures.map(x => new Error(x))] : failures.map(x => new Error(x)), 'Lifecycle run or restoration failed');
      failure.report = report; throw failure;
    }
    report.restoration = baseline ? 'PASS' : 'NOT_NEEDED';
  }
}
