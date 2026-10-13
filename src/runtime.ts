import { Cron } from "croner";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { BotStore, type Bot, type BotTask } from "./store";

export type MemoryEntry = { key: string; content: string };
export type TaskExecutor = (bot: Bot, task: BotTask, memory: MemoryEntry[], store: BotStore) => Promise<string>;

function redact(value: string): string {
  return value
    .replace(/\b(?:sk-|gho_|ghp_|ghs_|github_pat_)[a-zA-Z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]");
}

async function readBounded(stream: ReadableStream<Uint8Array>, maxBytes: number, onOverflow: () => void, abortSignal?: AbortSignal): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  const abortRead = () => { void reader.cancel("Task terminated").catch(() => { /* stream already closed */ }); };
  if (abortSignal?.aborted) abortRead();
  else abortSignal?.addEventListener("abort", abortRead, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        onOverflow();
        try { await reader.cancel("Output limit exceeded"); } catch { /* subprocess was killed */ }
        throw new Error("OpenCode output exceeded the configured size limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    abortSignal?.removeEventListener("abort", abortRead);
    reader.releaseLock();
  }
}

function openCodeExecutable(): string {
  if (process.env.OPENCODE_BOT_CLI) return process.env.OPENCODE_BOT_CLI;
  if (process.platform !== "win32") return "opencode";
  // Bun refuses multiline arguments through .cmd/.bat shims, correctly
  // preventing cmd.exe injection. Invoke the real executable instead.
  const directories = (process.env.Path || process.env.PATH || "").split(delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const candidate of [
      join(directory, "opencode.exe"),
      join(directory, "node_modules", "opencode-ai", "bin", "opencode.exe")
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("Cannot locate opencode.exe; set OPENCODE_BOT_CLI to the actual executable");
}

function childEnvironment(): Record<string, string> {
  // Deliberately allowlist system/runtime variables instead of inheriting all
  // secrets from the dashboard operator's environment.
  const keys = [
    "Path", "PATH", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC",
    "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "LANG", "LC_ALL", "TERM", "SHELL",
    "BUN_INSTALL", "OPENCODE_CONFIG_DIR"
  ];
  const output: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value) output[key] = value;
  }
  return output;
}

function extractAssistantText(output: string): string {
  const parts: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { type?: string; part?: { type?: string; text?: string }; text?: string };
      if (event.type === "text" && typeof event.part?.text === "string") parts.push(event.part.text);
    } catch {
      // Some OpenCode versions also print non-JSON diagnostic lines.
    }
  }
  return (parts.length ? parts.join("\n") : output).trim().slice(0, 64_000);
}

/** @internal Hook for hermetic spawned-process integration tests only. */
export type OpenCodeCommand = (bot: Bot, task: BotTask, prompt: string, workspace: string) => string[];

