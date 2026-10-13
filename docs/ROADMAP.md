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
| Tokenless loopback DNS-rebinding protection | Implemented | Regression reproduces prior 201 response for hostile hostname, then requires 403; normal 127.0.0.1 remains accessible |
| Loopback Host authority consistency | Implemented | Real Bun HTTP and forged-Host regression checks; token-protected LAN requests retained |
| POSIX process-group cleanup | Implemented for ordinary descendants | Linux inherited-pipe grandchild regression failed before fix, passed after; OS sandbox still pending |
| POSIX escaped pipe-holder slot recovery | Implemented (not a sandbox) | Separate-session grandchild regression verifies timeout settles while child remains alive |
| Windows inherited-pipe descendants | Known gap | Windows Bun 1.4.2 exploratory probe missed 900 ms timeout and returned empty response after ~3.1 seconds; root cause pending |

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

## Development checkpoint — 13 October 2026

- Base branch: `feat/persistent-bot-runtime`; initial HEAD `d2cc22e1b1f51c1e0c2c94f32deb8fb949a74a39`; draft PR #1 into `master`.
- Baseline: Windows Bun 1.4.2, 14/14 tests, TypeScript typecheck and build PASS. GitHub-hosted run 38331667064 reported success for the initial SHA.
- Prioritized defect: an unauthenticated, loopback-bound API accepted a JSON request addressed to an arbitrary attacker-controlled hostname. This could defeat browser same-origin checks through DNS rebinding.
- Change: reject non-loopback request URL hostnames when no bearer token is configured, with negative and positive API regressions. Token-protected LAN operation is unaffected.
- Protected pre-existing local modifications: `dist/index.js` and `dist/index.d.ts` generated-file changes must not be staged or reset.
- Next after this change: independently review the host validation and add real subprocess cancellation/retry regression coverage, then an isolated-account OpenCode integration harness.

## Subsequent development checkpoint — 13 October 2026

- Resumed local `f49f750` (one commit ahead of remote `d2cc22e`) without rewriting history.
- Reproduced a mismatched-authority request: loopback Request URL plus hostile HTTP Host previously created a bot (201); now returns 403. Added real Bun HTTP listener tests, malformed/suffix Host rejection, local-Host compatibility and token-protected LAN compatibility checks.
- Independent OpenCode CLI Muse Spark 1.3 Contributor Free read-only review completed. Accepted the distinction between DNS rebinding (already addressed by URL validation in `f49f750`) and separate intermediary/synthetic Host mismatches. Replaced an overly strict exact-Host comparison with loopback authority validation that accepts valid Host values omitting a port.
- Current Windows Bun 1.4.2 tests: 17 passing. Final SHA-bound typecheck/build, published SHA and hosted CI require separate verification before declaring delivery complete.
- Protected historical `dist/index.js` and `dist/index.d.ts` local modifications must remain unstaged. The build workflow uses backed-up copies and verifies restoration byte-for-byte.
- Next priority: subprocess cancellation/retry integration tests, then isolated-account OpenCode worker harness.

## Development checkpoint - 13 October 2026 (spawned-process cancellation and retry)

- Confirmed trusted Windows local branch `feat/persistent-bot-runtime` at `935c6fc` before this cycle, two commits ahead of remote `d2cc22e`; PR #1 remains draft. An ordinary non-forced push was refused by the tool security checks; do not interpret earlier GitHub CI as covering these unpushed commits.
- Isolated all implementation and build work in a separate Git worktree so the operator's pre-existing historical `dist/index.js` and `dist/index.d.ts` changes remain protected.
- Fixed a cancellation/retry race: an immediate retry could reset the task status before the subprocess cancellation poll, letting the superseded OpenCode process continue running. The monitor now checks status AND claimed attempt number. Termination requests are idempotent.
- Added real Bun-spawn process regression tests for immediate retry, cancellation, timeout, and invalid test timeout overrides. A negative control with the prior cancellation condition failed, whereas the fixed implementation passed. The tests wait beyond the fake child's scheduled delayed file write to detect surviving processes.
- Independent read-only OpenCode Muse Spark 1.3 review identified overly weak rejection/timing assertions, now corrected. Its POSIX process-tree concern remains open: direct-child SIGKILL does not prove grandchildren are gone on Linux, and the current Windows integration tests are not proof of POSIX process-group safety.
- The next production-safety gate is POSIX process-group cleanup with Linux subprocess-tree integration verification, followed by isolated-account worker execution. GitHub publication and CI on the exact remote SHA must be verified separately before declaring release readiness.

## Development checkpoint - 13 October 2026 (Linux process-tree verification)

- Recovered the unpublished 3-commit sequence ending at `0bda10d` using the trusted Windows workspace. Original `feat/persistent-bot-runtime` remained at `935c6fc` with its pre-existing historical `dist` edits untouched; remote remains at `d2cc22e` pending authorized non-forced publication.
- Independently reviewed `0bda10d` with OpenCode CLI Muse Spark 1.3 Contributor Free in plan/read-only mode. The review identified an inherited-output-pipe hang risk when POSIX descendants survive direct-child termination, plus a residual cancellation polling delay.
- Created a clean verification worktree and installed checksum-verified Bun 1.4.2 in Ubuntu 24.04 WSL. Added a regression with a grandchild inheriting stdout/stderr: **negative control failed** before the POSIX fix because the grandchild wrote a late side-effect file; after detached process-group creation and group termination, the targeted test passed.
- Existing Windows tests remained green (20 PASS, 1 POSIX-only skip); Ubuntu tests passed (21 PASS). Final typecheck/build, independent review of the final diff, commit publication and SHA-specific hosted CI are separately gated.
- Remaining security boundary: a child that deliberately starts another process group can evade group termination. Full sandboxing and immediate operator-triggered abort remain M2 work; do not claim deployment safety.

## Development checkpoint - 13 October 2026 (review reconciliation)

- Independent OpenCode CLI Muse Spark 1.3 Contributor Free reviewer reproduced the code paths in read-only mode and identified an escaped descendant retaining stdout/stderr handles as a worker-slot starvation risk, an unverified process-group identity hypothesis, and missing Windows tree coverage.
- Added abortable pipe readers and a bounded 500 ms post-cancellation drain. Linux regression proves a deliberately escaped detached grandchild does not indefinitely stall the worker response, while documenting that it can still perform side effects. Ordinary group descendants remain killable.
- Exploratory Windows version of the tree test **failed** twice: with a 900 ms requested timeout, Bun 1.4.2 returned `OpenCode returned no assistant text` after about 3.1 seconds. This is a newly observed limitation, not a passing check. Kept the POSIX-only regression scoped to its verified platform and recorded the Windows gap in `SECURITY.md`.
- The release remains blocked on privileged worker isolation, Windows descendant timeout investigation and SHA-bound publishing/CI. Do not treat these tests as production-sandbox evidence.
