# Stage routing prototype: offline only

**18 October 2026, Issue [#42](https://github.com/danceoflogic/openclaw-deterministic-router/issues/42).** This commit adds a **pure TypeScript stage model proposal** and fake-host tests, **not** an OpenClaw/Codex runtime adapter or production AUTO activation.

## What is implemented

- `src/stage-routing.ts` exports `proposeStageRoute`, a synchronous and deterministic recommendation. Existing `routeWork()` and its 15-dimensional local classifier/policy are reused.
- Requires explicit experimental enablement, authoritative *clear* manual-selection state from a future trusted adapter, a completed model response, settled tool batch and independently confirmed *new stage objective*. A progress message by itself is not a stage boundary.
- Work remains anchored to the original task model/tier. Difficult continuation keeps the **original chosen model**, regardless of model family. A confirmed different straightforward stage can propose another eligible same-provider model. Empty/missing eligibility, unsuitable goal, active tools or unknown model state keep the current model.
- Recommendations never dispatch, patch a session, change a Gateway setting or update a Codex thread. The model returned is **not** observed runtime identity.
- `tests/stage-routing.test.ts` exercises guards and a fake synchronised model sequence `Sol → Luna → Sol`, with simulated settings acknowledgments strictly preceding fake dispatch. These are neither real model requests nor evidence that the installed runtime can perform the transition.

## Host integration finding / blocker

- The current repository plugin uses OpenClaw `before_model_resolve` (agent-turn scope) and has no app-server model-selection control for later samples.
- The operator's Sol High source trace identifies the Codex follow-up `run_sampling_request` seam, but exact installed Worktop binary/version and its adapter sources were **not accessible here**.
- Codex's `settings_update_during_active_turn_applies_to_next_turn_only` regression explicitly tests that ordinary settings updates during an active turn do **not** alter the next request within that turn. An upstream [feature request](https://github.com/openai/codex/issues/43569) discusses changing *service tier* at the next request and notes that model/reasoning may remain turn-scoped. An experimental `turn/settings/update` method cannot be assumed to provide the required synchronous control. See [Codex regression](https://github.com/openai/codex/blob/main/codex-rs/core/tests/suite/model_switching.rs).
- A **supported synchronous pre-follow-up-sampling hook** is still needed: Codex must pause after tools settle, allow a bounded route decision, validate and apply the model setting before the next request snapshot, and acknowledge the change. This likely requires a narrow upstream protocol + OpenClaw adapter extension. This repo deliberately does **not** ship a racy event listener, timer or Codex fork.

## Next development action

After checking installed Codex/OpenClaw compatibility, implement the smallest supported **host-level** handoff, preferably upstream; call `proposeStageRoute` only from a trusted adapter after full manual/session and model-capability reconciliation. Keep the two routing modes independent and avoid any live inference until there is an approved bounded test. Evaluate net task cost and cache reuse based on provider usage, not assumed A/B prefix-cache hits.

Offline validation when a suitable Node 24+/npm environment is available:

```bash
npm run typecheck
npm test -- tests/stage-routing.test.ts
```

Project CI runs the existing complete checks on pull requests. No additional live tests or repeated Issue #8 acceptance are needed for this offline policy module.
