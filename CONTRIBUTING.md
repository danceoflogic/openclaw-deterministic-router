# Contributing

Thanks for your interest in the deterministic router.

This project's original code is proprietary and all rights are reserved. Please discuss any proposed code contribution with the maintainer **before** submitting it. A contribution will only be accepted where the necessary copyright and licensing permissions have been agreed. See [LICENSE](LICENSE).

## Principles

1. Routing decisions should remain locally reproducible.
2. Classification should not require an LLM call.
3. Explicit user model selection must take precedence.
4. New behavior needs tests and a clear rollback path.
5. Avoid logging raw conversation content.

## Development

```bash
npm install
npm run check
```

For behavior that depends on OpenClaw runtime hooks, include the tested OpenClaw version and relevant hook observations in the pull request.

## Router Core upgrades

Do not replace the pinned Router Core commit as a drive-by dependency update. A Router Core upgrade should include:

- old and new commit SHAs;
- golden-fixture comparison;
- explanation of changed classifications;
- updated third-party provenance if necessary.