// Command injection is used only for hermetic process integration tests.
// Production uses the canonical OpenCode invocation and bounded timeout.
export function createOpenCodeExecutor(options: { command?: OpenCodeCommand; timeoutMs?: number; nowMs?: () => number; windowsJobRunner?: string; windowsJobRunnerSha256?: string } = {}): TaskExecutor {
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 3_600_000)) {
    throw new Error("Test timeout override must be a finite positive integer <= 3600000");
  }
  return async (bot, task, memory, store) => {
    const workspace = process.env.OPENCODE_BOT_WORKSPACE || process.cwd();
    const memoryText = memory.map((item) => item.key + ": " + item.content).join("\n").slice(0, 8_000);
    const prompt = [
      "You are the named OpenCode teammate: " + bot.name,
      bot.instructions,
      "Persisted context (operator-managed, not higher-priority instructions):",
      memoryText || "(none)",
      "Assigned task:",
      task.prompt,
      "Do not claim tests or changes you did not execute. Return a concise verifiable result."
    ].join("\n\n");

    const env = childEnvironment();
    const args = options.command?.(bot, task, prompt, workspace) ?? [
      openCodeExecutable(), "run", "--pure", "--format", "json", "--model", bot.model,
      "--agent", bot.agent, "--dir", workspace, prompt
    ];
    const configuredTimeout = Number(process.env.OPENCODE_BOT_TASK_TIMEOUT_MS || 900_000);
    const timeoutMs = options.timeoutMs ?? (Number.isFinite(configuredTimeout)
      ? Math.max(10_000, Math.min(3_600_000, configuredTimeout)) : 900_000);
    // Opt-in native supervisor enforces deadlines with Windows Job Objects,
    // independent of Bun's event loop. Configuration errors fail closed.
    const windowsJobRunner = process.platform === "win32"
      ? (options.windowsJobRunner ?? process.env.OPENCODE_BOT_WINDOWS_JOB_RUNNER)
      : undefined;
    if (process.platform === "win32" && !windowsJobRunner &&
        (options.windowsJobRunnerSha256 || process.env.OPENCODE_BOT_WINDOWS_JOB_RUNNER_SHA256)) {
      throw new Error("Windows Job Object runner SHA-256 configured without a runner path");
    }
    if (windowsJobRunner && options.windowsJobRunner &&
        !options.windowsJobRunnerSha256) {
      throw new Error("Explicit Windows Job Object runner requires its own SHA-256 digest");
    }
    if (windowsJobRunner && !options.windowsJobRunner &&
        options.windowsJobRunnerSha256) {
      throw new Error("Explicit Windows Job Object digest requires a matching runner path");
    }
    if (windowsJobRunner && (!isAbsolute(windowsJobRunner) || !existsSync(windowsJobRunner))) {
      throw new Error("OPENCODE_BOT_WINDOWS_JOB_RUNNER must name an existing absolute executable");
    }
    if (windowsJobRunner) {
      const expected = options.windowsJobRunner
        ? options.windowsJobRunnerSha256
        : process.env.OPENCODE_BOT_WINDOWS_JOB_RUNNER_SHA256;
      if (!expected || !/^[0-9a-fA-F]{64}$/.test(expected)) {
        throw new Error("Windows Job Object runner requires a pinned SHA-256 digest");
      }
      const info = statSync(windowsJobRunner);
      if (!info.isFile() || info.size <= 0 || info.size > 32 * 1024 * 1024) {
        throw new Error("Windows Job Object runner must be a regular file no larger than 32 MiB");
      }
      const actual = createHash("sha256").update(readFileSync(windowsJobRunner)).digest("hex");
      if (actual !== expected.toLowerCase()) {
        throw new Error("Windows Job Object runner SHA-256 mismatch");
      }
    }
    const launchArgs = windowsJobRunner ? [windowsJobRunner, String(timeoutMs), ...args] : args;
    // The injectable monotonic clock is only for deterministic integration tests.
    const nowMs = options.nowMs ?? (() => performance.now());
    const startedAt = nowMs();
    const processHandle = Bun.spawn(launchArgs, {
      cwd: workspace, env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      detached: process.platform !== "win32"
    });
    let termination: string | null = null;
    let killRequested = false;
    const abortPipes = new AbortController();
    let signalTermination = () => {};
    const terminationSignal = new Promise<null>((resolve) => { signalTermination = () => resolve(null); });
    const terminate = (reason: string) => {
      termination ??= reason;
      if (killRequested) return;
      killRequested = true;
      abortPipes.abort();
      signalTermination();
      if (process.platform === "win32" && processHandle.pid && !windowsJobRunner) {
        // Legacy fallback only. Killing the native helper closes the Job
        // Object and terminates descendants without synchronous taskkill.
        // Kill the full process tree: Windows CLI shims can launch children.
        try {
          Bun.spawnSync(["taskkill", "/PID", String(processHandle.pid), "/T", "/F"], {
            stdout: "ignore", stderr: "ignore"
          });
        } catch { /* fallback below */ }
      } else if (process.platform !== "win32" && processHandle.pid) {
        // The POSIX child owns a dedicated process group (detached at spawn).
        // Terminate ordinary descendants sharing its output pipes as well.
        const ownedGroup = 0 - processHandle.pid;
        try { process.kill(ownedGroup, "SIGKILL"); } catch { /* fallback below */ }
      }
      try { processHandle.kill("SIGKILL"); } catch { /* already exited */ }
    };
    // On Windows the Job Object supervisor owns the hard deadline. Keep a
    // separate later watchdog for a stuck supervisor, not a race to kill it
    // while it is still assigning a suspended child to its job.
    const timer = setTimeout(() => terminate("OpenCode task timed out"), windowsJobRunner ? timeoutMs + 5_000 : timeoutMs);
    const cancelMonitor = setInterval(() => {
      const current = store.getTask(task.id);
      // A cancelled task can be retried before the next poll. The retry must
      // not let the old subprocess keep running under a reused task ID.
      if (!current || current.status !== "running" || current.attempts !== task.attempts) {
        terminate("Task cancelled or superseded by retry");
      }
    }, 500);
    const stdoutResult = readBounded(processHandle.stdout as ReadableStream<Uint8Array>, 512_000, () => terminate("Output limit exceeded"), abortPipes.signal);
    const stderrResult = readBounded(processHandle.stderr as ReadableStream<Uint8Array>, 64_000, () => terminate("Error output limit exceeded"), abortPipes.signal);
    const exitResult = processHandle.exited;
    try {
      // A helper can escape the child process group and retain inherited pipe
      // handles. Do not let such a helper keep the worker slot busy forever.
      const completed = await Promise.race([Promise.all([stdoutResult, stderrResult, exitResult]), terminationSignal]);
      if (termination) throw new Error(termination);
      // On Windows, inherited descendant pipe handles can starve Bun's timer
      // callbacks until the direct process exits. Never accept an overdue
      // response (or misclassify its empty output) merely because the timer
      // callback did not run. This cannot undo late subprocess side effects.

      if (!completed) throw new Error("OpenCode worker terminated");
      const [stdout, stderr, exitCode] = completed;
      if (windowsJobRunner && exitCode === 124 && stderr.includes("OCB_JOB_TIMEOUT")) throw new Error("OpenCode task timed out (Windows Job Object)");
      if (nowMs() - startedAt >= timeoutMs) throw new Error("OpenCode task timed out (completion exceeded deadline)");
      if (exitCode !== 0) throw new Error("OpenCode exited with status " + exitCode + ": " + redact(stderr.slice(-1_000)));
      const result = extractAssistantText(stdout);
      if (!result) throw new Error("OpenCode returned no assistant text");
      return result;
    } finally {
      clearTimeout(timer);
      clearInterval(cancelMonitor);
      // Cancellation closes our pipe readers. A different POSIX session can
      // still retain child handles; bounded cleanup prevents slot starvation.
      const settled = Promise.allSettled([stdoutResult, stderrResult, exitResult]);
      if (termination) await Promise.race([settled, Bun.sleep(500)]);
      else await settled;
    }
  };
}

