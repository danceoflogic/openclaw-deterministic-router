# External operator TEST A/B runner (OpenClaw 2026.10.4)

This is the existing PR #38 external Ed25519 operator client, extended for deterministic evidence collection. It targets **only** `ws://127.0.0.1:19879` with profile `router-test`. It does not use agent-exec for operator RPCs, change production, or perform any inference except the two explicitly approved test prompts. The previous six-turn allowance is exhausted; a **new two-turn approval** is required for `run`.

## Private one-time setup

1. Install dependencies in this checkout. Ensure the isolated TEST Gateway is running and the candidate router is loaded. Keep the TEST journal readable by the operator's local account; the runner uses `journalctl --user -u openclaw-gateway-router-test.service` for existing router audits, without adding receipt infrastructure.
2. Create a private 0600 JSON settings file outside the repository:

   ```json
   {"gatewayUrl":"ws://127.0.0.1:19879","profile":"router-test","agentId":"main","ownerProfileId":"gateway-owner","maxTurns":2,"prompt":"Reply with one word: ready","deviceFile":"/PRIVATE/PATH/router-acceptance-device.json","reportFile":"/PRIVATE/PATH/router-acceptance-report.json"}
   ```

   The operator API discovers full TEST session keys via `sessions.list` and verifies both with `sessions.describe`. It filters for two human-profile-owned operator dashboard sessions matching `ownerProfileId`, excluding the `agent:main:main` root and rows without a profile actor. Both must be distinct, idle, and without an override. If discovery is ambiguous, put private `sessionA` and `sessionB` keys in this file; never paste them into chat or a PR. No synthetic records or bootstrap turns are created.
3. `npm run acceptance:operator -- validate /PRIVATE/PATH/settings.json` checks the file offline. `npm run acceptance:operator -- init-device /PRIVATE/PATH/settings.json` creates a private Ed25519 device identity. If an approved device already exists, use its file instead. Pair it once as an operator with `operator.read`, `operator.write`, and `operator.admin` on **TEST**: supply the TEST bootstrap token as `OPENCLAW_GATEWAY_TOKEN` only in the human-launched process environment, start a read-only `dry-run`, then inspect and approve its exact pending request with `openclaw --profile router-test devices list` and `openclaw --profile router-test devices approve <REQUEST_ID>`. Repeat `dry-run` after approval if the first connection timed out. The client stores the approved token beside the identity as a 0600 file and reuses it. Pairing is not an acceptance turn. Never use the unqualified production CLI for these steps.
4. `npm run acceptance:operator -- dry-run /PRIVATE/PATH/settings.json` connects read-only to TEST and checks guarded shadow, router SIMPLE target, explicit agent default, and eligible sessions. It performs zero config/session mutations and zero inference. A `READY` result is preparation, not functional acceptance.

## One-command bounded live run

After the owner approves a fresh two-turn window, launch the independently authorised operator process:

```sh
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=2 npm run acceptance:operator -- run /PRIVATE/PATH/settings.json
```

The runner captures original TEST router and agent settings in a private recovery file before any mutation. A begins with the **agent-specific default Luna** and a persisted user Sol selection; its AUTO decision must show `manualLock=true`, `applied=false`. Only if A passes does B run. B begins with the **agent-specific default Sol** and no user override; its SIMPLE AUTO decision must select Luna with `manualLock=false`, `applied=true`. An ignored default change blocks B, so a Luna-to-Luna result cannot pass.

Each turn gets one `chat.send`, no automatic inference retry. The runner correlates the exact run ID and first 16 characters of the session-key SHA-256 with the existing TEST journal audit, checks the decision and terminal chat event, and records OpenClaw's reported resolved model when available. Per-case results are `PASS`, `FAIL`, or `INCONCLUSIVE`; a completed turn alone is not PASS. The private JSON report includes run IDs, hashes, tier, selected model, lock/application states, completion, timestamps, and restoration. Provider-side model identity remains **deferred** to the owner's turn-level OpenAI accounting; router `applied=true` does not establish it.

