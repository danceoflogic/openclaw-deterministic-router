import { randomUUID } from 'node:crypto';
import { digest, discoverSessions, validateOptions } from './runner.mjs';
import { assessControlEvidence } from './evidence.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const plugin = c => c?.plugins?.entries?.['deterministic-router']?.config;
const selected = e => e?.modelOverrideSource === 'user' ? `${e.providerOverride ?? e.modelProvider}/${e.modelOverride ?? e.model}` : null;
const clear = e => (e?.modelOverrideSource === null || e?.modelOverrideSource === 'default') && !e?.modelOverride && !e?.providerOverride;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validateControlOptions(o) {
  validateOptions({ ...o, maxTurns: 2 });
  assert(o.maxTurns === 3, 'Control sequence requires exact three-turn ceiling');
  return o;
}

export async function runControls(rpc, options, observe = () => {}) {
  const o = validateControlOptions(options);
  const report = { result: 'INCONCLUSIVE', turns: 0, cases: [], providerVerification: 'DEFERRED', restoration: 'UNVERIFIED' };
  let initial, baseline, defaultModel, aKey = o.sessionA, bKey = o.sessionB, aId;
  let routerArmed = false, agentArmed = false, selectionArmed = false, primaryError;
  const call = (method, params = {}) => rpc.request(method, params);
  const get = () => call('config.get');
  const entry = async (key, idle = false) => {
    const response = await call('sessions.describe', { key });
    const e = response?.entry ?? response?.session ?? response;
    assert(e?.sessionId && e?.agentId === o.agentId && key.startsWith(`agent:${o.agentId}:dashboard:`) && e.createdActor?.type === 'human' && e.createdActor?.identity?.type === 'profile' && e.createdActor.identity.id === o.ownerProfileId, 'Session actor/scope mismatch');
    if (idle) assert(e.hasActiveRun === false, 'Session is not idle');
    return e;
  };
  const patch = async (fields, paths = []) => {
    const c = await get();
    assert(c?.hash, 'Config compare-and-set hash unavailable');
    await call('config.patch', { baseHash: c.hash, raw: JSON.stringify(fields), ...(paths.length ? { replacePaths: paths } : {}) });
  };
  const setMode = async (value, hashes) => {
    routerArmed = true;
    await patch({ plugins: { entries: { 'deterministic-router': { config: { mode: value, autoSessionKeyHashes: hashes } } } } }, ['plugins.entries.deterministic-router.config.autoSessionKeyHashes']);
    const c = plugin((await get()).config), s = await call('deterministic-router.status');
    assert(c?.mode === value && equal(c.autoSessionKeyHashes, hashes) && s?.status === 'available' && (s.effectiveMode ?? s.mode) === value && s.autoSessionAllowlistCount === hashes.length && s.protectManualSelection === true && s.requireSessionKeyForAuto === true, `Router ${value} safeguards not verified`);
  };
  const setAgent = async model => {
    agentArmed = true;
    await patch({ agents: { entries: { [o.agentId]: { model } } } });
    assert((await get()).config?.agents?.entries?.[o.agentId]?.model === model, 'Agent-specific default not verified');
  };
  const ensureB = async () => assert(clear(await entry(bKey)), 'B gained a manual override');
  const waitIdle = async key => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await entry(key)).hasActiveRun === false) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Session remained active after terminal event; no additional turn sent');
  };
  const send = async (label, expectedMode) => {
    assert(!o.shouldStop?.(), 'Operator interrupted; no further turn');
    assert(report.turns < o.maxTurns, 'Turn budget exhausted');
    assert((await get()).config?.agents?.entries?.[o.agentId]?.model === 'openai/gpt-6-sol', 'Expected Sol agent default absent');
    const s = await call('deterministic-router.status');
    assert((s.effectiveMode ?? s.mode) === expectedMode, 'Wrong mode before turn');
    await waitIdle(aKey);
    assert(clear(await entry(aKey)), 'A override returned before turn');
    await ensureB();
    const row = { id: label, sessionKeyHash: digest(aKey).slice(0, 16), configuredDefault: 'openai/gpt-6-sol', startedAt: new Date().toISOString(), status: 'INCONCLUSIVE' };
    report.cases.push(row);
    report.turns++;
    const ack = await call('chat.send', { sessionKey: aKey, message: o.prompt, idempotencyKey: randomUUID() });
    assert(ack?.status === 'started' && typeof ack.runId === 'string', `${label}: send not admitted; no retry`);
    row.runId = ack.runId;
    const terminal = await rpc.waitForRun(ack.runId, aKey, 90000);
    row.completedAt = new Date().toISOString();
    row.turnCompletion = terminal?.state === 'final' ? 'completed' : 'unconfirmed';
    const records = await rpc.readEvidence(ack.runId, row.startedAt);
    Object.assign(row, assessControlEvidence(records, { label, runId: ack.runId, sessionKeyHash: row.sessionKeyHash, agentId: o.agentId, resolvedModel: terminal?.resolvedModel, completed: row.turnCompletion === 'completed' }));
    observe(row);
    await ensureB();
    return row;
  };
  try {
    initial = await get();
    baseline = structuredClone(plugin(initial?.config));
    defaultModel = initial?.config?.agents?.entries?.[o.agentId]?.model;
    assert(initial?.hash && baseline?.mode === 'shadow' && baseline.protectManualSelection === true && baseline.requireSessionKeyForAuto === true && Array.isArray(baseline.autoSessionKeyHashes) && typeof defaultModel === 'string', 'Guarded TEST baseline absent');
    const initialStatus = await call('deterministic-router.status');
    assert(initialStatus?.status === 'available' && (initialStatus.effectiveMode ?? initialStatus.mode) === 'shadow' && initialStatus.autoSessionAllowlistCount === baseline.autoSessionKeyHashes.length, 'TEST router baseline not published');
    if (!aKey) {
      const found = await discoverSessions(rpc, o.agentId, o.ownerProfileId);
      assert(found.length === 2, 'Expected exactly two eligible operator sessions');
      [aKey, bKey] = found;
    }
    const a = await entry(aKey, true), b = await entry(bKey, true);
    aId = a.sessionId;
    assert(clear(a) && clear(b), 'Sessions must start without manual overrides');
    assert(plugin(initial.config).models?.SIMPLE?.provider === 'openai' && plugin(initial.config).models?.SIMPLE?.model === 'gpt-6-luna', 'SIMPLE target not Luna');
    if (o.dryRun) return { result: 'READY', turns: 0, gatewayMutations: 0, sessionKeyHashes: [digest(aKey).slice(0, 16), digest(bKey).slice(0, 16)], restoration: 'NOT_NEEDED' };
    await o.onBaseline?.({ router: baseline, agentModel: defaultModel, agentId: o.agentId, sessionA: aKey, sessionAId: aId, sessionB: bKey, sessionBId: b.sessionId });
    if (defaultModel !== 'openai/gpt-6-sol') await setAgent('openai/gpt-6-sol');
    selectionArmed = true;
    await call('sessions.patch', { key: aKey, model: 'openai/gpt-6-sol' });
    assert((await entry(aKey)).sessionId === aId && selected(await entry(aKey)) === 'openai/gpt-6-sol', 'A user Sol selection did not persist');
    await ensureB();
    await call('sessions.patch', { key: aKey, model: null });
    assert((await entry(aKey)).sessionId === aId && clear(await entry(aKey)), 'A user selection did not clear');
    await setMode('auto', [digest(aKey)]);
    if ((report.result = (await send('clear-resume', 'auto')).status) !== 'PASS') return report;
    await setMode('shadow', baseline.autoSessionKeyHashes);
    if ((report.result = (await send('shadow', 'shadow')).status) !== 'PASS') return report;
    await setMode('off', baseline.autoSessionKeyHashes);
    if ((report.result = (await send('off', 'off')).status) !== 'PASS') return report;
    report.result = 'PASS';
    return report;
  } catch (error) {
    primaryError = error;
    report.result = 'INCONCLUSIVE';
    report.error = error.message;
    error.report = report;
    throw error;
  } finally {
    const failures = [];
    if (routerArmed) try { await setMode(baseline.mode, baseline.autoSessionKeyHashes); assert(equal(plugin((await get()).config), baseline), 'Router baseline mismatch'); } catch (e) { failures.push(new Error('Router restoration failed', { cause: e })); }
    if (agentArmed) try { await setAgent(defaultModel); } catch (e) { failures.push(new Error('Agent default restoration failed', { cause: e })); }
    if (selectionArmed) try {
      const a = await entry(aKey);
      assert(a.sessionId === aId, 'A session generation changed');
      if (selected(a) === 'openai/gpt-6-sol') await call('sessions.patch', { key: aKey, model: null });
      assert(clear(await entry(aKey)), 'A selection cleanup not verified');
    } catch (e) { failures.push(new Error('A selection restoration failed', { cause: e })); }
    if (initial) try {
      const c = (await get()).config;
      assert(equal(plugin(c), baseline) && c.agents?.entries?.[o.agentId]?.model === defaultModel, 'Final TEST configuration differs from baseline');
      if (aKey) assert(clear(await entry(aKey)), 'A selection not restored');
      if (bKey) await ensureB();
    } catch (e) { failures.push(new Error('Final TEST verification failed', { cause: e })); }
    if (failures.length) {
      report.restoration = 'FAIL';
      report.restorationErrors = failures.map(x => x.message);
      const aggregate = new AggregateError(primaryError ? [primaryError, ...failures] : failures, 'Control run/restoration failed');
      aggregate.report = report;
      throw aggregate;
    }
    report.restoration = initial ? 'PASS' : 'NOT_NEEDED';
  }
}
