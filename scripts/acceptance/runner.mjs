import { createHash, randomUUID } from 'node:crypto';

const digest = key => createHash('sha256').update(key, 'utf8').digest('hex');
const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
const plugin = config => config?.plugins?.entries?.['deterministic-router']?.config;
const mode = value => value?.effectiveMode ?? value?.mode;
const userModel = entry => entry?.modelOverrideSource === 'user' ? `${entry.modelProvider}/${entry.model}` : null;
const noUserOverride = entry => entry?.modelOverrideSource === null;

export function validateOptions(o) {
  assert(o && o.gatewayUrl === 'ws://127.0.0.1:19879', 'Refusing non-TEST Gateway target');
  assert(o.profile === 'router-test', 'Refusing non-TEST profile');
  assert(Number.isInteger(o.maxTurns) && o.maxTurns >= 2 && o.maxTurns <= 6, 'Explicit maxTurns 2..6 required');
  assert(o.sessionA && o.sessionB && o.sessionA !== o.sessionB, 'Two distinct existing session keys required');
  assert(o.agentId && /^[a-z0-9_-]+$/i.test(o.agentId), 'Explicit agentId required');
  assert(o.prompt === 'Reply with one word: ready', 'Only fixed short fixture is allowed');
  return o;
}

export async function runAcceptance(rpc, options, observe = () => {}) {
  const o = validateOptions(options);
  let armed = false, selectionArmed = false, selectionSessionId, primaryError, turns = 0, result = 'INCONCLUSIVE';
  const call = (method, params = {}) => rpc.request(method, params);
  const status = () => call('deterministic-router.status');
  const config = () => call('config.get');
  const session = async key => {
    const response = await call('sessions.describe', { key });
    const entry = response?.entry ?? response?.session ?? response;
    assert(entry?.sessionId && entry?.agentId === o.agentId, 'Session identity or agent scope unavailable');
    assert(entry.createdActor?.type === 'human' && entry.createdActor?.source === 'profile', 'Session is not human-profile-created');
    assert(entry.hasActiveRun === false, 'Session is not idle');
    return entry;
  };
  const patchConfig = async (baseHash, fields, replacePaths = []) => call('config.patch', {
    baseHash, raw: JSON.stringify({ plugins: { entries: { 'deterministic-router': { config: fields } } } }),
    ...(replacePaths.length ? { replacePaths } : {}),
  });
  const verifyStatus = async (expectedMode, count) => {
    const s = await status();
    assert(s?.status === 'available' && mode(s) === expectedMode && s.protectManualSelection === true && s.requireSessionKeyForAuto === true && s.autoSessionAllowlistCount === count, 'Router status does not match expected safeguards');
  };
  const send = async (key, label) => {
    assert(!o.shouldStop?.(), 'Operator interrupted; no further turn');
    assert(turns < o.maxTurns, 'Turn budget exhausted');
    turns++;
    const idempotencyKey = randomUUID();
    const ack = await call('chat.send', { sessionKey: key, message: o.prompt, idempotencyKey });
    assert(ack?.status === 'started' && typeof ack.runId === 'string', `${label}: send not admitted`);
    assert(typeof rpc.waitForRun === 'function', 'Run event observer required');
    await rpc.waitForRun(ack.runId, key, 90000);
    observe({ case: label, status: 'completed', runId: ack.runId });
  };
  try {
    const initial = await config();
    const p = plugin(initial?.config);
    assert(initial?.hash && p?.mode === 'shadow' && p.protectManualSelection === true && p.requireSessionKeyForAuto === true && Array.isArray(p.autoSessionKeyHashes) && p.autoSessionKeyHashes.length === 0, 'Expected TEST shadow baseline absent');
    await verifyStatus('shadow', 0);
    const a = await session(o.sessionA), b = await session(o.sessionB);
    const stableSession = async (key, id) => { const value = await session(key); assert(value.sessionId === id, 'Session generation changed'); return value; };
    assert(noUserOverride(a) && noUserOverride(b), 'Sessions must start at projected configured default');
    const hashA = digest(o.sessionA), hashB = digest(o.sessionB);
    const target = p.models?.SIMPLE;
    assert(target?.provider === 'openai' && target?.model === 'gpt-6-luna', 'SIMPLE target is not Luna');
    // Patch user override through the same persistent API used by the UI.
    selectionSessionId = a.sessionId;
    selectionArmed = true; // An ambiguous patch outcome still requires selection cleanup.
    await call('sessions.patch', { key: o.sessionA, model: 'openai/gpt-6-sol' });
    assert(userModel(await stableSession(o.sessionA, a.sessionId)) === 'openai/gpt-6-sol', 'Manual selection did not persist as user override');
    const fresh = await config();
    assert(fresh.hash === initial.hash, 'Config changed before arming');
    armed = true; // An ambiguous write outcome must still enter shadow restoration.
    await patchConfig(fresh.hash, { mode: 'auto', autoSessionKeyHashes: [hashA, hashB] }, ['plugins.entries.deterministic-router.config.autoSessionKeyHashes']);
    await verifyStatus('auto', 2);
    const armedConfig = plugin((await config()).config);
    assert(armedConfig?.mode === 'auto' && JSON.stringify(armedConfig.autoSessionKeyHashes) === JSON.stringify([hashA, hashB]), 'Exact AUTO allowlist not persisted');
    await send(o.sessionA, 'manual-precedence');
    assert(userModel(await stableSession(o.sessionA, a.sessionId)) === 'openai/gpt-6-sol', 'Manual override changed after turn');
    await send(o.sessionB, 'automatic-routing');
    assert(noUserOverride(await stableSession(o.sessionB, b.sessionId)), 'Automatic session gained or has ambiguous persisted override');
    result = 'OBSERVED_COMPLETIONS_ROUTER_AUDIT_REQUIRED';
    return { result, turns, cases: ['manual-precedence', 'automatic-routing'], providerVerification: 'DEFERRED' };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (armed) {
      try {
        const current = await config();
        await patchConfig(current.hash, { mode: 'shadow', autoSessionKeyHashes: [] }, ['plugins.entries.deterministic-router.config.autoSessionKeyHashes']);
        await verifyStatus('shadow', 0);
        const restored = plugin((await config()).config);
        assert(restored?.mode === 'shadow' && Array.isArray(restored.autoSessionKeyHashes) && restored.autoSessionKeyHashes.length === 0, 'Shadow baseline not persisted');
      } catch (error) {
        cleanupErrors.push(new Error('Router shadow restoration failed; verify TEST state manually', { cause: error }));
      }
    }
    if (selectionArmed) {
      try {
        // Do not clear a changed generation or an unrelated user selection.
        const cleanupA = await session(o.sessionA);
        assert(cleanupA.sessionId === selectionSessionId, 'A session generation changed before cleanup');
        if (userModel(cleanupA) === 'openai/gpt-6-sol') {
          await call('sessions.patch', { key: o.sessionA, model: null });
          assert(noUserOverride(await session(o.sessionA)), 'A selection cleanup not persisted');
        }
      } catch (error) {
        cleanupErrors.push(new Error('A selection cleanup failed; verify TEST session manually', { cause: error }));
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors, 'Acceptance run or cleanup failed; do not assume TEST state was restored');
    }
  }
}
