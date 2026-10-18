# OpenCode Bot

**Local-first AI teammates powered by OpenCode CLI.** This project is a real fork of [richardanaya/opencode-cron](https://github.com/richardanaya/opencode-cron), retaining its MIT-licensed cron plugin and Git history while adding a persistent local bot runtime.

> **Status: v0.1 / first milestone.** Automated tests cover queue, state transitions, approvals, schedules and HTTP authentication. A real CLI task completed successfully with the Muse 1.3 free model on Windows (integration smoke test, 13 October 2026); browser QA, daemon recovery and production hardening remain. This is not yet feature parity with Grok Bot or OpenBot.

## Quick start

Requires Bun 1.4+, Node 22+ for tooling, and an authenticated [OpenCode CLI](https://opencode.ai).

```powershell
git clone https://github.com/CultureDigitali/opencode-bot.git
cd opencode-bot
bun install --frozen-lockfile
bun run build
bun run start
```

Open **http://127.0.0.1:4271**. Create named agents, assign tasks, approve tasks, configure cron routines and inspect persisted results. The default model is `opencode/muse-spark-1.3-contributor-free` when available to your OpenCode account; you may choose another model.

The legacy cron plugin stays in `index.ts` (compiled to `dist/index.js`). The standalone bot daemon is `src/server.ts` (compiled to `dist/server.js`). The daemon adds its own `bot_*` tables to the original SQLite database without deleting legacy tables.

### Security

- Binds to `127.0.0.1` by default, never publicly exposed without configuration.
- For **trusted LAN or VPN** access set `OPENCODE_BOT_HOST=0.0.0.0` and a long random `OPENCODE_BOT_TOKEN`. Use firewall rules; do not expose tools directly to the internet. HTTPS or VPN is necessary outside a trusted LAN.
- All tasks require explicit approval unless the operator opts into immediate execution. Each scheduled firing also requires approval unless auto-approval was deliberately enabled for that routine. Approval-bound retries require a fresh approval.
- OpenCode tools can modify files or run shell commands **with the user's OS permissions**. Run in a dedicated least-privileged workspace. Do not put secrets in prompts or bot memory.
- **Approval workflows are not OS sandboxes**: a bot running as the same operating-system user can potentially access that user's files (including the SQLite database) independently of the dashboard. The subprocess receives an environment-variable allowlist, but production deployments require a separate unprivileged OS account/container and scoped OpenCode tools.
- Unexpected restarts mark running tasks failed, not silently successful. Operators explicitly retry after reviewing possible side effects.
- The API requires a Bearer token when configured; the dashboard stores it in browser session storage, never in URLs.

### Commands

| Command | Purpose |
|---|---|
| `bun run dev` | Start TypeScript daemon |
| `bun run build` | Compile plugin and daemon |
| `bun run start` | Start compiled daemon |
| `bun test` | Run unit tests |
| `bun run typecheck` | Strict TypeScript checks |
| `powershell -File scripts/local-ci.ps1` | Equivalent Windows CI fallback |

### Architecture

`src/store.ts` holds SQLite bots, memory, tasks, handoffs, audit logs and guarded transitions. `src/runtime.ts` invokes OpenCode CLI with time/output bounds and runs Croner schedules. `src/server.ts` exposes authenticated localhost HTTP routes and serves the responsive dashboard in `src/dashboard.*`.

The daemon must stay running for routines to fire; persistence preserves data, **not execution when the PC is off**. See [the roadmap](docs/ROADMAP.md).

### Functional inspiration, not copied code

[CopilotKit/OpenBot](https://github.com/CopilotKit/OpenBot), [ashhart/OpenBot](https://github.com/ashhart/OpenBot), [pmwasim/OpenBot](https://github.com/pmwasim/OpenBot), [regnull/openbot](https://github.com/regnull/openbot) and public Grok Bot feature descriptions are functional references. Their source code has **not** been copied; no affiliation with Grok Bot is implied.

---

## Original opencode-cron documentation

A cron job scheduler for OpenCode sessions that triggers messages at scheduled intervals.

## Description

This OpenCode plugin provides a lightweight cron job system that allows sessions to schedule automated actions. Jobs are stored in a SQLite database with execution history tracking.

**NOTE: Cron data is stored in `~/.config/opencode/cron.db`**

## Installation

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-cron"
  ]
  ...
}
```

## Usage

The plugin provides eight tools for managing cron jobs:

### Tools

- **create_cron_job** - Create a new scheduled job
- **list_cron_jobs** - List all jobs with status and next run time
- **delete_cron_job** - Remove a job by name
- **enable_cron_job** - Enable a disabled job
- **disable_cron_job** - Disable an enabled job
- **watch_cron_jobs** - Start the scheduler to auto-trigger jobs
- **stop_watching_cron** - Stop the job scheduler
- **get_cron_history** - Get execution history for a job

## API

### create_cron_job

Create a new scheduled job.

**Parameters:**
- `name` (string, required) - Unique job identifier
- `schedule` (string, required) - 5-element cron expression (e.g., "*/5 * * * *")
- `message` (string, required) - Message to inject when job fires
- `enabled` (boolean, optional) - Whether job is active (default: true)

### list_cron_jobs

List all cron jobs with their status, schedule, last run time, and next scheduled run.

**Parameters:** None

**Returns:** Array of jobs with name, schedule, enabled status, last run, and next run time

### delete_cron_job

Remove a job by name.

**Parameters:**
- `name` (string, required) - Name of the job to delete

### enable_cron_job

Enable a previously disabled job.

**Parameters:**
- `name` (string, required) - Name of the job to enable

### disable_cron_job

Disable an enabled job (pauses execution).

**Parameters:**
- `name` (string, required) - Name of the job to disable

### watch_cron_jobs

Start the scheduler to monitor and execute jobs. When a job's scheduled time arrives, its message is injected into the session.

**Parameters:** None

### stop_watching_cron

Stop the job scheduler.

**Parameters:** None

**Returns:** Confirmation that the scheduler has been stopped

### get_cron_history

Get execution history for a job.

**Parameters:**
- `name` (string, required) - Name of the job
- `limit` (number, optional) - Number of recent executions to return (default: 10)

**Returns:** Array of execution records with timestamp, success status, and any error message

## Cron Expression Format

Uses standard 5-element cron format:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, where 0 and 7 are Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

Examples:
- `"*/5 * * * *"` - Every 5 minutes
- `"0 9 * * 1"` - Every Monday at 9:00 AM
- `"0 0 * * *"` - Every day at midnight
- `"0 */6 * * *"` - Every 6 hours

## Storage

Cron data is persisted in a SQLite database at `~/.config/opencode/cron.db`. The database includes:
- Jobs table with schedule, message, and enabled status
- Execution history table tracking success/failure
- WAL (Write-Ahead Logging) mode for better concurrency

## Session Management

When a session ends, the job scheduler is automatically stopped.

## Requirements

- Peer dependency: `@opencode-ai/plugin` ^1.1.25

## License

MIT

## Repository

https://github.com/richardanaya/opencode-cron
