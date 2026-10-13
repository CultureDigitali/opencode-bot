import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { Cron } from "croner";

export type TaskStatus = "awaiting_approval" | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Bot {
  id: string;
  name: string;
  instructions: string;
  model: string;
  agent: string;
  created_at: string;
}

export interface BotTask {
  id: string;
  bot_id: string;
  prompt: string;
  status: TaskStatus;
  requires_approval: number;
  handoff_bot_id: string | null;
  parent_id: string | null;
  depth: number;
  attempts: number;
  source_key: string | null;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotSchedule {
  id: string;
  bot_id: string;
  name: string;
  expression: string;
  timezone: string | null;
  prompt: string;
  auto_approve: number;
  enabled: number;
  created_at: string;
}

export interface BotEvent {
  id: number;
  task_id: string | null;
  type: string;
  detail: string;
  created_at: string;
}

export interface NewTask {
  botId: string;
  prompt: string;
  requiresApproval?: boolean;
  handoffBotId?: string | null;
  parentId?: string | null;
  depth?: number;
  sourceKey?: string | null;
}

const MAX_PROMPT = 16_000;
const MAX_TEXT = 64_000;
const iso = () => new Date().toISOString();

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(field + " must be a nonempty string (max " + max + " characters)");
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredString(value, field, max);
}

export function verifyCron(expression: string, timezone: string | null): void {
  if (expression.trim().split(/\s+/).length !== 5) {
    throw new Error("Schedule must have exactly five cron fields");
  }
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error("Invalid IANA timezone");
    }
  }
  try {
    const next = new Cron(expression, { timezone: timezone ?? undefined }).nextRun();
    if (!next) throw new Error("No next run");
  } catch {
    throw new Error("Invalid cron expression");
  }
}

export class BotStore {
  readonly db: Database;

