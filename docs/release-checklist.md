# Release checklist

Use this checklist for public releases.

- [ ] `npm run check` passes on the minimum supported OpenClaw version.
- [ ] CI passes on the default branch.
- [ ] Router Core pin and third-party notices are correct.
- [ ] `openclaw.plugin.json` matches runtime config and activation behavior.
- [ ] `shadow` remains the default unless a deliberate breaking decision changes it.
- [ ] Golden routing fixtures are reviewed for regressions.
- [ ] Manual/persisted session selection protection is tested on the target host.
- [ ] Effective provider/model is independently verified using the strongest supported evidence for each runtime path: `model_call_started`/`model_call_ended` provider-call telemetry on embedded calls, and explicitly labelled `runtime-model` evidence on native Codex. Native runtime-model observations must not be represented as provider-call evidence (see [effective-model observability](model-observability.md)).
- [ ] No raw prompt, credential, session key, or provider secret is emitted in routine telemetry.
- [ ] `CHANGELOG.md` contains the release notes.
- [ ] Version in `package.json` and `openclaw.plugin.json` is aligned where applicable.
- [ ] Git tag is signed/annotated where the release workflow supports it.
