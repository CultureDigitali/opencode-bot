import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BotStore, verifyCron } from "../src/store";
import { BotRuntime } from "../src/runtime";
import { createHandler } from "../src/server";

const stores: BotStore[] = [];
const tempFolders: string[] = [];
function store() {
  const db = new BotStore(":memory:");
  stores.push(db);
  return db;
}
afterEach(() => {
  for (const item of stores.splice(0)) item.close();
  for (const folder of tempFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("persistent bots and approvals", () => {
  test("tasks are approval-bound by default and transitions are guarded", () => {
    const db = store();
    const bot = db.addBot({ name: "Implementer" });
    const task = db.addTask({ botId: bot.id, prompt: "Run a safe unit test" });
    expect(task.status).toBe("awaiting_approval");
    expect(db.claim()).toBeNull();
    expect(db.approve(task.id).status).toBe("queued");
    expect(() => db.approve(task.id)).toThrow();
    expect(db.claim()?.status).toBe("running");
    expect(db.complete(task.id, "PASS").status).toBe("completed");
    expect(() => db.complete(task.id, "double completion")).toThrow();
    expect(db.events().some((event) => event.type === "task_completed")).toBe(true);
  });

  test("handoffs are created only by an explicit operator-selected bot and require approval", () => {
    const db = store();
    const builder = db.addBot({ name: "Builder" });
    const reviewer = db.addBot({ name: "Reviewer", agent: "plan" });
    const initial = db.addTask({ botId: builder.id, prompt: "Build feature", handoffBotId: reviewer.id, requiresApproval: false });
    expect(db.claim()?.id).toBe(initial.id);
    db.complete(initial.id, "Implemented code");
    const handoff = db.tasks().find((item) => item.parent_id === initial.id);
    expect(handoff?.bot_id).toBe(reviewer.id);
    expect(handoff?.status).toBe("awaiting_approval");
    expect(handoff?.prompt).toContain("Implemented code");
    expect(db.claim()).toBeNull();
  });

  test("failed and cancelled tasks cannot reuse an earlier approval", () => {
    const db = store();
    const bot = db.addBot({ name: "Bot" });
    const task = db.addTask({ botId: bot.id, prompt: "Check build" });
    db.approve(task.id);
    db.claim();
    db.fail(task.id, "test failure");
    expect(db.retry(task.id).status).toBe("awaiting_approval");
    db.approve(task.id);
    expect(db.cancel(task.id).status).toBe("cancelled");
    expect(db.retry(task.id).status).toBe("awaiting_approval");
    expect(() => db.complete(task.id, "late result")).toThrow();
  });

  test("restart marks in-flight task as failed instead of pretending success", () => {
    const db = store();
    const bot = db.addBot({ name: "Worker" });
    const task = db.addTask({ botId: bot.id, prompt: "Long job", requiresApproval: false });
    db.claim();
    expect(db.recoverInterrupted()).toBe(1);
    expect(db.getTask(task.id)?.status).toBe("failed");
    expect(db.getTask(task.id)?.error).toContain("restarted");
    expect(db.claim()).toBeNull();
  });

  test("memory persists per bot and is not shared with another bot", () => {
    const db = store();
    const a = db.addBot({ name: "A" });
    const b = db.addBot({ name: "B" });
    db.addMemory(a.id, "team", "Culture Digitali");
    expect(db.memory(a.id)).toEqual([{ key: "team", content: "Culture Digitali" }]);
    expect(db.memory(b.id)).toEqual([]);
  });
});

describe("cron and worker", () => {
  test("database worker lease prevents a concurrent second daemon", () => {
    const folder = mkdtempSync(join(tmpdir(), "ocb-leases-"));
    tempFolders.push(folder);
    const filename = join(folder, "agents.sqlite");
    const a = new BotStore(filename);
    const b = new BotStore(filename);
    stores.push(a, b);
    expect(a.acquireLease("worker-a")).toBe(true);
    expect(b.acquireLease("worker-b")).toBe(false);
    expect(a.refreshLease("worker-a")).toBe(true);
    a.releaseLease("worker-a");
    expect(b.acquireLease("worker-b")).toBe(true);
    expect(a.acquireLease("worker-a")).toBe(false);
    b.releaseLease("worker-b");
  });

  test("concurrent restart recovery never records duplicate interruptions", () => {
    const folder = mkdtempSync(join(tmpdir(), "ocb-restart-"));
    tempFolders.push(folder);
    const filename = join(folder, "agents.sqlite");
    const a = new BotStore(filename);
    const b = new BotStore(filename);
    stores.push(a, b);
    const bot = a.addBot({ name: "Shared" });
    const task = a.addTask({ botId: bot.id, prompt: "Inspect", requiresApproval: false });
    a.claim();
    expect(a.recoverInterrupted()).toBe(1);
    expect(b.recoverInterrupted()).toBe(0);
    expect(b.events().filter((event) => event.type === "task_interrupted" && event.task_id === task.id)).toHaveLength(1);
  });
  test("validates five-field expressions and IANA timezone", () => {
    expect(() => verifyCron("0 * * * *", "Europe/Rome")).not.toThrow();
    expect(() => verifyCron("* * * * * *", null)).toThrow();
    expect(() => verifyCron("0 * * * *", "Mars/Olympus")).toThrow();
    expect(() => verifyCron("61 * * * *", null)).toThrow();
  });

  test("repeated schedule delivery for one slot is idempotent", () => {
    const db = store();
    const bot = db.addBot({ name: "Cron" });
    const schedule = db.addSchedule({ botId: bot.id, name: "Hourly", expression: "0 * * * *", prompt: "Review repo" });
    const when = new Date("2026-10-13T10:00:00Z");
    const first = db.enqueueSchedule(schedule.id, when);
    const second = db.enqueueSchedule(schedule.id, new Date("2026-10-13T10:00:30Z"));
    expect(first.id).toBe(second.id);
    expect(db.tasks()).toHaveLength(1);
    expect(first.status).toBe("awaiting_approval");
  });

  test("execution persists mock results and releases single-worker lock", async () => {
    const db = store();
    const bot = db.addBot({ name: "Mock" });
    let count = 0;
    const runtime = new BotRuntime(db, async (_, task) => { count++; return "done: " + task.prompt; });
    const a = db.addTask({ botId: bot.id, prompt: "A", requiresApproval: false });
    const b = db.addTask({ botId: bot.id, prompt: "B", requiresApproval: false });
    await runtime.tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    runtime.stop();
    expect(count).toBe(2);
    expect(db.getTask(a.id)?.result).toBe("done: A");
    expect(db.getTask(b.id)?.status).toBe("completed");
  });
});

describe("API security", () => {
  test("tokenless loopback API rejects DNS-rebinding hostnames", async () => {
    const db = store();
    const handle = createHandler(db, new BotRuntime(db, async () => "done"));
    for (const origin of ["http://attacker.invalid:4271", undefined]) {
      const request = new Request("http://attacker.invalid:4271/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ name: "Unauthorized" })
      });
      expect((await handle(request)).status).toBe(403);
    }
    expect(db.listBots()).toHaveLength(0);
    expect((await handle(new Request("http://127.0.0.1:4271/api/bots"))).status).toBe(200);
  });

  test("rejects oversized request body before JSON parsing", async () => {
    const db = store();
    const handle = createHandler(db, new BotRuntime(db, async () => "done"));
    const request = new Request("http://localhost:4271/api/bots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(70_000) })
    });
    const reply = await handle(request);
    expect(reply.status).toBe(400);
    expect((await reply.json()).error).toContain("size limit");
    expect(db.listBots()).toHaveLength(0);
  });
  test("bearer token protects both reads and mutations", async () => {
    const db = store();
    const runtime = new BotRuntime(db, async () => "done");
    const handle = createHandler(db, runtime, "a-secret-token");
    expect((await handle(new Request("http://localhost:4271/api/bots"))).status).toBe(401);
    const authorized = new Request("http://localhost:4271/api/bots", { headers: { Authorization: "Bearer a-secret-token" } });
    expect((await handle(authorized)).status).toBe(200);
    const badOrigin = new Request("http://localhost:4271/api/bots", { headers: { Authorization: "Bearer a-secret-token", Origin: "https://evil.invalid" } });
    expect((await handle(badOrigin)).status).toBe(403);
  });

  test("rejects non-JSON form CSRF and malformed bodies", async () => {
    const db = store();
    const runtime = new BotRuntime(db, async () => "done");
    const handle = createHandler(db, runtime);
    const nonJson = new Request("http://localhost:4271/api/bots", { method: "POST", headers: { "Content-Type": "text/plain" }, body: '{"name":"Injected"}' });
    expect((await handle(nonJson)).status).toBe(400);
    const json = new Request("http://localhost:4271/api/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"name":"QA","agent":"plan"}' });
    expect((await handle(json)).status).toBe(201);
    expect(db.listBots()).toHaveLength(1);
  });

  test("malicious HTML in model response is transmitted only as JSON data", async () => {
    const db = store();
    const bot = db.addBot({ name: "<script>bad()</script>" });
    const handle = createHandler(db, new BotRuntime(db, async () => ""));
    const reply = await handle(new Request("http://localhost:4271/api/bots"));
    expect(reply.headers.get("content-type")).toContain("application/json");
    expect((await reply.json())[0].name).toBe(bot.name);
    expect(reply.headers.get("content-security-policy")).toContain("script-src 'self'");
  });
});
