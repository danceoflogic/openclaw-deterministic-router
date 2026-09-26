# Issue #2 blockers

## 2026-09-26 — local validation dependencies unavailable

Commands and results:

- `npm run check` fails immediately with `sh: 1: tsc: not found`.
- A bounded `npm install --no-audit --no-fund --prefer-offline` attempt fails with `npm ERR! ETARGET No matching version found for openclaw@2026.9.6`.
- The partial `node_modules` tree contains incomplete TypeScript/Vitest packages and an empty `@blockrun/router-core` directory. Direct attempts fail because TypeScript's `lib/tsc.js` and a Vitest chunk are missing.
- `openclaw --version` confirms the installed host runtime is `OpenClaw 2026.9.6 (eb377ac)`.
- The documented runtime-loader smoke command was attempted with that host runtime; it reports the package extension entry is missing because `dist/index.js` has not been built, and exits non-zero.

Smallest unresolved question: restore the project dependencies/build artifacts from a source that provides the pinned GitHub dependency and the project-compatible OpenClaw 2026.9.6 package, then rerun `npm run check` and the loader smoke test.