If A completed with `PASS` but the first command withheld B after spending only one approved turn (for example, a terminal event briefly precedes the idle projection), do **not** repeat A. After confirming restoration and a new read-only `dry-run` result of `READY`, the same approved two-turn window may use the remaining turn through `resume-b`. This action requires the saved 0600 one-turn A report with matching session-key hash and verified restoration, arms only B, sends at most one B turn, and writes a combined report to `<reportFile>.resume.json`:

```sh
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=2 npm run acceptance:operator -- resume-b /PRIVATE/PATH/settings.json
```

In `finally`, the runner independently restores the original router mode/allowlist, original agent default, and its temporary A selection, then verifies configuration. A hard kill or a failed restoration leaves `<deviceFile>.restore.json` for recovery. Before any further test turn, run:

```sh
npm run acceptance:operator -- restore /PRIVATE/PATH/settings.json
```

`restore` uses the same authenticated TEST operator process, performs no inference, refuses to clear a changed A user selection or changed session generation, and verifies the saved config. If it fails, inspect TEST manually; never assume restoration from a failed command. After a verified normal run, the temporary recovery file is removed. No service restart, general AUTO rollout, merge, or Issue #8 acceptance is implied.

## Next bounded Issue #7 controls window

The completed A/B result is not rerun. Copy the private settings to a separate 0600 controls settings file and set `maxTurns` to **3**; leave the TEST URL, profile, owner, device, and fixed prompt unchanged. The same paired operator identity is reused. `dry-run-controls` is read-only, validates the guarded `shadow` baseline, exact human-owned idle sessions, Sol/Luna target, and clear selections, and spends zero turns:

```sh
npm run acceptance:operator -- dry-run-controls /PRIVATE/PATH/controls-settings.json
```

After a **separate explicit approval for up to three TEST inference turns**, use the operator-opened terminal:

```sh
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=3 npm run acceptance:operator -- run-controls /PRIVATE/PATH/controls-settings.json
```

The sequence uses A for all three short turns, keeps B clear and untouched as an isolation check, and stops on any non-PASS result. It first persists then clears a temporary user Sol choice on A, verifies the clear state, and requires AUTO to select/apply Luna from the Sol agent default. In `shadow`, it requires a correlated SIMPLE/Luna candidate with `applied=false` and Sol resolution. In `off`, it requires a completed Sol-default turn with no router decision for that run ID. It waits for the previous turn to become idle before another send; it does not retry inference. The report is `<reportFile>.controls.json`, with per-case run/hash/evidence and restoration. Finally-based cleanup restores the original router mode and exact allowlist, agent default, and A selection; the same private recovery file and `restore` command apply if interrupted.

This window does **not** test reset/delete/recreation or unknown-state fail-closed behaviour, and does not prove provider-level model identity. Those remain separate acceptance items with their own budget and supported lifecycle procedure.

**Observed 17 October 2026:** the separately approved three-turn TEST controls window completed `PASS` (clear/AUTO, shadow, OFF), with all three turns correlated to completed run IDs, `restoration=PASS`, and a post-run read-only `READY` check. The entire 3/3 budget was consumed. The sanitized evidence summary is in `PROGRESS.md`; the full report remains private at the configured `<reportFile>.controls.json`. Do not rerun this sequence without a new budget.

## Pending lifecycle / unknown-state gate

The five prior successful TEST turns are established evidence and are **not** repeated. OpenClaw 2026.10.4 supports `sessions.create`, `sessions.reset`, and `sessions.delete`. Reset and delete reject a locked user model selection. Therefore the lifecycle runner persists then explicitly clears A's Sol choice before resetting it; reset must change its lifecycle identity while retaining a clear selection. It deletes and recreates A with the same key, requiring a new identity/generation and a clear selection. An independent B keeps a user Sol selection through A's lifecycle and is checked by a final router turn. Each decisive turn is correlated by run ID and session hash to the TEST journal and OpenClaw completion. The router's process-local stale-lock and missing/malformed authoritative-state behaviours are regression-tested offline; the runner does **not** corrupt the live session store or claim a live unknown-state pass.

