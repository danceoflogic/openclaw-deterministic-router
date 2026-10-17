import { createHash, randomUUID } from 'node:crypto';
import { assessEvidence } from './evidence.mjs';

export const digest = key => createHash('sha256').update(key, 'utf8').digest('hex');
const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
const plugin = config => config?.plugins?.entries?.['deterministic-router']?.config;
const mode = value => value?.effectiveMode ?? value?.mode;
const userModel = entry => entry?.modelOverrideSource === 'user' ? `${entry.providerOverride ?? entry.modelProvider}/${entry.modelOverride ?? entry.model}` : null;
const noUserOverride = entry => (entry?.modelOverrideSource === null || entry?.modelOverrideSource === 'default') && !entry?.modelOverride && !entry?.providerOverride;
const agentModel = (config, id) => config?.agents?.entries?.[id]?.model ?? config?.agents?.defaults?.model;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validateOptions(o) {
  assert(o && o.gatewayUrl === 'ws://127.0.0.1:19879', 'Refusing non-TEST Gateway target');
  assert(o.profile === 'router-test', 'Refusing non-TEST profile');
  assert(o.maxTurns === 2, 'Explicit two-turn A/B ceiling required');
  assert((!o.sessionA && !o.sessionB) || (o.sessionA && o.sessionB && o.sessionA !== o.sessionB), 'Provide two distinct keys or use API discovery');
  assert(o.agentId && /^[a-z0-9_-]+$/i.test(o.agentId), 'Explicit agentId required');
  assert(o.ownerProfileId && /^[a-z0-9_-]+$/i.test(o.ownerProfileId), 'Explicit human owner profile required');
  assert(o.prompt === 'Reply with one word: ready', 'Only fixed short fixture is allowed');
  return o;
}

export async function discoverSessions(rpc, agentId, ownerProfileId) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const page = await rpc.request('sessions.list', { agentId, limit: 200, offset, excludeSubagents: true, excludeCron: true, excludeSystem: true });
    assert(Array.isArray(page?.sessions), 'sessions.list projection unavailable');
    rows.push(...page.sessions);
    if (page.sessions.length < 200) break;
    assert(offset < 1800, 'Too many TEST sessions; supply exact private keys');
  }
  return rows.filter(x => x.agentId === agentId && typeof x.key === 'string' && x.key.startsWith(`agent:${agentId}:dashboard:`) && x.createdVia === 'operator' && x.createdActor?.type === 'human' && x.createdActor?.identity?.type === 'profile' && x.createdActor.identity.id === ownerProfileId).map(x => x.key);
}

