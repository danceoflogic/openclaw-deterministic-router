# Issue #7 — engineering and deployment progress

**Record date:** 13 October 2026. **Disposition:** shadow deployment passed its recorded transaction gate; runtime acceptance is incomplete. Issue #7 remains open.

This is a sanitised summary of retained engineering reports, independent reviews and deployment receipts. It is not a fresh live-state check. Private operational receipts are not committed to this public repository; their reported results are distinguished below from reproducible repository evidence.

## Objective and implementation boundary

[Issue #7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7) requires controlled AUTO validation with manual-selection precedence, exact-session containment and truthful selected-versus-executed model evidence.

The reviewed, locally integrated candidate adds:

- Exact session-key SHA-256 AUTO allowlisting, empty by default. A malformed list is rejected in full; a valid subset is not salvaged.
- Manual-selection and unknown-state protection, with missing session identity failing closed.
- Read-only `deterministic-router.status`, declaring `operator.read` and returning captured registration state, effective mode/safeguards and allowlist count, not raw session keys or their hashes.
- Preservation of the merged PR #31 managed diagnostic-listener disposal and its regressions. Classification and model mappings were not changed by this integration.

**Repository boundary:** these candidate additions were locally integrated and deployed for approved shadow validation; they are not merged into `main` by this documentation update. This record does not publish the candidate implementation or imply that a checkout of main contains it.

## Chronology

| Stage | Recorded result | Qualification |
|---|---|---|
| 12 October baseline reconciliation | Existing shadow runtime differed from merged PR #31 source | Historical baseline, not latest state. |
| Initial PR #31 deployment | Later explicit readback found healthy Gateway and loaded plugin in shadow | The original readiness allowance was not demonstrated. |
| Earlier A/B attempts | Stopped at preflight or before inference; shadow restored | No fresh A/B execution acceptance resulted. |
| 13 October clean integration | Typecheck, 57 tests across 9 files, JavaScript/declaration builds and isolated OpenClaw 2026.9.8 loader smoke reported PASS | Local evidence only; not authenticated network access-control or AUTO acceptance. |
| Independent integration review | No remaining blocking implementation finding; PR #31 fixes preserved | Shared dependency tree was used; fresh independent dependency installation was not validated. |
| First candidate shadow deployment | Readiness timed out; original artifacts restored | Rollback health also timed out, so the transaction did not establish rollback PASS. Later investigation found restored Gateway health and plugin loading. |
| Timeout investigation | Restored service startup exceeded the original readiness window | Does not establish candidate failure or prove it would have become healthy. |
| Revised R2 controls | Ten mocked transaction checks passed; readiness, integrity and rollback handling reviewed | Transaction-control tests, not runtime acceptance. |
| Approved R2 shadow deployment | Transaction reported PASS after one planned restart; no rollback entered | Latest recorded deployed baseline, not a current liveness assertion. |
| Scoped-status acceptance preparation | Preparation result could not be recovered following a worker-continuation relay failure | No restricted-scope live probe ran; no acceptance result can be inferred. |

The R2 transaction verified service health, expected plugin loading, authenticated status success, effective `shadow`, both safeguards true, an empty allowlist, expected candidate artifacts and unchanged authored configuration. It did not change mode, operate sessions or perform inference. Its receipt retains the reviewed gate result, not a separate raw full status response.

## Acceptance ledger

| Gate | Status | Remaining evidence |
|---|---|---|
| Candidate source and independent review | PASS at local review scope | Candidate publication/merge remains separate. |
| Local tests/build/loader | Reported PASS | Not operational acceptance or independent dependency reproducibility. |
| R2 shadow deployment | Reported PASS at transaction scope | Fresh checks when later operations require them. |
| Restricted authenticated status access control | Unverified | Server-attested `operator.read` allow and authenticated empty-scope denial, without an internal-client bypass. |
| Exact-session AUTO containment and A/B selected/effective-model behaviour | Not accepted | Bounded live tests with fresh correlation and manual-precedence evidence. |
| Session lifecycle and fail-closed runtime behaviour | Unresolved | Separately controlled runtime lifecycle evidence. |
| Embedded provider-call execution evidence | Not established | Do not infer it from native turn/run observations. |
| Issue #7 closure | Not ready | Required runtime criteria remain open. |

Native turn/run model observations and embedded provider-call observations are different evidence scopes. A router-selected model alone does not prove which model executed; an opaque native turn does not expose every hidden provider request.

## Blocker and next steps

The immediate blocker is unavailable delivery of an existing scoped-status preparation result. It is a coordination problem, not a demonstrated router defect. Recover that report, then independently review credential reuse, handshake behaviour and server-attested connection scopes before running bounded read-only status allow/deny probes. New pairing, token minting/rotation or persistent permission changes are not assumed to be permissible prerequisites.

After status access-control acceptance, complete the distinct bounded AUTO/A-B and lifecycle gates. Preserve manual choices, keep shadow as the baseline, and stop on ambiguous evidence. This record grants no runtime authority and contains no executable deployment or cleanup procedure.

Independent subagent routing (#8), performance/restart measurements (#9), compatibility/reproducibility policy (#12) and the remaining release checks (#10) remain separate. No general AUTO rollout or release readiness is claimed.

## Publication scope

This documentation update publishes the sanitised project status only. It does not merge candidate code, edit issue acceptance checkboxes, close issues, rerun deployment, restart services, change credentials/configuration/sessions or perform inference. Host routes, account details, process/session identifiers, configuration fingerprints, prompts/responses, credentials and raw logs are intentionally omitted.
