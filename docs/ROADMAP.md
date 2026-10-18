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

## Development checkpoint - 13 October 2026 (Windows supervisor review and detached descendant regression)

- Base candidate `82b99713139a17eae29b4af3e578523f6640fe67` was inspected by an independent read-only OpenCode CLI Muse Spark 1.3 Contributor Free review. It found no blocking defects, but identified a redundant POSIX negative-PID termination attempt on Windows, an untested externally terminated suspended-child window, and a missing Windows detached-grandchild regression.
- Removed the erroneous POSIX group-kill attempt on Windows. Added a standalone Windows detached-grandchild regression to ensure the Job Object prevents delayed side effects, and factored the on-demand runner build into a reusable test helper that does not depend on test order.
- Trusted Windows Bun 1.4.2 verification after these edits: **28 PASS, 2 POSIX-only SKIP, 0 FAIL**, with TypeScript typecheck and build passing. The targeted process integration suite also passed **6 tests, 2 POSIX-only skips**.
- Parent/child process termination is not equivalent to OS-account sandboxing; the intentional detached-descendant test covers a Windows process created with `detached: true`, not every conceivable handle-inheritance or breakaway scenario. Privilege-separated account testing is still required.
- The remote development branch is still at `5d93ec2b4b447cd7f67090a4fface32f508507c0`, with GitHub Linux CI green there only. Publishing the local native-helper candidate and its review follow-up, then verifying Linux CI on the new remote SHA, remains the highest open gate. Historical `dist` modifications remain protected and excluded.

## Development checkpoint - 13 October 2026 (Windows supervisor published)

- Published commits `82b9971` and `344c308` with a non-forced push to `feat/persistent-bot-runtime`. Remote SHA verified: `344c30802e79153bce8a385e86022928b2d1508d`.
- GitHub-hosted Linux CI succeeded twice on this SHA: runs `38412910130` and `38412903036`. This is not evidence of Windows-specific Job Object execution.
- Windows Bun 1.4.2 candidate verification: frozen-lockfile install, 28 PASS, 2 POSIX-only SKIP, 0 FAIL; typecheck and build PASS. A direct wrapper call to `scripts/local-ci.ps1` was blocked by the execution tool in this cycle; it was not independently run here.
- Independent read-only OpenCode CLI Muse Spark 1.3 Contributor Free review of both commits: conditional PASS; no confirmed high-severity findings. Medium risks require follow-up: cached native EXE integrity, suspended child before assignment if supervisor is killed, broad inheritable handles, and no hosted Windows CI coverage.
- Pre-existing `dist/index.js` and `dist/index.d.ts` edits remain protected. Windows Job Objects are not an OS sandbox. Next: address medium findings and validate a dedicated least-privileged account with scratch workspace before any merge, release, or deployment.

## Development checkpoint - 13 October 2026 (Windows runner cache integrity)

- Resumed draft PR #1 from remote SHA `55de26339d731c7cb7a9c11147c78f5ef92f2e2d`; GitHub-hosted Linux CI was green on that SHA, but Windows Job Objects were validated only locally. A clean task worktree protects unrelated `dist` changes.
- Confirmed that `scripts/windows/build-runner.ps1` previously reused an existing `.exe` based solely on a source-hash filename. Replaced that trust assumption with a fresh, unpredictable output executable for every build. A Windows regression asserts two consecutive builds never share the same executable path.
- Baseline Windows Bun 1.4.2 checks before this change: 28 pass, 2 POSIX-only skips, 0 fail; typecheck and build pass. Targeted candidate process tests: 7 pass, 2 POSIX-only skips, 0 fail; typecheck pass. Publication, full final checks and remote SHA-specific CI are separate gates.
- This eliminates reuse of stale or replaced cached binaries, **not** same-account tampering after build. A signed or ACL-restricted runner and a least-privileged isolated OS account remain future security gates. Also verify behavior when the native supervisor is externally killed before suspended-child assignment.

### Review gate for the cache-integrity candidate — BLOCKED

