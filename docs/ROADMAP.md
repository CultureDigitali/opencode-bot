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

## Development checkpoint - 13 October 2026 (four-commit publication and CI)

- Published the existing linear, non-rebased changes `f49f750`, `935c6fc`, `0bda10d` and `d990674` to the authorized `feat/persistent-bot-runtime` branch with a non-forced fast-forward from `d2cc22e`. Both `git ls-remote` and GitHub PR #1 confirmed remote SHA `d990674c5b0f002f388bdf245fc5b4da096ddc64`. No merge, release or deployment.
- GitHub-hosted CI on that **exact** SHA completed successfully: runs [38376709790](https://github.com/CultureDigitali/opencode-bot/actions/runs/38376709790) and [38376703833](https://github.com/CultureDigitali/opencode-bot/actions/runs/38376703833). The first run reported the `Bun test, types, build` job as successful. No GitHub self-hosted runner was registered.
- In a fresh Windows worktree, `bun install --frozen-lockfile` succeeded, the first `bun test` revealed **19 pass, 2 POSIX-only skips, 1 fail**: a timeout test observed a late subprocess side effect. A repeat of the same unmodified suite yielded **20 pass, 2 skips**. Typecheck and build passed on the published source. The intermittent failure is real evidence of a Windows reliability gap, **not** a cleared release gate.
- Independent read-only OpenCode CLI Muse Spark 1.3 Contributor Free review identified nonblocking termination acknowledgement and Windows tree-kill timing hazards. An isolated follow-up experiment replaced synchronous `taskkill` with a bounded asynchronous attempt and added a Windows child-tree regression. The experiment **did not pass**: the tree test still returned `OpenCode returned no assistant text` instead of timing out. Experimental source and test changes remain uncommitted in `dev/ocb-win-timeout-run8`; they have **not** been pushed or presented as a fix.
- Next priority: root-cause the Windows/Bun timer and inherited-pipe behavior, prove direct-child and descendant termination on Windows without weakening tests, then test a worker under a separate least-privileged OS account with an isolated scratch workspace. Preserve the operator's pre-existing tracked `dist` edits in the original worktree.

## Development checkpoint - 13 October 2026 (Windows overdue-result classification)

- Continued from the published, CI-green `82872a8` SHA in isolated branch `dev/ocb-deadline-guard-run9`; original `feat/persistent-bot-runtime` and its historical `dist` edits remain protected. The separate, unsuccessful asynchronous-tree-kill experiment in `dev/ocb-win-timeout-run8` remains uncommitted and was not reused as a fix.
- Reproduced a Windows Bun 1.4.2 inherited-pipe case where a requested 900 ms subprocess deadline is missed and the old executor reports `OpenCode returned no assistant text` after roughly 3.1 seconds. A Windows-only exploratory regression failed before the monotonic completion guard and passed after it. It proved classification, not child-tree termination; running it as part of the full suite caused additional intermittent five-second test-runner stalls, so it was **not** adopted as a reliable required CI test.
- This change prevents an overdue completion from being treated as an ordinary result, but **does not terminate escaped descendants or guarantee a 900 ms response**. The previously observed Windows subprocess-tree reliability gap and least-privilege isolation requirement remain open; do not promote this narrow mitigation as a complete timeout fix.
- Replaced that exploratory platform probe with a deterministic cross-platform spawned-process regression that injects a monotonic clock to simulate late completion without waiting for Bun's affected Windows event loop. The accepted test verifies **deadline classification only** and does not claim Windows descendant cleanup. Verification contract remains `bun test`, `bun run typecheck`, `bun run build`, with no pre-existing checks disabled. Final remote SHA and CI must be verified on the published commit.
- An initial independent OpenCode CLI Muse Spark 1.3 Contributor Free review found no high-severity defects in the classification guard and correctly called out the limited scope of its Windows probe. Windows complete-suite runs with the exploratory probe were **not consistently green**: one passed 21 tests with 2 POSIX skips, while two others had 20 passing, 2 skips and 1 failure (cancellation latency or late side effects). The full suite also later encountered three failures including the new probe's five-second deadline. This is a **known unresolved Windows reliability gate**, not an accepted PASS for production; the reproducible OS-level problem remains documented, not silently declared fixed.
- Next priority: investigate a Windows OS-level process-tree containment and deadline mechanism (for example a supervised Job Object), verify absence of late side effects, and perform a least-privileged isolated-account smoke test before production claims.


## Development checkpoint - 13 October 2026 (retry-attempt fencing)

- Reproduced a state-corruption race with negative-control Bun tests: an obsolete executor resolving after cancel/retry/reclaim overwrote the new running attempt with either a stale success or a stale failure.
- The runtime now tracks the claimed attempt number for success, failure and daemon shutdown; store writes use an atomic SQLite attempt predicate. The optional attempt parameter preserves the previous store method signature for older callers.
- Five targeted regressions pass on Windows Bun 1.4.2, including direct stale-attempt DB writes, shutdown/retry overlap and a mutated executor argument. Typecheck and build pass.
- The full Windows suite remains under investigation: candidate runs reported 23 pass / 2 skips / 2 failures, then 24 pass / 2 skips / 1 failure in existing inherited-pipe tests. An unchanged baseline at e55ac56 independently reproduced the immediate-retry timeout failure. This is a confirmed pre-existing Windows issue, not a green gate.
- No Windows Job Object helper is included. Hard OS-enforced timeout for all Windows descendants and a dedicated low-privilege OS account remain open. The published SHA and Linux CI for this correction must be checked separately.

## Development checkpoint - 13 October 2026 (Windows Job Object candidate)

- Source base: `5d93ec2b4b447cd7f67090a4fface32f508507c0`, PR #1 draft. Isolated worktree `dev/ocb-win-job-run10-20261013`; unrelated historical `dist` edits remain unstaged.
- Added a Windows-native process supervisor: suspended creation, kill-on-close Job Object assignment before resuming the child, bounded native wait, explicit opt-in and fail-closed runner-path validation. Build uses PowerShell `Add-Type` with a source-hash-keyed output filename; no new runtime dependencies.
- Negative-effect smoke test confirmed parent and grandchild termination on a 900 ms timeout with no delayed file write. The Windows integration test requires timeout rejection and absence of late side effects. Two exploratory Windows full-suite executions before enabling the helper exposed the existing cancellation flakiness; no old tests were removed or weakened.
- A complete trusted Windows local CI run with the helper configured passed **27 tests, 2 POSIX-only skips, 0 failures**, plus typecheck and build. This is local evidence against uncommitted candidate code, not hosted CI on a new SHA.
- Remaining gates: independent read-only review, final verification, push and SHA-specific GitHub Linux CI, then separate least-privileged Windows OS account and scratch workspace validation. No merge or deployment authorized.
- Verification integrity: the POSIX-only tree test retains its original `timed out` assertion; the Windows-specific regression requires the Job Object timeout marker, not a generic delayed Bun timeout. A fresh Windows `bun test` compiles its source-hash-keyed helper on demand rather than relying on an ignored prebuilt executable.
