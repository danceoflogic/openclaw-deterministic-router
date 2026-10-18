import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkedJsonOutput } from './framing.mjs';

const marker = 'ISSUE8_TEST_FRAME';

test('marked JSON is isolated from stdout emitted before and after the result', () => {
  const value = { sessionId: 'test-session', priorExactPromptCount: 0 };
  const output = `[runtime notice]\n${marker}${JSON.stringify(value)}${marker}\n[shutdown notice]`;
  assert.deepEqual(parseMarkedJsonOutput(output, marker), value);
});

test('marked JSON rejects missing or ambiguous framing', () => {
  assert.throws(() => parseMarkedJsonOutput('{"ok":true}', marker), /markers are missing or ambiguous/);
  assert.throws(() => parseMarkedJsonOutput(`${marker}{"ok":true}${marker}${marker}`, marker), /markers are missing or ambiguous/);
});

test('marked JSON rejects malformed payloads', () => {
  assert.throws(() => parseMarkedJsonOutput(`${marker}{bad}${marker}`, marker), SyntaxError);
});
