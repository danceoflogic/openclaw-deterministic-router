# Stage routing prototype: offline only

**18 October 2026, Issue [#42](https://github.com/danceoflogic/openclaw-deterministic-router/issues/42).** This commit adds a **pure TypeScript stage model proposal** and fake-host tests, **not** an OpenClaw/Codex runtime adapter or production AUTO activation.

## What is implemented

- `src/stage-routing.ts` exports `proposeStageRoute`, a synchronous and deterministic recommendation. Existing `routeWork()` and its 15-dimensional local classifier/policy are reused.
- Requires explicit experimental enablement, authoritative *clear* manual-selection state from a future trusted adapter, a completed model response, settled tool batch and independently confirmed *new stage objective*. A progress message by itself is not a stage boundary.
- Work remains anchored to the original task model/tier. Difficult continuation keeps the **original chosen model**, regardless of model family. A confirmed different straightforward stage can propose another eligible same-provider model. Empty/missing eligibility, unsuitable goal, active tools or unknown model state keep the current model.
- Recommendations never dispatch, patch a session, change a Gateway setting or update a Codex thread. The model returned is **not** observed runtime identity.
- `tests/stage-routing.test.ts` exercises guards and a fake synchronised model sequence `Sol → Luna → Sol`, with simulated settings acknowledgments strictly preceding fake dispatch. These are neither real model requests nor evidence that the installed runtime can perform the transition.

## Installed-runtime investigation (18 October 2026)

Inspected the isolated TEST installation: OpenClaw / `@openclaw/codex` **2026.10.4**, Codex CLI **0.160.0**. Generated the experimental TypeScript protocol from that exact installed binary, and traced matching upstream tag `rust-v0.160.0`, commit `a956835d020762cb2b570053af06f643a11c0ecc`. This supersedes the earlier unverified/older-version claim about the API limitation.

**The settings API works; the synchronous boundary is missing.** `turn/settings/update`, with experimental API negotiation and `features.step_model_switching=true`, publishes the running turn's next-step settings. Ordinary thread/future-turn settings are a different API and their next-turn-only regression does not establish a limitation of this method.

Exact source locations (pinned commit above):

- [`session/turn.rs`](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/core/src/session/turn.rs#L3145): `drain_in_flight` awaits the response's tool work before sampling returns. The follow-up loop then captures another step at lines 462–500, and calls `run_sampling_request` at line 524. There is no awaited app-server routing request between those points.
- [`session/mod.rs`](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/core/src/session/mod.rs#L3808): `capture_step_context_inner` snapshots `next_step_settings` under the active-turn lock. A later update cannot alter that captured request.
- [`session/step_activation.rs`](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/core/src/session/step_activation.rs#L233): `apply_turn_settings` validates model metadata, live authority and the exact active task before publication. `applied` means publication, not proof that the immediately following request captured it. `TurnContext::with_model` exists, but is not a public routing callback.
- Installed OpenClaw adapter `dist/.setup/run-attempt-BW9kt8Xq.mjs:7904–8021` passes the turn model in `turn/start`. No `turn/settings/update` caller is present in its installed adapter. Native `PostToolUse` is per-tool, not an all-tools-settled boundary; async native-tool completion observations cannot delay capture. The generated server-request union contains no stage/pre-sampling routing callback. `currentTime/read` is for clock service and, in this loop, occurs **after** capture; it is not a model-routing seam.

**M0: NO-GO for the requested supported, autonomous stage integration on these installed builds.** A correct minimal upstream extension would await one opt-in, bounded host request after the whole work batch settles and before follow-up step capture. The adapter would call the existing proposal policy with authoritative stage/manual/eligibility state, await native settings validation/publication, and only then release capture. No new classifier is needed. This cannot be enabled by router configuration or a notification listener. No uncompiled Codex fork or timing workaround is shipped here.

## Installed-binary offline API test

`tests/codex-runtime.integration.test.ts` runs the real installed binary in a temporary home with **no credentials**, a loopback scripted Responses provider, retries disabled and a 20-second subprocess deadline. It reuses `proposeStageRoute`, receives `status=applied` twice, and independently inspects three local HTTP request bodies: `gpt-6-sol → gpt-6-luna → gpt-6-sol`. All three requests belong to one successfully completed turn; original task context and both dynamic-tool receipts reach the final request.

**This is not live model execution.** Both catalog entries deliberately clone identical upstream model metadata. A held dynamic tool supplies synthetic synchronization; that tool is still pending, so this does **not** establish the required response-complete/all-tools-settled stage callback. Real target compatibility, persisted manual state, OpenClaw authorization, actual provider execution, compaction and caches are not verified by this test. No production or TEST runtime/configuration was changed; no live inference was attempted. There is consequently no restoration mutation to perform.

Run explicitly (otherwise this integration test is skipped):

```bash
ISSUE42_CODEX_BIN=/absolute/path/to/installed/codex \
ISSUE42_MODEL_CATALOG=/absolute/path/to/rust-v0.160.0/codex-rs/models-manager/models.json \
npm test -- tests/stage-routing.test.ts tests/codex-runtime.integration.test.ts
```

Keep PR #47 **draft and unmerged**. Genuine mid-turn switching by real models remains **not demonstrated**. There are no real-model latency, charge or cache observations.

Validation: focused policy + installed-binary tests **8/8 passed**; typecheck and build passed. A broad run against an accidentally shared OpenClaw 2026.10.4 dependency had **90 passed / 1 failed** (missing pinned hashed Gateway module). With the correct pinned 2026.9.8 dependency, **89 passed / 2 timed out** at the existing 5-second authorization-test import limit; both authorization tests then passed in a focused rerun with a 60-second ceiling (4.19 seconds for the file). No source changes or skipped authorization checks were used to resolve these local dependency/import issues. No Issue #7/#8 live acceptance tests were repeated.

Offline validation when a suitable Node 24+/npm environment is available:

```bash
npm run typecheck
npm test -- tests/stage-routing.test.ts
```

Project CI runs the existing complete checks on pull requests. No additional live tests or repeated Issue #8 acceptance are needed for this offline policy module.
