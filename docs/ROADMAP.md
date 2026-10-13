# OpenCode Bot — development roadmap

Base: [richardanaya/opencode-cron](https://github.com/richardanaya/opencode-cron) (MIT). All new work preserves the original cron plugin and Git history.

## M1 — Persistence, approval, automation

| Capability | Status | Evidence |
|---|---|---|
| Named bots and model choice | Implemented | Unit tests |
| Persistent SQLite queue, safe state transitions | Implemented | Unit tests |
| Manual approvals, cancel and retry | Implemented | Unit tests |
| Explicit bot-to-bot handoffs | Implemented | Unit tests |
| Durable bot memory | Implemented | Unit tests |
| Cron jobs and idempotent minute-slot scheduling | Implemented | Unit tests; live timer pending |
| Bounded OpenCode CLI execution | Implemented | Live Muse 1.3 Windows smoke test returned OCB_E2E_OK on 13 Oct 2026 |
| Authenticated localhost API | Implemented | Unit tests |
| Responsive dashboard | Implemented | Build; manual browser QA pending |
| GitHub hosted CI | Workflow prepared | Must verify pushed SHA |
| Windows CI fallback | Script prepared | GitHub self-hosted runner not registered |

## M2 — Production reliability

1. Expand the successful real OpenCode smoke test into repeatable integration tests with a separate least-privileged OS account and isolated scratch workspace.
2. Independent security review for authentication, cancellations, output parsing, concurrency and browser controls.
3. Supervised Windows service or Task Scheduler with health-checks and recovery.
4. Persistent inbox, agent role/workspace isolation and scoped tool permissions.
5. Model fallback, rate-limit handling and cost tracking with zero-cost defaults.
6. Harden legacy cron owner isolation, history attribution and success-after-injection reporting.

## M3 — Grok Bot / OpenBot-inspired features

1. Explicit multi-agent workflow graph with resumable thread/inbox routing.
2. Auditable browser automation, optional MCP adapters and separate approval policy.
3. Opt-in messaging adapters (Telegram, Discord and Slack) with identity mapping.
4. Credential vault, access controls and noninteractive remote human approvals.
5. Routine recording, searchable history, memory retrieval and document handoff.
6. Secure remote mobile access with real notifications and scoped accounts.

## M4 — Release gates

- Security threat model, dependency audit, accessibility and cross-platform tests.
- Trusted **private** self-hosted CI environment for Windows; never execute untrusted public PR code on a runner containing operator credentials.
- Install/uninstall scripts, backups, recovery tests and optional telemetry.
- SHA-bound independent review and verified final release gate.

## At every authorized improvement run

Inspect branch, HEAD, protected changes and verification contract. Choose the highest-impact confirmed gap. Make one scoped change, test, review (independent OpenCode agent when available), commit, push, verify the remote SHA and update this roadmap. Never force-push or auto-merge. On hosted Actions quota exhaustion, execute the equivalent local checks using the trusted Windows PC, clearly noting whether GitHub self-hosted CI evidence exists.
