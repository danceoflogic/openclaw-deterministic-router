# Experimental synchronous stage routing

Issue [#42](https://github.com/danceoflogic/openclaw-deterministic-router/issues/42), draft [PR #47](https://github.com/danceoflogic/openclaw-deterministic-router/pull/47). **Experimental only; do not merge or install in production.**

## Implementation

The existing deterministic `proposeStageRoute` / `routeWork` policy is unchanged. `src/codex-stage-adapter.ts` supplies a per-turn adapter. It classifies only a changed, bounded next-stage objective, retains the originally selected model for difficult continuations, and rechecks persisted manual-selection state. Configured candidates are policy targets, not proof of native compatibility or entitlement.

`experimental/codex-0.160.0-stage-routing.patch` applies to Codex tag `rust-v0.160.0`, commit `a956835d020762cb2b570053af06f643a11c0ecc`. It adds one awaited experimental server request, `turn/stageRouting`, after the entire preceding response/tool batch settles and before the next immutable step settings capture. The reply contains an optional model. Codex applies it through its existing `apply_turn_settings` implementation and awaits native validation/publication before continuing. Rejection, cancellation, missing ownership or a five-second unanswered handoff never publishes a delayed change. No timer decides which inference to change.

The stage objective comes from a native accepted `update_plan` with exactly one bounded `in_progress` goal. Commentary alone is not a formal stage boundary. This is **plan-aware routing**, not general automatic interpretation of every progress message or individual tool result. Tasks without changed accepted goals retain their current model.

`experimental/openclaw-2026.10.4-stage-routing.patch` connects that request to the router's process-local factory. It also opts native `update_plan` into the experimental tool surface. Both sides are disabled by default:

- Router/adapter: `OPENCLAW_EXPERIMENTAL_STAGE_ROUTING=1`.
- Native handoff: `CODEX_EXPERIMENTAL_STAGE_ROUTING=1`, plus native `features.step_model_switching=true`.
- Router AUTO authorization must name the exact TEST session hash; both existing manual/session safeguards remain required.
- Native model catalog, model permissions, managed authority and Node REPL review compatibility remain authoritative. No compatibility flags are falsified.

The stock installed settings API already supports active-turn changes; stock Codex/OpenClaw lacks this synchronous handoff. The extension implements that missing seam rather than using a notification race or changing only the outgoing request's model string.

## Validation and evidence boundaries

- Focused adapter/policy tests: **10 passed**. Typecheck and router build passed.
- Compiled native integration tests passed both an automatic mock-provider A → B → A continuation and an incompatible-model rejection. These exercise the awaited boundary, without holding a tool response or sending a settings RPC from the test.
- Synthetic catalogs and scripted Responses output establish native requested identities and context/tool-receipt preservation, **not real model execution**.
- Complete Gateway mock: **passed**, three requests in one turn, two native `Applied` outcomes, original context and both plan receipts preserved.
- Real provider integration: **passed** on 19 October 2026. Six requests in one native turn executed **gpt-6.1-sol → gpt-6-sol → gpt-6.1-sol**. Each completed provider response reported the corresponding requested model and nonzero output tokens. Both native changes preceded the next request. The file/sorting/proof task completed correctly; original context reached every request and task tool receipts survived both switches.
- A terminal Gateway `final` event alone is not a passing test. Earlier uninstrumented attempts are excluded. Read-only/pre-inference attempts exposed a duplicate session label, local reserved-compaction registration, custom-command custody restriction and an invalid reserved-provider override; those fixture issues were corrected without disabling their guards.
- Real cached metadata marks Luna's Node REPL review requirement differently from Sol. That native guard is retained. The verified real-model pair is `gpt-6.1-sol` / `gpt-6-sol`; cost savings are not established.

The sanitized [live result](../experimental/issue42-live-result.json) separates decisions, native settings outcomes and provider-executed identities. Raw wire evidence remains private; its digest is recorded.

| Sample | Requested and provider-reported model | Input tokens | Cached input |
| --- | --- | ---: | ---: |
| 1 | gpt-6.1-sol | 22,179 | 0 |
| 2 | gpt-6.1-sol | 22,318 | 22,016 |
| 3 | gpt-6-sol | 26,303 | 0 |
| 4 | gpt-6.1-sol | 30,270 | 22,144 |
| 5 | gpt-6.1-sol | 30,521 | 30,080 |
| 6 | gpt-6.1-sol | 30,721 | 30,336 |

Changed-goal decisions took **1.54–1.61 ms**; the two awaited native handoff/application measurements were **11.03 / 14.26 ms**. Returning to the original model reused cached input; the first request to the other model had no cached input. These are one small HTTP test's observations, not a cost-saving or general-performance benchmark. Total reported input/cached-input/output tokens: **162,312 / 104,576 / 1,169**.

Turn-level OpenClaw diagnostics continued to name the original model; they are not treated as per-stage execution evidence. The correlated post-admission wire requests and provider completions establish the real switches.

Opt-in native integration (uses an isolated temporary home, no credentials, and only a loopback scripted provider):

```bash
ISSUE42_STAGE_BIN=/absolute/path/to/patched/codex-app-server \
ISSUE42_MODEL_CATALOG=/absolute/path/to/rust-v0.160.0/codex-rs/models-manager/models.json \
npm test -- tests/codex-runtime.integration.test.ts
```

Do not set `ISSUE42_CODEX_BIN` for this run: that separately enables the already-completed installed-binary API/held-tool proof, not the new boundary test.

## TEST-only fixtures

The wire-observer and no-inference-retries patches are validation fixtures, not router dependencies. They record post-admission request model/turn identities, content-presence booleans, native settings outcomes and provider completion/usage fields; never credentials, headers or conversation content. Mock mode substitutes canned provider responses only beneath the existing admission/auth checks. It must fail closed if that owned inference route is unavailable.

The local-harness fixture (`OPENCLAW_STAGE_LOCAL_HARNESS=1`) declines the optional reserved native-compaction capability and `/codex` command. Local plugins cannot claim those privileged registrations. It uses the ordinary public harness-registration API without altering ownership checks. Compaction is outside this small test's scope; native review/model permissions remain enforced.

An `appServer.command` override is not admitted to OpenClaw's parent-local inference custody. The complete TEST therefore backs up its original managed native executable, atomically installs the explicitly experimental compiled app-server in that TEST-only slot, leaves the managed launcher and artifact/ownership checks intact, and uses app-server arguments without the CLI subcommand. Restoration includes the original native binary's byte hash. This is not an official released binary or a production installation procedure.

`codex-0.160.0-test-no-retries.patch` adds the TEST-only `CODEX_STAGE_TEST_NO_RETRIES=1` flag: the built-in OpenAI provider keeps its native definition, but uses zero request/stream retries and HTTP instead of WebSockets. Native configuration forbids overriding the reserved `model_providers.openai` entry; the fixture does not bypass that validation. Normal defaults are unchanged when the flag is absent.

OpenClaw captures plugin artifacts. Use the documented explicit `plugins.load.paths` override to select the patched local TEST plugin, and verify its loaded fixture marker before sending a task. Editing an inactive installed copy or assuming an API-key route is the OAuth route is insufficient. `scripts/experimental/gateway-stage-test.mjs` is restricted to loopback port 19879, performs no automatic task resends, and supports a read-only config/catalog preflight.

Keep the TEST baseline byte-for-byte restoration receipts outside the repository. Do not include private session configuration or credentials in commits. No Issue #7/#8 live acceptance reruns are part of this experiment.