- The independent read-only Muse Spark 1.3 review rejected publication of the initial fresh-executable approach. It confirmed that the runtime still accepts a configured absolute runner path without a cryptographic digest, that build-to-execution replacement remains possible, and that randomly named executables in `dist/` accumulated without cleanup.
- The current *uncommitted* candidate moves fresh builds into individually named temporary directories to avoid accumulating ignored binaries in the repository; the targeted Windows integration tests passed (7 pass, 2 POSIX-only skips), as did typecheck. Temporary directory cleanup and executable SHA-256 binding at runtime are not implemented yet.
- The next implementation gate is producer/consumer SHA-256 binding, a negative test of a substituted runner, bounded temporary-directory cleanup, and a fresh independent review before any commit or push. Previous green Linux CI covers only the unchanged remote SHA `55de26339d731c7cb7a9c11147c78f5ef92f2e2d`.

## Development checkpoint - 13 October 2026 (SHA-bound Windows supervisor candidate)

- Continued the existing uncommitted `dev/ocb-run12-runner-build` candidate without resetting tracked `dist` changes. Remote `feat/persistent-bot-runtime` still pointed to `55de26339d731c7cb7a9c11147c78f5ef92f2e2d` at intake; PR #1 remained draft and both hosted Linux CI runs for that SHA were green.
- The independent Muse Spark 1.3 read-only review confirmed missing binary binding and temporary directory leaks. The revised candidate requires a full SHA-256 pin before each native helper launch and refuses modified executables before any child is started.
- Builds now target unique OS temporary directories. Test-generated helpers are removed after the suite; the Windows local CI wrapper restores inherited environment settings and removes only its validated per-run temporary build directory, including on verification failure. Compilation failure also cleans its fresh temporary directory.
- Windows Bun 1.4.2 local CI equivalent `scripts/local-ci.ps1` completed: **30 passed, 2 POSIX-only skipped, 0 failed**; `bun install --frozen-lockfile`, `bun run typecheck` and `bun run build` passed. A separate targeted run passed 8 tests with 2 POSIX skips. These are local candidate checks, **not** GitHub CI on a new commit.
- Remaining gates: independent adversarial re-review of the **revised diff**, non-forced publication and SHA-specific GitHub Linux CI. SHA pinning does not prevent a same-account attacker swapping the binary after verification (TOCTOU); a separate least-privileged Windows account and workspace remain mandatory before release. No merge, release or deployment is authorized.

### SHA-bound supervisor review reconciliation

- Independent read-only Muse Spark 1.3 reviewer reported conditional PASS for the first SHA-pin and cleanup revision. Its two medium follow-ups were unpaired option/environment digests and unbounded synchronous reading of an operator-configured file. Fixed both with same-source path/digest pairing and a regular-file/32 MiB bound, then added negative Windows regressions for both conditions.
- Final candidate trusted Windows local CI wrapper: **31 passed, 2 POSIX-only skipped, 0 failed**, plus frozen-lockfile install, TypeScript typecheck and build PASS. No required test, threshold or verification command was removed. The reviewer did not execute this local CI; the observation is from the trusted COS command output.
- Final independent post-remediation review, non-forced publication and GitHub Linux CI on the next SHA remain separate gates. Windows Job Object runtime still needs testing under a distinct low-privilege OS identity before release.
- Follow-up independent review gave **PASS for the development branch** and highlighted a digest-only misconfiguration that would silently fall back to legacy termination. Closed that fail-open case with a negative test; the final suite must be rerun on this last code change. The native supervisor still has a documented same-account TOCTOU limitation.

## Development checkpoint - 18 October 2026 (Origin validation)
- Base: PR #1 draft; separate worktree on G: preserves the original checkout.
- Base SHA 5b919abe5f9e5d7eac9de815245c1e423a07fc86. Baseline Windows Bun 1.4.2: 31 passed, 2 POSIX skips, 0 failures; frozen install, types and build passed.
- Fixed tokenless loopback Origin comparison to include protocol, host and port. Bearer-protected requests retain host/port comparison for HTTPS-terminating proxies.
- Regression asserts rejection of HTTPS Origin against an HTTP tokenless endpoint; original file edits and unrelated work are protected.
- Next: isolated low-privilege OS account integration harness; no merge, release or deployment.
- Post-change Windows local CI ultimately passed: 31 tests passed, 2 POSIX-only skipped, 0 failures; frozen install, typecheck and build passed. Two earlier attempts failed in existing Windows runner compilation tests at the 5-second Bun timeout; this intermittent gate remains a reliability follow-up.
- Muse Spark 1.3 Contributor Free was unavailable in the installed OpenCode CLI; a fallback Cerebras reviewer was blocked by account billing. Independent model review was not obtained in this run; publication is for draft PR review only.
