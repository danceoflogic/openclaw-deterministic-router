# ADR 0001: Pin Router Core to an immutable commit

- **Status:** accepted
- **Date:** 2026-09-25

## Context

The project needs a local deterministic classifier without spending an inference call to decide which model should answer. BlockRun's Router Core already provides a tested weighted classifier and is MIT licensed.

Routing behavior is infrastructure. Silent upstream changes would make debugging and audit trails substantially harder.

## Decision

Depend on `@blockrun/router-core` at the immutable Git commit:

`5ee7c23c993013a8052588191569db5cf7fb793c`

Call `classifyByRules()` directly rather than Router Core's optional ambiguity fallback. Resolve ambiguity with local deterministic policy.

## Consequences

- builds are reproducible against a reviewed classifier revision;
- upstream upgrades become explicit engineering events;
- attribution remains clear;
- model mapping stays owned by this project rather than inherited from Router Core's provider catalog.