  constructor(file = process.env.OPENCODE_BOT_DB || join(homedir(), ".config", "opencode", "cron.db")) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.db.exec([
      "CREATE TABLE IF NOT EXISTS bot_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, instructions TEXT NOT NULL, model TEXT NOT NULL, agent TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS bot_tasks (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bot_agents(id), prompt TEXT NOT NULL, status TEXT NOT NULL, requires_approval INTEGER NOT NULL, handoff_bot_id TEXT, parent_id TEXT, depth INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, source_key TEXT UNIQUE, result TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_bot_tasks_status ON bot_tasks(status, created_at)",
      "CREATE TABLE IF NOT EXISTS bot_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, type TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_bot_events_task ON bot_events(task_id, id)",
      "CREATE TABLE IF NOT EXISTS bot_schedules (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bot_agents(id), name TEXT NOT NULL, expression TEXT NOT NULL, timezone TEXT, prompt TEXT NOT NULL, auto_approve INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS bot_memory (bot_id TEXT NOT NULL REFERENCES bot_agents(id), key TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(bot_id, key))",
      "CREATE TABLE IF NOT EXISTS bot_leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, heartbeat_ms INTEGER NOT NULL)"
    ].join(";\n") + ";");
  }

  close(): void { this.db.close(); }

  addBot(spec: { name: string; instructions?: string; model?: string; agent?: string }): Bot {
    const id = randomUUID();
    const name = requiredString(spec.name, "name", 80);
    const instructions = optionalString(spec.instructions, "instructions", 8_000) ?? "Complete the assigned task and report verifiable results.";
    const model = optionalString(spec.model, "model", 150) ?? "opencode/muse-spark-1.3-contributor-free";
    const agent = optionalString(spec.agent, "agent", 80) ?? "build";
    const created = iso();
    this.db.query("INSERT INTO bot_agents (id, name, instructions, model, agent, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, instructions, model, agent, created);
    this.event(null, "bot_created", name);
    return this.getBot(id)!;
  }

  getBot(id: string): Bot | null {
    return this.db.query("SELECT * FROM bot_agents WHERE id=?").get(id) as Bot | null;
  }

  listBots(): Bot[] {
    return this.db.query("SELECT * FROM bot_agents ORDER BY created_at DESC").all() as Bot[];
  }

  event(taskId: string | null, type: string, detail: string): void {
    this.db.query("INSERT INTO bot_events(task_id, type, detail, created_at) VALUES(?, ?, ?, ?)").run(taskId, type, detail.slice(0, 4_000), iso());
  }

  events(after = 0, limit = 100): BotEvent[] {
    const bounded = Math.max(1, Math.min(200, Math.floor(limit)));
    return this.db.query("SELECT * FROM bot_events WHERE id>? ORDER BY id DESC LIMIT ?").all(Math.max(0, Math.floor(after)), bounded) as BotEvent[];
  }

  addTask(spec: NewTask): BotTask {
    if (!this.getBot(spec.botId)) throw new Error("Unknown bot");
    if (spec.handoffBotId && !this.getBot(spec.handoffBotId)) throw new Error("Unknown handoff bot");
    const prompt = requiredString(spec.prompt, "prompt", MAX_PROMPT);
    const depth = spec.depth ?? 0;
    if (!Number.isInteger(depth) || depth < 0 || depth > 3) throw new Error("Handoff depth exceeded");
    const id = randomUUID();
    const status = spec.requiresApproval === false ? "queued" : "awaiting_approval";
    const created = iso();
    try {
      this.db.query("INSERT INTO bot_tasks(id, bot_id, prompt, status, requires_approval, handoff_bot_id, parent_id, depth, source_key, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, spec.botId, prompt, status, status === "queued" ? 0 : 1, spec.handoffBotId ?? null, spec.parentId ?? null, depth, spec.sourceKey ?? null, created, created);
    } catch (error) {
      if (spec.sourceKey && String(error).includes("UNIQUE")) {
        const existing = this.db.query("SELECT * FROM bot_tasks WHERE source_key=?").get(spec.sourceKey) as BotTask | null;
        if (existing) return existing;
      }
      throw error;
    }
    this.event(id, "task_created", status);
    return this.getTask(id)!;
  }

  getTask(id: string): BotTask | null {
    return this.db.query("SELECT * FROM bot_tasks WHERE id=?").get(id) as BotTask | null;
  }

  tasks(limit = 100): BotTask[] {
    return this.db.query("SELECT * FROM bot_tasks ORDER BY created_at DESC LIMIT ?").all(Math.max(1, Math.min(200, Math.floor(limit)))) as BotTask[];
  }

  approve(id: string): BotTask {
    const changed = this.db.query("UPDATE bot_tasks SET status='queued', updated_at=? WHERE id=? AND status='awaiting_approval'").run(iso(), id).changes;
    if (!changed) throw new Error("Task is not awaiting approval");
    this.event(id, "task_approved", "Approved by operator");
    return this.getTask(id)!;
  }

  cancel(id: string): BotTask {
    const changed = this.db.query("UPDATE bot_tasks SET status='cancelled', updated_at=? WHERE id=? AND status IN ('awaiting_approval','queued','running')").run(iso(), id).changes;
    if (!changed) throw new Error("Task cannot be cancelled");
    this.event(id, "task_cancelled", "Cancelled by operator");
    return this.getTask(id)!;
  }

  retry(id: string): BotTask {
    const task = this.getTask(id);
    if (!task || !["failed", "cancelled"].includes(task.status) || task.attempts >= 3) {
      throw new Error("Task cannot be retried (max 3 attempts)");
    }
    // An earlier approval never authorizes a retry.
    const status = task.requires_approval ? "awaiting_approval" : "queued";
    this.db.query("UPDATE bot_tasks SET status=?, attempts=attempts+1, result=NULL, error=NULL, updated_at=? WHERE id=?").run(status, iso(), id);
    this.event(id, "task_retried", status);
    return this.getTask(id)!;
  }

  claim(): BotTask | null {
    const claimOne = this.db.transaction(() => {
      const row = this.db.query("SELECT id FROM bot_tasks WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get() as { id: string } | null;
      if (!row) return null;
      const updated = this.db.query("UPDATE bot_tasks SET status='running', updated_at=? WHERE id=? AND status='queued'").run(iso(), row.id);
      if (!updated.changes) return null;
      this.event(row.id, "task_started", "OpenCode worker claimed task");
      return this.getTask(row.id);
    });
    return claimOne();
  }

  complete(id: string, answer: string): BotTask {
    const result = answer.slice(0, MAX_TEXT);
    const updated = this.db.query("UPDATE bot_tasks SET status='completed', result=?, error=NULL, updated_at=? WHERE id=? AND status='running'").run(result, iso(), id);
    if (!updated.changes) throw new Error("Task is no longer running");
    this.event(id, "task_completed", "Result persisted");
    const task = this.getTask(id)!;
    if (task.handoff_bot_id && task.depth < 3) {
      try {
        const followup = this.addTask({
          botId: task.handoff_bot_id,
          prompt: ("Review the preceding bot result for task " + task.id + ":\n\n" + result).slice(0, MAX_PROMPT),
          requiresApproval: true, parentId: id, depth: task.depth + 1
        });
        this.event(id, "task_handoff", followup.id);
      } catch (error) {
        this.event(id, "handoff_failed", String(error));
      }
    }
    return task;
  }

  fail(id: string, message: string): BotTask {
    const updated = this.db.query("UPDATE bot_tasks SET status='failed', error=?, updated_at=? WHERE id=? AND status='running'").run(message.slice(0, 4_000), iso(), id);
    if (!updated.changes) throw new Error("Task is no longer running");
    this.event(id, "task_failed", message);
    return this.getTask(id)!;
  }

  recoverInterrupted(): number {
    const recover = this.db.transaction(() => {
      const tasks = this.db.query("SELECT id FROM bot_tasks WHERE status='running'").all() as { id: string }[];
      for (const task of tasks) {
        this.db.query("UPDATE bot_tasks SET status='failed', error=?, updated_at=? WHERE id=? AND status='running'").run("Daemon restarted before completion; review before retry.", iso(), task.id);
        this.event(task.id, "task_interrupted", "Not automatically replayed");
      }
      return tasks.length;
    });
    return recover();
  }

  acquireLease(owner: string, ttlMs = 60_000): boolean {
    const now = Date.now();
    const changed = this.db.query("INSERT INTO bot_leases(name, owner, heartbeat_ms) VALUES('worker', ?, ?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, heartbeat_ms=excluded.heartbeat_ms WHERE bot_leases.owner=? OR bot_leases.heartbeat_ms<?")
      .run(owner, now, owner, now - ttlMs).changes;
    return changed > 0;
  }

  refreshLease(owner: string): boolean {
    return this.db.query("UPDATE bot_leases SET heartbeat_ms=? WHERE name='worker' AND owner=?").run(Date.now(), owner).changes > 0;
  }

  releaseLease(owner: string): void {
    this.db.query("DELETE FROM bot_leases WHERE name='worker' AND owner=?").run(owner);
  }

  addMemory(botId: string, key: string, content: string): void {
    if (!this.getBot(botId)) throw new Error("Unknown bot");
    this.db.query("INSERT INTO bot_memory(bot_id, key, content, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(bot_id, key) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at")
      .run(botId, requiredString(key, "key", 80), requiredString(content, "content", 4_000), iso());
    this.event(null, "memory_saved", botId);
  }

  memory(botId: string): Array<{ key: string; content: string }> {
    return this.db.query("SELECT key, content FROM bot_memory WHERE bot_id=? ORDER BY key LIMIT 30").all(botId) as Array<{ key: string; content: string }>;
  }

  addSchedule(spec: { botId: string; name: string; expression: string; timezone?: string | null; prompt: string; autoApprove?: boolean }): BotSchedule {
    if (!this.getBot(spec.botId)) throw new Error("Unknown bot");
    const expression = requiredString(spec.expression, "expression", 100);
    const timezone = optionalString(spec.timezone, "timezone", 100);
    verifyCron(expression, timezone);
    const id = randomUUID();
    this.db.query("INSERT INTO bot_schedules(id, bot_id, name, expression, timezone, prompt, auto_approve, enabled, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)")
      .run(id, spec.botId, requiredString(spec.name, "name", 80), expression, timezone, requiredString(spec.prompt, "prompt", MAX_PROMPT), spec.autoApprove === true ? 1 : 0, iso());
    this.event(null, "schedule_created", id);
    return this.getSchedule(id)!;
  }

  getSchedule(id: string): BotSchedule | null {
    return this.db.query("SELECT * FROM bot_schedules WHERE id=?").get(id) as BotSchedule | null;
  }

  schedules(): BotSchedule[] {
    return this.db.query("SELECT * FROM bot_schedules ORDER BY created_at DESC").all() as BotSchedule[];
  }

  toggleSchedule(id: string, enabled: boolean): BotSchedule {
    const updated = this.db.query("UPDATE bot_schedules SET enabled=? WHERE id=?").run(enabled ? 1 : 0, id);
    if (!updated.changes) throw new Error("Unknown schedule");
    this.event(null, "schedule_toggled", id + ": " + enabled);
    return this.getSchedule(id)!;
  }

  enqueueSchedule(id: string, firedAt = new Date()): BotTask {
    const schedule = this.getSchedule(id);
    if (!schedule || !schedule.enabled) throw new Error("Schedule disabled or unknown");
    // Deduplicate tick delivery after restart or across multiple daemon processes.
    const slot = Math.floor(firedAt.getTime() / 60_000);
    return this.addTask({
      botId: schedule.bot_id,
      prompt: schedule.prompt,
      requiresApproval: schedule.auto_approve !== 1,
      sourceKey: "schedule:" + id + ":" + slot
    });
  }

  stats(): Record<string, number> {
    const counts: Record<string, number> = { total: 0, queued: 0, running: 0, completed: 0, failed: 0, awaiting_approval: 0, cancelled: 0 };
    const rows = this.db.query("SELECT status, COUNT(*) AS count FROM bot_tasks GROUP BY status").all() as { status: string; count: number }[];
    for (const row of rows) {
      counts[row.status] = row.count;
      counts.total += row.count;
    }
    return counts;
  }
}
