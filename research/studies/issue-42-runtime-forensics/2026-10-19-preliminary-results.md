# Preliminary observations: fixed High versus adaptive High/Low

**Date:** 19 October 2026  
**Status:** Preliminary, *not* a complete benchmark or proven root-cause report.  
**Model:** `gpt-6.1-sol` exclusively for both executions.  
**Provenance:** User-provided read-only shell extraction from the private `router-test` benchmark directory plus the accompanying Sol High transcript's task-status/timing report. These private artifacts are **not committed**. The shell extractor labelled the first two native turns **UNMATCHED** and found **zero completed-run metadata files**; labels below are matched by the observed effort sequences and surrounding transcript, not by authoritative run ID in that extract.

## First reported pair

| Metric | Fixed High (observed run 1) | Adaptive High/Low (observed run 2) | Adaptive change |
| --- | ---: | ---: | ---: |
| Inference requests with completed provider usage | 7 | 8 | +1 |
| Total input tokens | 177,618 | 205,751 | +15.8% |
| Cached input tokens | 146,176 | 121,856 | -16.6% |
| **Uncached input tokens** | **31,442** | **83,895** | **+166.8%** |
| Cache-hit share of reported input | 82.3% | 59.2% | -23.1 percentage points |
| Output tokens (includes reasoning) | 7,653 | 7,015 | -8.3% |
| Reasoning tokens (subset of output) | 1,603 | 1,653 | +3.1% |
| Task time, per accompanying transcript | 181.2 s | 150.1 s | -17.2% |
| Task correctness, per accompanying transcript | Reported passed | Reported passed | No reported difference |

No applicable charge or cache-write total was established. Do not treat API-equivalent costs as actual subscription charges.

### Actual provider usage by request

| Request | Fixed effort | Fixed input | Fixed cached | Adaptive effort | Adaptive input | Adaptive cached |
| ---: | --- | ---: | ---: | --- | ---: | ---: |
| 1 | high | 22,293 | 0 | high | 22,293 | 0 |
| 2 | high | 22,592 | 22,144 | high | 22,591 | **0** |
| 3 | high | 23,317 | 22,400 | high | 23,386 | 22,400 |
| 4 | high | 24,421 | 23,168 | low | 24,684 | **0** |
| 5 | high | 25,829 | 24,192 | high | 25,846 | 23,168 |
| 6 | high | 28,876 | 25,600 | high | 28,562 | 25,728 |
| 7 | high | 30,290 | 28,672 | high | 28,736 | 22,144 |
| 8 | — | — | — | high | 29,653 | 28,416 |

The adaptive run used **Low in only one of eight requests**. Its reasoning-token total nevertheless exceeded Fixed High by 50 tokens. This is not proof Low caused more reasoning; request counts and execution paths differed.

### Questions raised

1. **Adaptive request 2:** 0 cache tokens **while effort was still High**. This predates switching and cannot be explained solely by the High→Low transition.
2. **Adaptive request 4:** 0 cache tokens on the sole Low request. Changing top-level effort could alter request-prefix identity; this is a **testable hypothesis**, not an observed root cause.
3. **Extra adaptive request:** Was it genuine additional reasoning/tool work, a different decision trajectory, a context reconstruction side effect, or a retry? Resolve against correlated native events.
4. **Subsequent High requests:** Reuse resumed, but not at the same cached-token count or sequence as Fixed High.
5. **Telemetry gaps:** The extractor reported a third native turn with no completed provider request; the Sol High transcript also reported a test-data generator issue and an unmatched `tool.call` / `tool.result` error during continuation. Their provenance and effects remain unresolved.

The two zero-hit requests correspond to a large portion of the observed excess uncached input, but comparing equal request **indices** is not proof of equal task stages. Determine the first actual request-prefix divergence before allocating causal blame.

## Evidence hierarchy and next action

- **Provider-measured:** Individual request efforts and usage above, subject to authoritative run-association reconciliation.
- **Separately reported:** Task durations and passing correctness checks in the Sol High transcript.
- **Not established:** Root cause of any miss, actual charges, reliable cache-write amount, reason for the eighth request, or repeatability of the speed difference.
- **Next action:** Follow the [comprehensive forensics plan](README.md): correlate all existing native evidence, instrument and trace the full pipeline, then run a focused matched comparison. **Do not optimise or merge based on this preliminary pair.**
