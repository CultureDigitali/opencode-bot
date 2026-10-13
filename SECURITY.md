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
- On Windows, an exploratory Bun 1.4.2 inherited-pipe grandchild test did not enforce the requested 900 ms timeout: the worker instead finished after about three seconds with an empty response. This is a known uncorrected reliability gap; do not rely on Windows timeout enforcement for arbitrary descendant trees. Use a restricted OS identity until isolation and cross-platform tests are complete.
- HTTP dashboard supports token authentication and same-origin checks; do not expose it directly to the public internet.
- Cron schedules persist in SQLite, but they trigger only while the daemon is running.
