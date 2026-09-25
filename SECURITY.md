# Security policy

## Reporting a vulnerability

Please open a GitHub security advisory rather than a public issue for vulnerabilities that could expose credentials, conversation content, session identifiers, or unauthorized model/provider access.

## Security model

This is a native OpenClaw plugin and therefore executes inside the Gateway process. Treat installation as code execution.

The project aims to:

- store no provider credentials;
- make no routing-time network request;
- avoid logging raw prompts;
- hash session keys in ordinary audit records;
- fail closed when required session identity is unavailable;
- default to shadow mode rather than model override.

## Secrets

Never commit OpenAI, Telnyx, OpenClaw Gateway or other provider credentials. Use OpenClaw's existing credential/auth mechanisms.
