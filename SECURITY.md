# Security policy (development stage)

OpenCode Bot runs an AI coding tool. **Bot-generated commands execute with the OS rights of the OpenCode process.** Dashboard approval is a workflow safeguard, **not** a privilege boundary. A malicious agent or prompt-injection can potentially access local files, secrets or the SQLite database unless enforced by OS permission separation and a restricted OpenCode tool policy.

## Safe deployment assumptions

1. Keep the HTTP listener on **127.0.0.1** by default.
   Without a bearer token, non-loopback request URL hostnames are rejected (DNS-rebinding defense). A separate HTTP Host authority check detects non-loopback Host headers even when an intermediary supplies a loopback request URL; this is not an additional browser security boundary. Both checks are defense in depth, not an OS sandbox.
2. For trusted LAN or VPN access, configure a long random `OPENCODE_BOT_TOKEN`, firewall restrictions and ideally an HTTPS reverse proxy or encrypted VPN.
3. Start the daemon under an OS account dedicated to this application with access only to explicitly permitted workspaces. Do not attach administrator rights or the operator's main home directory.
4. Run `opencode run` with the least permissive agent profile possible. `--pure` suppresses third-party plugins but is **not** an OS sandbox.
5. Never pass OpenCode credentials, GitHub tokens or private data in the prompts. Environment variables are allowlisted for the subprocess, but files accessible to the OS account remain accessible.
6. Approve external actions individually; do not auto-approve destructive operations or security-sensitive work.
7. Running multiple daemons against the same DB is prohibited. A SQLite heartbeat lease prevents ordinary concurrent starts, but cannot prevent a stalled/partitioned process from continuing after its lease expires. An OS-level lock or distributed fencing is required for stronger guarantees.
8. Run only trusted feature branches in CI on a credential-bearing Windows PC. **Do not run untrusted public fork/PR code on a self-hosted runner.**

## Disclosure

Security findings can be shared privately with the repository maintainers at Culture Digitali. Avoid publishing credentials, exploit payloads against third-party infrastructure, or customer data in public issues.

## Current limitations

- There is no separate OS sandbox, multi-user RBAC, encrypted credential vault or independent permission enforcement within the worker.
- Task timeout and cancellation terminate the OpenCode subprocess tree where supported, but external side effects performed before cancellation cannot be rolled back.
- On POSIX, the worker starts OpenCode in a dedicated process group and terminates that group on cancellation or timeout. An Ubuntu 24.04 / Bun 1.4.2 subprocess integration test confirms an ordinary grandchild inheriting output pipes is stopped. Reader abort and bounded cleanup prevent an intentionally escaped pipe-holding descendant from indefinitely occupying the worker slot, but **cannot stop its side effects**; this is not an OS sandbox.
- On Windows, Bun 1.4.2 can delay timeout callbacks while a subprocess owns inherited-pipe descendants. An observed 900 ms limit was missed, and the old executor reported an empty response after about three seconds. A monotonic completion-time check now reports this **overdue completion** as a timeout rather than accepting or misclassifying it. This is only fail-closed result classification: it does **not** ensure timely cancellation, process-tree termination or prevention of late side effects. Do not rely on Windows timeout enforcement for arbitrary descendant trees. Use a restricted OS identity until isolation and cross-platform tests are complete.
- HTTP dashboard supports token authentication and Origin checks; do not expose it directly to the public internet. On tokenless loopback requests the Origin must match scheme, hostname and port. With a bearer token, the Origin check compares hostname and port to retain compatibility with trusted HTTPS-terminating proxies; the token and reverse-proxy access controls remain mandatory for remote access.
- Cron schedules persist in SQLite, but they trigger only while the daemon is running.

- Stale executor results after cancel/retry are fenced by the claimed attempt in runtime checks and atomic SQLite updates; this protects persisted status and handoffs, not external effects from a still-running process.

## Windows Job Object supervisor (development)

An optional Windows helper in `scripts/windows/JobRunner.cs` is compiled with `scripts/windows/build-runner.ps1`. Set `OPENCODE_BOT_WINDOWS_JOB_RUNNER` to the absolute compiled executable path **and** `OPENCODE_BOT_WINDOWS_JOB_RUNNER_SHA256` to the full SHA-256 of that compiled executable. The runtime re-hashes the binary before every launch, requires paired path/digest overrides, rejects empty or nonregular files and binaries larger than 32 MiB, and fails closed on missing or mismatched digests. The helper creates the child suspended, attaches it to a kill-on-close Job Object, resumes it, and enforces a native timeout independent of Bun timers. The trusted `scripts/local-ci.ps1` builds and enables the helper for Windows tests and removes its temporary build directory afterward.

The build script compiles a fresh executable to a unique source-hash-labelled path on each invocation; it never trusts a previously cached executable based on filename alone. A negative test substitutes altered executable bytes and verifies rejection before any subprocess starts; a digest configured without any runner path also fails closed instead of silently falling back to legacy termination. The helper is not signed, and processes with the same OS privileges can still modify its path **after** the digest check (TOCTOU). SHA-256 binding detects pre-launch replacement but is **not** a security boundary against a compromised OS account. Configure the runner only from a trusted build environment and isolate it by OS permissions.

This is process-tree management, not an OS sandbox. Windows account privileges and accessible workspaces remain unchanged. External side effects cannot be undone, and intentionally escaped descendants are not guaranteed to be contained. The legacy `taskkill` fallback remains when the helper is not enabled; it is not sufficient evidence of reliable timeout enforcement. A separate least-privileged Windows account and scratch workspace remain required before deployment.
