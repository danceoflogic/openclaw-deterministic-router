# External operator TEST acceptance runner (OpenClaw 2026.10.4)

This is an **owner-launched external CLI**, not an agent-exec path or a Control UI impersonation. It uses the published `@openclaw/gateway-client` 2026.10.4 with an Ed25519 device identity and the documented `sessions.patch`, `chat.send`, `config.patch` and router status RPCs. The first action should be offline `dry-run`: it makes **zero Gateway calls**. No live run is authorised by this document; the previous six-turn inference window is exhausted.

The runner intentionally covers only the core A/B sequence. It does not assert lifecycle/reset, off-mode, provider-side request identity or independent accounting. Its final label is `OBSERVED_COMPLETIONS_ROUTER_AUDIT_REQUIRED` until the operator matches the emitted run IDs against existing router decision records (manual `manualLock=true,applied=false`; automatic `manualLock=false,applied=true`, SIMPLE, Luna) and OpenClaw resolved-model reporting. Independent upstream model confirmation remains deferred to owner logs under the 2026-10-17 [protocol](acceptance-test-protocol.md) amendment. See [#7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6237123874) and [#10](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10#issuecomment-6237124169).

## Private setup, no live calls

1. Install dependencies. Prepare **two genuinely operator-owned, idle, existing TEST sessions** for the same agent, with no model override. Do not synthesize session rows. Confirm TEST Gateway is really on loopback port 19879, router baseline is `shadow`, both guards true and allowlist empty, and SIMPLE maps to `openai/gpt-6-luna`. A session must expose `modelOverrideSource: null`; an omitted projection is not accepted.
2. Create a private settings file outside the repository, mode 0600, containing:

   ```json
   {"gatewayUrl":"ws://127.0.0.1:19879","profile":"router-test","agentId":"YOUR_TEST_AGENT","sessionA":"EXISTING_TEST_KEY_A","sessionB":"EXISTING_TEST_KEY_B","maxTurns":2,"prompt":"Reply with one word: ready","deviceFile":"/PRIVATE/PATH/router-acceptance-device.json"}
   ```

3. `npm run acceptance:operator -- dry-run /PRIVATE/PATH/settings.json` validates this without a connection. `node --test scripts/acceptance/runner.test.mjs` runs mocked contract tests.
4. `npm run acceptance:operator -- init-device /PRIVATE/PATH/settings.json` creates a private key file. An existing approved operator device can instead be provided at `deviceFile` in the same JSON shape; never commit either file. The client requests `operator.read`, `operator.write`, `operator.admin` (admin is needed only for the scoped config patch). For initial pairing, provide the TEST bootstrap token through `OPENCLAW_GATEWAY_TOKEN` in the **human-launched process environment**, start `run`, then use `openclaw devices list` and `openclaw devices approve <exact-request-id>` on TEST. Pairing may require one reconnect/second launch after approval; the first attempt makes no acceptance turn if authentication has not succeeded. The SDK persists its device token next to the identity as a 0600 file. Do not use a reserved backend identity or bypass ownership checks.

## Bounded live run (requires new owner-authorised turn budget)

With an explicit newly approved ceiling of **2 inference turns**, the human runs:

```sh
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=2 npm run acceptance:operator -- run /PRIVATE/PATH/settings.json
```

The ceiling must match settings. There are no automatic `chat.send` retries; an uncertain ACK/timeout is inconclusive and consumes a turn. The runner refuses non-TEST URL/profile, wrong baseline, missing scoped session identity/provenance, wrong SIMPLE target or wrong router safeguards. It patches A to a persisted Sol user choice, verifies that provenance, then uses a hash allowlist for *only A and B* and enters AUTO. It sends one fixed short fixture to A, then B, observing terminal chat events by exact run ID. It records only case labels, run IDs and statuses, never prompts, responses, keys or credentials. On normal error or SIGINT/SIGTERM, it patches back to `shadow` with empty allowlist and verifies router status before clearing the temporary A model override. It never resets/deletes sessions or changes service state. Hard kills, host loss or an unconfirmed config write can defeat process-local cleanup: before any further turn, operator must manually verify TEST shadow/empty allowlist and restore via supported controls if necessary.

The operator must review the two run IDs in existing sanitized router logs and OpenClaw session/turn records before marking functional PASS/FAIL. This client does **not** collect independent provider-call receipts. A reported completion is not by itself a routing PASS.