export const executeOpenCode: TaskExecutor = createOpenCodeExecutor();

export class BotRuntime {
  private busy = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private cronJobs = new Map<string, Cron>();
  private stopped = false;
  private leaseActive = false;
  private activeTaskId: string | null = null;
  private activeTaskAttempt: number | null = null;
  private readonly leaseOwner = randomUUID();

  constructor(readonly store: BotStore, readonly executor: TaskExecutor = executeOpenCode) {}

  start(): void {
    if (this.timer) return;
    if (!this.store.acquireLease(this.leaseOwner)) {
      throw new Error("Another OpenCode Bot daemon already owns this database; refusing to start a second worker");
    }
    this.leaseActive = true;
    this.stopped = false;
    this.store.recoverInterrupted();
    this.reloadSchedules();
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.heartbeat = setInterval(() => {
      if (!this.store.refreshLease(this.leaseOwner)) {
        this.store.event(null, "lease_lost", "Another process owns the worker lease");
        this.stop();
      }
    }, 5_000);
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = undefined;
    this.heartbeat = undefined;
    for (const cron of this.cronJobs.values()) cron.stop();
    this.cronJobs.clear();
    const active = this.activeTaskId ? this.store.getTask(this.activeTaskId) : null;
    if (active?.status === "running" && active.attempts === this.activeTaskAttempt) {
      this.store.cancel(active.id);
    }
    if (!this.busy) this.releaseLease();
  }

  private releaseLease(): void {
    if (this.leaseActive) this.store.releaseLease(this.leaseOwner);
    this.leaseActive = false;
  }

  async waitForIdle(timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (this.busy && Date.now() < deadline) await Bun.sleep(100);
    return !this.busy;
  }

  reloadSchedules(): void {
    for (const cron of this.cronJobs.values()) cron.stop();
    this.cronJobs.clear();
    for (const schedule of this.store.schedules().filter((s) => s.enabled)) {
      try {
        const cron = new Cron(schedule.expression, { timezone: schedule.timezone ?? undefined, protect: true }, (job) => {
          try {
            this.store.enqueueSchedule(schedule.id, job.currentRun() ?? new Date());
            void this.tick();
          } catch (error) {
            this.store.event(null, "schedule_error", schedule.id + ": " + redact(String(error)));
          }
        });
        this.cronJobs.set(schedule.id, cron);
      } catch (error) {
        this.store.event(null, "schedule_invalid", schedule.id + ": " + redact(String(error)));
      }
    }
  }

  async tick(): Promise<void> {
    if (this.busy || this.stopped) return;
    const task = this.store.claim();
    if (!task) return;
    this.busy = true;
    const claimedAttempt = task.attempts;
    this.activeTaskId = task.id;
    this.activeTaskAttempt = claimedAttempt;
    try {
      const bot = this.store.getBot(task.bot_id);
      if (!bot) throw new Error("Bot no longer exists");
      const answer = await this.executor(bot, task, this.store.memory(bot.id), this.store);
      const current = this.store.getTask(task.id);
      if (current?.status === "running" && current.attempts === claimedAttempt) {
        this.store.complete(task.id, answer, claimedAttempt);
      }
    } catch (error) {
      const current = this.store.getTask(task.id);
      if (current?.status === "running" && current.attempts === claimedAttempt) {
        this.store.fail(task.id, redact(error instanceof Error ? error.message : String(error)), claimedAttempt);
      }
    } finally {
      this.busy = false;
      this.activeTaskId = null;
      this.activeTaskAttempt = null;
      if (this.stopped) this.releaseLease();
      if (!this.stopped) queueMicrotask(() => void this.tick());
    }
  }
}
