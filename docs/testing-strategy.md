# Testing strategy

## Unit tests

Pure deterministic code should cover:

- classifier repeatability
- ambiguity policy
- attachment tier floor
- tier-to-model mapping
- session patch parsing
- manual lock set/clear behavior
- persisted model-selection reconciliation across restart, reset/delete, and session-key reuse

## Golden fixtures

`tests/fixtures/golden-prompts.json` contains stable prompts used to detect accidental classifier drift after dependency upgrades.

A Router Core upgrade must be deliberate. Update the pinned commit, rerun the fixtures and record changed decisions in the pull request.

## OpenClaw integration tests

**Accepted functional TEST target: OpenClaw 2026.10.4** (ordinary-turn and independent existing-/first-turn child controls passed). The committed development dependency and CI loader smoke remain **2026.9.8**; 2026.9.6 is historical. Version-specific evidence is not a blanket compatibility claim. Do not revert the accepted TEST target to 2026.9.8 merely to follow older notes.

The integration scenarios below are repeatable regression/release requirements, **not orders to rerun accepted #7/#8 inference**. Record the installed version for each new compatibility exercise. Standalone offline acceptance-runner tests use `npm run test:acceptance:operator` and are separate from `npm run check`.

Minimum scenarios:

1. shadow mode returns no override;
2. auto mode returns the expected provider/model;
3. explicit `/model` causes the router to yield;
4. clearing the manual selection resumes auto routing;
5. a pre-existing persisted selection remains protected after a fresh plugin registry starts;
6. missing or ambiguous persisted state fails closed and does not retain stale locks;
7. two sessions remain isolated through reset/delete and recreation;
8. a missing session key fails closed when configured;
9. child/subagent behavior is measured independently;
10. the effective model is compared with the router selection.

## Rollback test

Every release candidate must demonstrate that setting `mode: "off"` restores native OpenClaw model resolution without removing the plugin package.
