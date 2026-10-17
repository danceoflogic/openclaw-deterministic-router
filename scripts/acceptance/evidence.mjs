const prefix = '[deterministic-router] ';

export function parseJournal(text, runId) {
  const records = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf(prefix);
    if (at < 0) continue;
    try {
      const item = JSON.parse(line.slice(at + prefix.length));
      if (item.runId === runId) records.push(item);
    } catch { /* Unrelated or partial journal line. */ }
  }
  return records;
}

export function assessEvidence(records, expected) {
  const decisions = (records ?? []).filter(x => x.verificationLevel === 'selected-only' && x.decisionId);
  const decision = decisions.length === 1 ? decisions[0] : null;
  const native = (records ?? []).filter(x => x.kind === 'model_identity_observed' && x.decisionId === decision?.decisionId && x.phase === 'ended' && x.outcome === 'completed');
  const resolvedModel = expected.resolvedModel ?? (native.length === 1 ? `${native[0].resolvedProvider}/${native[0].resolvedModel}` : null);
  const base = { routerMode: decision?.mode, classificationTier: decision?.classifierTier, effectiveTier: decision?.effectiveTier, selectedModel: decision?.selectedProvider && decision?.selectedModel ? `${decision.selectedProvider}/${decision.selectedModel}` : null, manualLock: decision?.manualLock, applied: decision?.applied, resolvedModel, decisionTimestamp: decision?.timestamp, decisionId: decision?.decisionId };
  if (!expected.completed) return { ...base, status: 'INCONCLUSIVE', reason: 'Turn completion not confirmed' };
  if (!decision || decision.runId !== expected.runId || decision.sessionKeyHash !== expected.sessionKeyHash || decision.agentId !== expected.agentId) return { ...base, status: 'INCONCLUSIVE', reason: 'Exactly one correlated router decision required' };
  const manual = expected.label === 'manual-precedence';
  const intended = manual ? 'openai/gpt-6-sol' : 'openai/gpt-6-luna';
  const matches = decision.mode === 'auto' && decision.classifierTier === 'SIMPLE' && decision.effectiveTier === 'SIMPLE' && base.selectedModel === 'openai/gpt-6-luna' && decision.manualLock === manual && decision.applied === !manual;
  if (!matches || (resolvedModel && resolvedModel !== intended)) return { ...base, status: 'FAIL', reason: 'Router decision or reported resolved model contradicts A/B expectation' };
  return { ...base, status: 'PASS', reason: resolvedModel ? 'Correlated router decision and reported resolution match' : 'Correlated router decision matches; resolved model unavailable' };
}

export function assessControlEvidence(records, expected) {
  const decisions = (records ?? []).filter(x => x.verificationLevel === 'selected-only' && x.decisionId);
  const decision = decisions.length === 1 ? decisions[0] : null;
  const native = (records ?? []).filter(x => x.kind === 'model_identity_observed' && x.phase === 'ended' && x.outcome === 'completed' && (expected.label === 'off' || x.decisionId === decision?.decisionId));
  const resolvedModel = expected.resolvedModel ?? (native.length === 1 ? `${native[0].resolvedProvider}/${native[0].resolvedModel}` : null);
  const base = { routerMode: decision?.mode ?? (expected.label === 'off' ? 'off' : null), classificationTier: decision?.classifierTier, selectedModel: decision?.selectedProvider && decision?.selectedModel ? `${decision.selectedProvider}/${decision.selectedModel}` : null, manualLock: decision?.manualLock, applied: decision?.applied, resolvedModel, decisionTimestamp: decision?.timestamp, decisionId: decision?.decisionId };
  if (!expected.completed) return { ...base, status: 'INCONCLUSIVE', reason: 'Turn completion not confirmed' };
  if (expected.label === 'off') {
    if (decisions.length) return { ...base, status: 'FAIL', reason: 'OFF emitted a router decision' };
    return { ...base, status: resolvedModel && resolvedModel !== 'openai/gpt-6-sol' ? 'FAIL' : 'PASS', reason: 'No router decision for completed OFF turn' };
  }
  if (!decision || decision.runId !== expected.runId || decision.sessionKeyHash !== expected.sessionKeyHash || decision.agentId !== expected.agentId) return { ...base, status: 'INCONCLUSIVE', reason: 'Exactly one correlated router decision required' };
  const matches = decision.classifierTier === 'SIMPLE' && decision.manualLock === false && (expected.label === 'clear-resume'
    ? decision.mode === 'auto' && decision.applied === true && base.selectedModel === 'openai/gpt-6-luna' && (!resolvedModel || resolvedModel === 'openai/gpt-6-luna')
    : decision.mode === 'shadow' && decision.applied === false && base.selectedModel === 'openai/gpt-6-luna' && (!resolvedModel || resolvedModel === 'openai/gpt-6-sol'));
  return { ...base, status: matches ? 'PASS' : 'FAIL', reason: matches ? 'Correlated control decision matches' : 'Router control decision or resolved model contradicts expectation' };
}
