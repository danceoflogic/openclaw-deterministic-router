# Research and experiments

This is the project's **durable evidence archive** for performance, correctness, reliability, and runtime investigations. Keep research here instead of scattering test conclusions among chat transcripts, ephemeral logs, and implementation PRs.

## Study index

| Study | Question | State | Evidence |
| --- | --- | --- | --- |
| [Issue #42: Codex turn forensics and reasoning-effort efficiency](studies/issue-42-runtime-forensics/README.md) | Does adaptive effort save resources, and what causes changes in cache reuse? | Investigation planned; one preliminary A/B pair recorded | [Preliminary observations](studies/issue-42-runtime-forensics/2026-10-19-preliminary-results.md) |

Start additional studies by copying [the short study template](templates/study-template.md). Use one directory per question; keep plans, methods, immutable observations, analysis, and conclusions together. Files with dates are snapshots, not silently rewritten history.

## Evidence conventions

- **Measured:** Identify the original instrument (provider usage, native wire observer, clock, tool receipt, etc.), exact runtime/build, task/run identity, and where the raw evidence can be verified.
- **Inferred:** Label likely explanations and confidence. Do not turn correlation into causation.
- **Unknown:** Explicitly record missing measurements, failed or incomplete trials, and limits of the diagnostic interface.
- **Baseline discipline:** Match task, initial state, model, auth route, tools, permissions, and validation criteria; distinguish execution-path differences from configuration effects.
- **Cost discipline:** Separate input/cached/uncached tokens, output (including reasoning tokens), elapsed time, API-equivalent estimates, and actual charges. Do not double-count reasoning. Verify pricing and cache-write metering before costing.
- **Reproducibility:** Link to a source commit, experiment configuration, and sanitized result artifacts. Do not rerun expensive experiments merely to produce a prettier report.
- **Privacy:** Commit only reviewed, sanitized measurements and scripts. Keep raw provider frames, prompts, secrets, session data, and private TEST fixtures out of Git. Store private evidence locally with appropriate access controls; public fingerprints must not leak secrets.
- **Safety:** Investigation notes do not authorize production changes, broad AUTO, weakened native guards, or merges. Record TEST restoration when an experiment mutates TEST.

This area is for research rather than release certification: a passed isolated experiment does not by itself approve a feature for production.