Copy the private controls settings to `/home/stduser/.openclaw-router-test/operator-acceptance-settings-lifecycle.json`, set `"lifecycle":true` and `"maxTurns":3`, and remove `sessionA`/`sessionB`. This private 0600 file is already prepared on the TEST operator device. The same paired device and fixed short prompt are reused. The live action generates **two new disposable TEST dashboard keys** through `sessions.create` with no initial message, verifies both are idle, operator-created and human-profile-attributed, then operates only on them. It never resets or deletes the previous acceptance sessions; no manual key copying or Control UI session creation is needed. If attribution is not returned as expected, it stops before reset, deletion or inference and retains the recovery record for inspection.

Read-only preflight in the operator-opened terminal:

```sh
cd /home/stduser/src/openclaw-deterministic-router-pr38 && npm run acceptance:operator -- dry-run-lifecycle /home/stduser/.openclaw-router-test/operator-acceptance-settings-lifecycle.json
```

This makes zero inference or Gateway mutations. It checks the exact TEST target/profile, authenticated operator connection, guarded published SHADOW status, both protections, SIMPLE→Luna, Sol/Luna catalogue availability, supported lifecycle methods, explicit agent default, and absence of a recovery file. Because the disposable sessions do not yet exist, their eventual human attribution cannot be attested read-only; the preflight reports `INCONCLUSIVE` with that precise remaining condition, not a false READY.

**Approved live budget: at most three completed turns, with no retries.** Turn 1 on reset A proves AUTO resumes only after a clear authoritative selection in the new lifecycle generation. Turn 2 on deleted/recreated A proves its reused key does not inherit an old lock and AUTO applies from a clear new identity. Turn 3 on independent B proves its manual Sol lock remains isolated and protects against AUTO while A changes. The earlier manual-selection A/B and controls turns are not repeated. Readbacks prove the reset, delete/recreate identity changes and B selection continuity without extra inference. A failed/inconclusive case stops later sends. The owner approved this separate window on 17 October 2026; its first attempt spent zero turns and exposed the authentication blocker below.

Once a profile-authenticated operator path is available for both creation and same-key recreation, the bounded command is:

```sh
cd /home/stduser/src/openclaw-deterministic-router-pr38 && ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=3 npm run acceptance:operator -- run-lifecycle /home/stduser/.openclaw-router-test/operator-acceptance-settings-lifecycle.json
```

The report is private `<reportFile>.lifecycle.json`. The runner restores and verifies the exact router mode/allowlist, original agent default and temporary B selection even after an ordinary failure. It leaves the newly created disposable sessions in TEST as inspectable evidence; it does not delete them as incidental cleanup. A hard interruption, failed restoration, or unconfirmed creation that may have persisted leaves the existing private `<deviceFile>.restore.json` recovery file. Use the existing `restore` action with the lifecycle settings; it validates attribution/generation before clearing temporary Sol choices, restores TEST config, and never deletes a changed session. An unconfirmed but present session requires operator inspection before recovery can clear the record. Do not run another live window while recovery is pending.

**Observed approved attempt, 17 October 2026:** The command stopped after creating A with **zero inference turns**. This paired operator CLI has no authenticated human profile, so A had no human `createdActor`; the public `sessions.describe` row also omitted `lifecycleRevision`. The runner refused to proceed and retained recovery. The canonical TEST row was inspected read-only, B was absent, and the exact generated A was then deleted by session ID. Router configuration and agent default matched the saved baseline before and after cleanup; recovery was cleared. The three-turn budget is unspent, but do not repeat the command with this identity: creation provenance is write-once and `sessions.assignOwner` cannot change it. Both initial creation and same-key recreation need a supported profile-authenticated caller. The live lifecycle gate remains open.

**Evidence boundary:** Live unknown-state corruption is intentionally not attempted. The offline fault tests establish that a missing session entry, missing identity/agent, partial override, or invalid source clears stale cache state and yields. Actual provider identity remains deferred to owner accounting. Issue #7 remains open until the lifecycle live gate genuinely passes; this runner does not authorize general AUTO, PR merge, production changes, or Issue #8.