export async function runAcceptance(rpc, options, observe = () => {}) {
  const o = validateOptions(options);
  let armed = false, selectionArmed = false, agentArmed = false, selectionSessionId, primaryError, turns = 0, result = 'INCONCLUSIVE';
  let initial, initialRouter, originalAgent, sessionA = o.sessionA, sessionB = o.sessionB;
  const cases = [];
  const report = { result: 'INCONCLUSIVE', turns: 0, cases, providerVerification: 'DEFERRED', restoration: 'UNVERIFIED' };
  const call = (method, params = {}) => rpc.request(method, params);
  const status = () => call('deterministic-router.status');
  const config = () => call('config.get');
  const session = async key => {
    const response = await call('sessions.describe', { key });
    const entry = response?.entry ?? response?.session ?? response;
    assert(entry?.sessionId && entry?.agentId === o.agentId, 'Session identity or agent scope unavailable');
    assert(key.startsWith(`agent:${o.agentId}:dashboard:`) && entry.createdActor?.type === 'human' && entry.createdActor?.identity?.type === 'profile' && entry.createdActor.identity.id === o.ownerProfileId, 'Session is not owned by the specified human profile');
    assert(entry.hasActiveRun === false, 'Session is not idle');
    return entry;
  };
  const patchConfig = async (baseHash, fields, replacePaths = []) => call('config.patch', {
    baseHash, raw: JSON.stringify(fields),
    ...(replacePaths.length ? { replacePaths } : {}),
  });
  const changeRouter = async (modeValue, hashes) => {
    const c = await config();
    assert(c?.hash, 'Config compare-and-set hash unavailable');
    await patchConfig(c.hash, { plugins: { entries: { 'deterministic-router': { config: { mode: modeValue, autoSessionKeyHashes: hashes } } } } }, ['plugins.entries.deterministic-router.config.autoSessionKeyHashes']);
  };
  const changeAgent = async model => {
    const c = await config();
    assert(c?.hash, 'Config compare-and-set hash unavailable');
    await patchConfig(c.hash, { agents: { entries: { [o.agentId]: { model } } } });
  };
  const verifyAgent = async model => assert(agentModel((await config()).config, o.agentId) === model, `Agent-specific default is not ${model}`);
  const setAgent = async model => {
    if (agentModel((await config()).config, o.agentId) !== model) {
      agentArmed = true;
      await changeAgent(model);
    }
    await verifyAgent(model);
  };
  const verifyStatus = async (expectedMode, count) => {
    const s = await status();
    assert(s?.status === 'available' && mode(s) === expectedMode && s.protectManualSelection === true && s.requireSessionKeyForAuto === true && s.autoSessionAllowlistCount === count, 'Router status does not match expected safeguards');
  };
  const send = async (key, label, expectedDefault) => {
    assert(!o.shouldStop?.(), 'Operator interrupted; no further turn');
    assert(turns < o.maxTurns, 'Turn budget exhausted');
    await verifyAgent(expectedDefault);
    const startedAt = new Date().toISOString();
    const row = { id: label, sessionKeyHash: digest(key).slice(0, 16), configuredDefault: expectedDefault, startedAt, status: 'INCONCLUSIVE' };
    cases.push(row);
    turns++;
    const idempotencyKey = randomUUID();
    const ack = await call('chat.send', { sessionKey: key, message: o.prompt, idempotencyKey });
    assert(ack?.status === 'started' && typeof ack.runId === 'string', `${label}: send not admitted`);
    row.runId = ack.runId;
    assert(typeof rpc.waitForRun === 'function', 'Run event observer required');
    const terminal = await rpc.waitForRun(ack.runId, key, 90000);
    row.completedAt = new Date().toISOString();
    row.turnCompletion = terminal?.state === 'final' ? 'completed' : 'unconfirmed';
    assert(row.turnCompletion === 'completed', `${label}: terminal completion absent`);
    const evidence = await rpc.readEvidence?.(ack.runId, startedAt);
    Object.assign(row, assessEvidence(evidence, { label, runId: ack.runId, sessionKeyHash: row.sessionKeyHash, agentId: o.agentId, resolvedModel: terminal?.resolvedModel, completed: true }));
    observe(row);
    return row;
  };
  try {
    initial = await config();
    const p = plugin(initial?.config);
    initialRouter = structuredClone(p);
    originalAgent = initial?.config?.agents?.entries?.[o.agentId]?.model;
    assert(initial?.hash && p?.mode === 'shadow' && p.protectManualSelection === true && p.requireSessionKeyForAuto === true && Array.isArray(p.autoSessionKeyHashes), 'Expected TEST shadow baseline absent');
    assert(typeof originalAgent === 'string', 'Explicit agent-specific TEST default required for exact restoration');
    await verifyStatus('shadow', p.autoSessionKeyHashes.length);
    if (!sessionA) {
      const found = await discoverSessions(rpc, o.agentId, o.ownerProfileId);
      assert(found.length === 2, 'Expected exactly two discoverable sessions; set private exact keys if ambiguous');
      [sessionA, sessionB] = found;
    }
    const a = await session(sessionA), b = await session(sessionB);
    const stableSession = async (key, id) => { const value = await session(key); assert(value.sessionId === id, 'Session generation changed'); return value; };
    assert(noUserOverride(a) && noUserOverride(b), 'Sessions must start at projected configured default');
    const hashA = digest(sessionA), hashB = digest(sessionB);
    const target = p.models?.SIMPLE;
    assert(target?.provider === 'openai' && target?.model === 'gpt-6-luna', 'SIMPLE target is not Luna');
    if (o.dryRun) return { result: 'READY', turns: 0, sessionKeyHashes: [hashA.slice(0, 16), hashB.slice(0, 16)], originalAgentDefault: originalAgent, providerVerification: 'DEFERRED', restoration: 'NOT_NEEDED', gatewayMutations: 0 };
    await o.onBaseline?.({ router: initialRouter, agentModel: originalAgent, agentId: o.agentId, sessionA, sessionAId: a.sessionId, sessionB, sessionBId: b.sessionId });
    // Patch user override through the same persistent API used by the UI.
    await setAgent('openai/gpt-6-luna');
    assert(noUserOverride(await stableSession(sessionB, b.sessionId)), 'B has an override before A');
    selectionSessionId = a.sessionId;
    selectionArmed = true; // An ambiguous patch outcome still requires selection cleanup.
    await call('sessions.patch', { key: sessionA, model: 'openai/gpt-6-sol' });
    assert(userModel(await stableSession(sessionA, a.sessionId)) === 'openai/gpt-6-sol', 'Manual selection did not persist as user override');
    armed = true; // An ambiguous write outcome must still enter shadow restoration.
    await changeRouter('auto', [hashA, hashB]);
    await verifyStatus('auto', 2);
    const armedConfig = plugin((await config()).config);
    assert(armedConfig?.mode === 'auto' && JSON.stringify(armedConfig.autoSessionKeyHashes) === JSON.stringify([hashA, hashB]), 'Exact AUTO allowlist not persisted');
    await send(sessionA, 'manual-precedence', 'openai/gpt-6-luna');
    assert(userModel(await stableSession(sessionA, a.sessionId)) === 'openai/gpt-6-sol', 'Manual override changed after turn');
    if (cases[0].status !== 'PASS') { report.result = cases[0].status; report.turns = turns; return report; }
    await setAgent('openai/gpt-6-sol');
    assert(noUserOverride(await stableSession(sessionB, b.sessionId)), 'B gained an override');
    await send(sessionB, 'automatic-routing', 'openai/gpt-6-sol');
    assert(noUserOverride(await stableSession(sessionB, b.sessionId)), 'Automatic session gained an override');
    result = cases[1].status;
    report.result = result;
    report.turns = turns;
    return report;
  } catch (error) {
    primaryError = error;
    report.turns = turns;
    report.error = error.message;
    error.report = report;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (armed) {
      try {
        await changeRouter(initialRouter.mode, initialRouter.autoSessionKeyHashes);
        await verifyStatus(initialRouter.mode, initialRouter.autoSessionKeyHashes.length);
        const restored = plugin((await config()).config);
        assert(same(restored, initialRouter), 'Original router settings not fully restored');
      } catch (error) {
        cleanupErrors.push(new Error('Router shadow restoration failed; verify TEST state manually', { cause: error }));
      }
    }
    if (agentArmed) {
      try {
        await changeAgent(originalAgent);
        await verifyAgent(originalAgent);
      } catch (error) {
        cleanupErrors.push(new Error('Agent default restoration failed; verify TEST config manually', { cause: error }));
      }
    }
    if (selectionArmed) {
      try {
        // Do not clear a changed generation or an unrelated user selection.
        const cleanupA = await session(sessionA);
        assert(cleanupA.sessionId === selectionSessionId, 'A session generation changed before cleanup');
        if (userModel(cleanupA) === 'openai/gpt-6-sol') {
          await call('sessions.patch', { key: sessionA, model: null });
          assert(noUserOverride(await session(sessionA)), 'A selection cleanup not persisted');
        } else assert(noUserOverride(cleanupA), 'A selection changed; refusing to clear a different user choice');
      } catch (error) {
        cleanupErrors.push(new Error('A selection cleanup failed; verify TEST session manually', { cause: error }));
      }
    }
    if (initial) {
      try {
        const final = await config();
        assert(same(plugin(final.config), initialRouter) && agentModel(final.config, o.agentId) === originalAgent, 'TEST config differs from captured baseline');
      } catch (error) {
        cleanupErrors.push(new Error('Final TEST config verification failed', { cause: error }));
      }
    }
    if (cleanupErrors.length) {
      report.restoration = 'FAIL';
      report.restorationErrors = cleanupErrors.map(x => x.message);
      const failure = new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors, 'Acceptance run or cleanup failed; do not assume TEST state was restored');
      failure.report = report;
      throw failure;
    }
    report.restoration = initial ? 'PASS' : 'NOT_NEEDED';
  }
}
