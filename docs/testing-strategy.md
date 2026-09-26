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

The current integration target is **OpenClaw 2026.9.6**. The runtime tests are intentionally separate from unit tests because hook boundaries are host-version dependent.

Before the scenarios below, record `openclaw --version` and fail the current compatibility run if the target is not `2026.9.6` unless a deliberate compatibility-validation branch is being used.

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
