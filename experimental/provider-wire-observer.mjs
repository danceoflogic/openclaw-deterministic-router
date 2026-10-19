// TEST-only transport observations. Never stores headers, credentials or content.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function record(value) {
  const path = process.env.OPENCLAW_STAGE_WIRE_LOG;
  if (path) appendFileSync(path, JSON.stringify({ at: Date.now(), ...value }) + '\n', { mode: 0o600 });
}

// Pre-inference evidence that the selected captured plugin contains this fixture.
record({ event: 'runtime.observer.loaded', module: import.meta.url,
  mockTransportEnabled: Boolean(process.env.OPENCLAW_STAGE_MOCK_RESPONSE_DIRECTORY) });

export function describeWireRequest(body, metadata, transport, path) {
  const marker = process.env.OPENCLAW_STAGE_TEST_MARKER;
  const toolResults = Array.isArray(body?.input) ? body.input.filter(item => /call_output$/.test(item.type ?? '')) : [];
  return { wireId: randomUUID(), requestedModel: body?.model, requestedEffort: body?.reasoning?.effort, transport, path,
    threadId: metadata?.threadId, turnId: metadata?.turnId, requestKind: metadata?.requestKind,
    subagent: metadata?.subagent, subagentKind: metadata?.subagentKind, threadSource: metadata?.threadSource,
    parentThreadId: metadata?.parentThreadId, rootTurnId: metadata?.rootTurnId,
    toolResultCount: toolResults.length,
    toolResultIds: toolResults.map(item => item.call_id).filter(id => typeof id === 'string'),
    taskToolReceiptPresent: marker ? toolResults.some(item => JSON.stringify(item).includes(marker)) : undefined,
    originalContextPresent: marker ? JSON.stringify(body?.input ?? []).includes(marker) : undefined };
}

export function nativeSettingsObserver() {
  let pending = '';
  return chunk => {
    pending += String(chunk);
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      try {
        const value = JSON.parse(line).fields;
        if (value?.message === 'stage routing settings outcome') record({ event: 'native.settings.result',
          turnId: value.turn_id, from: value.from, to: value.to, fromEffort: value.from_effort, toEffort: value.to_effort, outcome: value.outcome, elapsedMs: value.elapsed_ms });
      } catch { /* Other native logs are neither captured nor copied. */ }
    }
    if (pending.length > 1024 * 1024) pending = '';
  };
}

export function observeWireSend(wire) { if (wire) record({ event: 'provider.request', ...wire }); }

let mockStage = 0;
/** Canned TEST provider below native admission/auth checks, never a routing path. */
export function mockWireResponse(wire) {
  const directory = process.env.OPENCLAW_STAGE_MOCK_RESPONSE_DIRECTORY;
  if (!directory) throw Error('Mock transport is not enabled');
  const emit = event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  if (wire?.requestKind === 'prewarm') return new Response(emit({ type: 'response.completed', response: { id: 'mock-prewarm' } }), { headers: { 'content-type': 'text/event-stream' } });
  if (wire?.requestKind !== 'turn' || !wire.originalContextPresent || wire.parentThreadId || wire.subagent) throw Error('Unexpected native request in TEST mock transport; no network request sent');
  const n = ++mockStage;
  if (n > 3) throw Error('Scripted mock turn already completed; no network request sent');
  const goals = ['Sort this provided list alphabetically; deterministic formatting only, no analysis or explanation.', 'Prove this theorem formally, step by step, and derive the result.'];
  appendFileSync(join(directory, 'native-mock-provider.jsonl'), JSON.stringify({ event: 'mock.request', n, ...wire })+'\n', { mode: 0o600 });
  const item = n < 3
    ? { type: 'function_call', call_id: `plan-${n}`, name: 'update_plan', arguments: JSON.stringify({ plan: [{ step: goals[n-1], status: 'in_progress' }] }) }
    : { type: 'message', id: 'mock-final', role: 'assistant', content: [{ type: 'output_text', text: 'Native mock task complete.' }] };
  const text = emit({ type: 'response.created', response: { id: `mock-${n}`, model: wire.requestedModel } })
    + emit({ type: 'response.output_item.done', item })
    + emit({ type: 'response.completed', response: { id: `mock-${n}`, model: wire.requestedModel, status: 'completed', usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } });
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export function observeWireResponse(bytes, wire) {
  if (!wire) return;
  try {
    const event = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)) {
      const response = event.response ?? {};
      record({ event: 'provider.response', ...wire, responseType: event.type,
        responseId: response.id, reportedModel: response.model,
        status: response.status, usage: response.usage ? {
          input_tokens: response.usage.input_tokens, input_tokens_details: response.usage.input_tokens_details,
          output_tokens: response.usage.output_tokens, output_tokens_details: response.usage.output_tokens_details,
          total_tokens: response.usage.total_tokens } : undefined,
        error: response.error ? { type: response.error.type, code: response.error.code } : undefined });
    }
  } catch { /* Non-JSON stream frames carry no structured execution receipt. */ }
}

export function wireResponseObserver(wire) {
  let pending = '';
  const decoder = new TextDecoder();
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      pending = (pending + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
      let end;
      while ((end = pending.indexOf('\n\n')) >= 0) {
        const event = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) observeWireResponse(Buffer.from(data), wire);
      }
      if (pending.length > 1024 * 1024) pending = '';
    },
  });
}
