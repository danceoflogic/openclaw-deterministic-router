# Contributing

Thanks for helping improve the deterministic router.

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
