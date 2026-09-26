# Release checklist

Use this checklist for public releases.

- [ ] `npm run check` passes on the minimum supported OpenClaw version.
- [ ] CI passes on the default branch.
- [ ] Router Core pin and third-party notices are correct.
- [ ] `openclaw.plugin.json` matches runtime config and activation behavior.
- [ ] `shadow` remains the default unless a deliberate breaking decision changes it.
- [ ] Golden routing fixtures are reviewed for regressions.
- [ ] Manual/persisted session selection protection is tested on the target host.
- [ ] Effective provider/model is independently verified for every supported runtime path: `model_call_started`/`model_call_ended` on embedded calls, and a demonstrated actual-call observation on native Codex. Session/status or `agent_end` alone is insufficient (see [effective-model observability](model-observability.md)).
- [ ] No raw prompt, credential, session key, or provider secret is emitted in routine telemetry.
- [ ] `CHANGELOG.md` contains the release notes.
- [ ] Version in `package.json` and `openclaw.plugin.json` is aligned where applicable.
- [ ] Git tag is signed/annotated where the release workflow supports it.
