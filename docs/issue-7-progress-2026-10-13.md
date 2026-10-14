# Issue #7 — engineering and deployment progress

**Record date:** 13 October 2026; updated 14 October 2026. **Disposition:** shadow deployment passed its recorded transaction gate; runtime acceptance is incomplete. Issue #7 remains open.

This is a sanitised summary of retained engineering reports, independent reviews and deployment receipts. It is not a fresh live-state check. Private operational receipts are not committed to this public repository; their reported results are distinguished below from reproducible repository evidence.

## Objective and implementation boundary

[Issue #7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7) requires controlled AUTO validation with manual-selection precedence, exact-session containment and truthful selected-versus-executed model evidence.

The reviewed, locally integrated candidate adds:

- Exact session-key SHA-256 AUTO allowlisting, empty by default. A malformed list is rejected in full; a valid subset is not salvaged.
- Manual-selection and unknown-state protection, with missing session identity failing closed.
- Read-only `deterministic-router.status`, declaring `operator.read` and returning captured registration state, effective mode/safeguards and allowlist count, not raw session keys or their hashes.
- Preservation of the merged PR #31 managed diagnostic-listener disposal and its regressions. Classification and model mappings were not changed by this integration.

**Repository boundary:** these candidate additions were locally integrated and deployed for approved shadow validation; they are not merged into `main` by this documentation update. The exact R2 implementation is now published separately for review in [PR #33](https://github.com/danceoflogic/openclaw-deterministic-router/pull/33); it remains unmerged and a checkout of main does not contain it.

## Chronology

| Stage | Recorded result | Qualification |
|---|---|---|
| 11 October historical live verification | Eleven authorised live turns recorded AUTO tier routing, manual selection across restart, default/AUTO resumption, shadow and off behaviour; later bounded work recorded direct COMPLEX classification | Partial native turn/run `runtime-model` evidence on the earlier runtime, not embedded provider-call proof or fresh acceptance of the new allowlisted candidate. See the [partial results](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6110865520) and [subsequent handover](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6114265127). |
| 12 October baseline reconciliation | Existing shadow runtime differed from merged PR #31 source | Historical baseline, not latest state. |
| Initial PR #31 deployment | Later explicit readback found healthy Gateway and loaded plugin in shadow | The original readiness allowance was not demonstrated. |
| 12 October follow-on A/B isolation attempts | Stopped at preflight or before inference; shadow restored | These later attempts did not produce fresh A/B execution acceptance; they do not negate the 11 October partial live results. Neither establishes live acceptance of the subsequently integrated allowlisted candidate. |
| 13 October clean integration | Typecheck, 57 tests across 9 files, JavaScript/declaration builds and isolated OpenClaw 2026.9.8 loader smoke reported PASS | Local evidence only; not authenticated network access-control or AUTO acceptance. |
| Independent integration review | No remaining blocking implementation finding; PR #31 fixes preserved | Shared dependency tree was used; fresh independent dependency installation was not validated. |
| First candidate shadow deployment | Readiness timed out; original artifacts restored | Rollback health also timed out, so the transaction did not establish rollback PASS. Later investigation found restored Gateway health and plugin loading. |
| Timeout investigation | Restored service startup exceeded the original readiness window | Does not establish candidate failure or prove it would have become healthy. |
| Revised R2 controls | Ten mocked transaction checks passed; readiness, integrity and rollback handling reviewed | Transaction-control tests, not runtime acceptance. |
| Approved R2 shadow deployment | Transaction reported PASS after one planned restart; no rollback entered | Latest recorded deployed baseline, not a current liveness assertion. |
| Earlier scoped-status preparation | Worker-continuation delivery failure; initial live attempt inconclusive after timeout | Historical failure retained; no pass inferred from either. |
| 14 October authenticated status scope | Exact server-attested operator.read request allowed; authenticated empty-scope request denied at method level | Live access-control PASS; no inference or AUTO. |
| Test-environment provider setup | Dedicated test environment initially lacked configured model-provider access; operator completed setup and supplied UI auth/allowance evidence | Operator-reported setup failure, not an established router defect. Empty global usage output alone did not prove missing auth. |
| 14 October fixture preparation | Two no-turn fixtures persisted Codex runtime; A user-selected Terra, B agent-default GPT-5.6-Luna; local fixture classified SIMPLE | Configuration/classifier evidence only, not execution-model evidence. |
| 14 October PR #33 review corrections | Two confirmed P2 defects fixed: generation-safe UUID registration identity and explicit profile-independent status retaining operator.read; 58 tests/typecheck/build passed | Supervisor proved regressions fail on old source/pass on fix; corrective commit ca82444 is not deployed. Prior status-scope PASS does not prove no-profile caller support or hot-replacement identity uniqueness. |
| 14 October guarded transaction | Allowlist CAS returned exit 1 after applying both fixture hashes; readback confirmed guarded shadow and matching applied revisions | No AUTO or inference ran. Original stderr unavailable; precise failure cause unknown. No write retry. |

The R2 transaction verified service health, expected plugin loading, authenticated status success, effective `shadow`, both safeguards true, an empty allowlist, expected candidate artifacts and unchanged authored configuration. It did not change mode, operate sessions or perform inference. Its receipt retains the reviewed gate result, not a separate raw full status response.

## Acceptance ledger

| Gate | Status | Remaining evidence |
|---|---|---|
| Candidate source and independent review | PASS at local review scope | Exact implementation published for review in PR #33; merge remains separate. |
| Local tests/build/loader | Reported PASS | Not operational acceptance or independent dependency reproducibility. |
| R2 shadow deployment | Reported PASS at transaction scope | Fresh checks when later operations require them. |
| Restricted authenticated status access control | PASS live, 14 October | Exact server-attested `operator.read` allow and authenticated empty-scope method denial; earlier timeout retained as inconclusive. |
| Exact-session AUTO containment and A/B selected/effective-model behaviour | Not accepted | Bounded live tests with fresh correlation and manual-precedence evidence. |
| Session lifecycle and fail-closed runtime behaviour | Unresolved | Separately controlled runtime lifecycle evidence. |
| Embedded provider-call execution evidence | Not established | Do not infer it from native turn/run observations. |
| Issue #7 closure | Not ready | Required runtime criteria remain open. |

Native turn/run model observations and embedded provider-call observations are different evidence scopes. A router-selected model alone does not prove which model executed; an opaque native turn does not expose every hidden provider request.

## Blocker and next steps

The immediate blocker is the allowlist command's nonzero-after-write outcome. The two fixture hashes were independently verified as applied; authored/effective mode remained shadow, both safeguards were enabled and configuration/applied revisions matched. No AUTO transition was attempted, so no mode restoration was required. No inference ran and no runtime-model correlation can be claimed for these fixtures.

Read-only follow-up found a successful config.write/rename audit record with no error. The later diagnostic failed because CAS expectations cannot be combined with --dry-run; this does not explain the original write exit. Original stderr was discarded, so the original cause remains unknown and no causal link to the status defects is established.

Next engineering action: preserve bounded failure-stage evidence for future authorised execution, investigate the pinned post-write path without live retries, then prepare continuation from the preserved fixtures and existing two-entry allowlist. Do not repeat fixture creation or run the empty-allowlist driver unchanged. Keep separate ordinary-session A/B and lifecycle gates open; stop on ambiguous evidence.

**Source/deployment provenance:** R2 used source commit `462a76e20badd5a7125f3c8352ea455d6d4f9ace`, tree `8e54e32dc45f49eeacd195d1ce29f64aeab499d1`, bundle SHA-256 `e6651554d6d7fc1f397a940dd87d7139a3ed1367d41a5e5abb2397d8704369ff` and schema SHA-256 `436b76a4845a386265e45e83f66d834d3b5a733e50e843ddc4201bdf77bd4701`. These are public source/artifact fingerprints, not configuration or fixture hashes. Main does not yet contain the integrated implementation. PR #33 now also contains reviewed corrective commit `ca82444`, whose bundle differs from R2 and is **not deployed**; the fingerprints above describe R2 only.

Public supporting evidence: [status-scope progress](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6168964564), [transaction outcome](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6170190315), and [tracker summary](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10#issuecomment-6170195906). This publication is a review of saved receipts, not a fresh operational check.

Independent subagent routing (#8), performance/restart measurements (#9), compatibility/reproducibility policy (#12) and the remaining release checks (#10) remain separate. No general AUTO rollout or release readiness is claimed.

## Milestone synchronisation workflow

At significant test outcomes, reviewed code changes, deployments or acceptance-gate changes, the existing supervisor workflow reviews retained evidence and publishes sanitised updates to Issue #7, a short linked Issue #10 summary, and these existing status pages/PRs as needed. Preserve historical scope and distinguish setup failures from router defects. Do not update after every tool call, duplicate status documents, expose private records, merge/close automatically, or let documentation displace engineering work.

## Publication scope

This documentation update publishes the sanitised project status only. It does not merge candidate code, edit issue acceptance checkboxes, close issues, rerun deployment, restart services, change credentials/configuration/sessions or perform inference. Host routes, account details, process/session identifiers, configuration fingerprints, prompts/responses, credentials and raw logs are intentionally omitted.


## Issue #7 recommendation — embedded alternative review (14 October)

**Recommend one maintainer-scoped Codex request-ownership diagnostic. Do not switch to embedded A/B now.** Embedded equivalence is not substantiated, not proven impossible.

Latest execution supersedes the earlier NOT RUN status: A was attempted once and rejected by OpenClaw request-ownership authorization (403); B was withheld. A is a valid root fixture with matching persisted session and Terra binding. The denying live predicate was not logged, so existing evidence cannot identify its branch. Stop searching for missing historical evidence; no A retry or credential change.

Embedded assessment:
- Compatibility: installed 2026.9.8 embedded support for manual Terra and AUTO GPT-6 Luna remains unverified; Codex catalog/auth does not establish embedded adapter compatibility.
- Manual selection: model-selection controls alone do not establish a supported per-session embedded runtime selector and persisted manual-source semantics.
- Isolation: existing A/B are Codex fixtures and must remain intact. An alternative needs independently verified fresh isolated embedded sessions; no session operation was performed.
- Effective-model evidence: reviewed router source supports embedded `model_call_started`/`model_call_ended`, correlated by run/call, stronger than native turn-scoped `runtime-model`. This capability is not a received live event or acceptance pass.
- Costs: embedded auth/billing identity and allowance are unknown. A completed-turn ceiling is not a hard provider-request/token/spend cap; utility calls, retries/fallbacks can exceed turn counts. No inference was executed in this review.

The worker's one pinned read-only Worktop attempt failed at DNS before remote execution. Installed-runtime feasibility therefore remains UNKNOWN; no alternate route or operational change was made.

Ask the maintainer for temporary instrumentation at the Codex ownership decision: stable denial-reason enum and booleans for owner-match and root/session-binding predicates, correlated through an opaque attempt ID. No prompts, responses, credentials, raw session identifiers or tokens. Review the patch first; any future single isolated reproduction requires separate explicit approval. Do not retry A. This establishes the denying authorization branch, **not router A/B acceptance**.

Recorded final shadow restoration and preserved fixtures remain authoritative retained evidence, not a fresh live attestation. All outstanding A/B/lifecycle checkboxes remain open; no rollout, merge or issue closure. Supervisor reviewed the saved worker report, telemetry source/docs and execution receipt. Requested worker Luna/medium was not independently attested; supervisor runtime mismatch was reported, settings unchanged.
