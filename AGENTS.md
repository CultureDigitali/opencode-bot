# Agent instructions for opencode-bot

Repository: `CultureDigitali/opencode-bot`, fork of `richardanaya/opencode-cron`; respect MIT and preserve original plugin API and history.

Work as one implementation writer plus independent **architect, QA, reviewer, red-team and gatekeeper** processes when real isolated sessions are available. Use `opencode/muse-spark-1.3-contributor-free` only if authenticated and available; never claim an agent ran if it did not.

Before changes:

1. Confirm `git status -sb`, HEAD, branch, remote and the accepted task scope. Protect all existing uncommitted work.
2. Read `docs/ROADMAP.md`, `SECURITY.md` and the source files involved.
3. Run `bun install --frozen-lockfile`, `bun test`, `bun run typecheck`, `bun run build` to establish current baseline and verification contract.

For every change: implement one bounded high-priority improvement, test behavior and regressions, ask a real independent reviewer to challenge auth/cancellation/concurrency/security, reconcile findings, document verified and unverified evidence, and only then commit and push a task branch. Verify the remote commit SHA. No force push, silent test weakening, automatic merge or deployment.

The original `dist/index.js` and `dist/index.d.ts` are tracked historical build outputs; do not commit regenerated huge Windows line-ending diffs. New compiled daemon artifacts are untracked/ignored by `.gitignore` and created by the build.

Hosted GitHub Actions is the primary CI backend. If quota, outage or billing genuinely blocks it, run the same checks on trusted Windows COS via `scripts/local-ci.ps1`; use GitHub self-hosted only if a private, trusted runner is registered and workflow rules prevent untrusted PR code execution. Report actual backend and SHA rather than pretending remote CI.

**Do not treat human approval in the web UI as a security boundary against an OpenCode process with the same OS identity.** Production isolation remains a roadmap item.
