import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenCodeExecutor } from "../src/runtime";
import { BotStore } from "../src/store";

const created: string[] = [];
const stores: BotStore[] = [];
const pending: Promise<unknown>[] = [];

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "ocb-process-"));
  created.push(folder);
  const script = join(folder, "fake-opencode.ts");
  const started = join(folder, "started");
  writeFileSync(script, `
import { writeFileSync } from "node:fs";
const [mode, started] = process.argv.slice(2);
if (mode === "slow") {
  writeFileSync(started, "ready");
  await Bun.sleep(1800);
  writeFileSync(started + ".late", "unsafe late side effect");
  console.log(JSON.stringify({ type: "text", part: { text: "stale attempt" } }));
} else {
  console.log(JSON.stringify({ type: "text", part: { text: "fresh attempt" } }));
}
`);
  return { script, started };
}

async function waitFor(path: string, timeout = 2500): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!existsSync(path) && Date.now() < deadline) await Bun.sleep(25);
  if (!existsSync(path)) throw new Error("Fake CLI never reached ready state");
}

async function assertNoLateSideEffect(started: string): Promise<void> {
  // The fake subprocess writes .late 1800 ms after it starts. Wait beyond
  // that deadline to prove we killed it, rather than checking too early.
  const readyAt = statSync(started).mtimeMs;
  await Bun.sleep(Math.max(0, readyAt + 2300 - Date.now()));
  expect(existsSync(started + ".late")).toBe(false);
}
afterEach(async () => {
  await Promise.allSettled(pending.splice(0));
  for (const db of stores.splice(0)) db.close();
  for (const folder of created.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("real spawned worker cancellation", () => {
  test("immediate retry does not hide the cancellation of the old process", async () => {
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Process test" });
    const task = db.addTask({ botId: bot.id, prompt: "Do a task" });
    db.approve(task.id);
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: (_bot, active) => [process.execPath, script, active.attempts === 0 ? "slow" : "quick", started],
      timeoutMs: 5000
    });

    const first = execute(bot, claimed, [], db);
    pending.push(first);
    await waitFor(started);
    db.cancel(task.id);
    expect(db.retry(task.id).status).toBe("awaiting_approval");

    await expect(Promise.race([
      first,
      Bun.sleep(1250).then(() => { throw new Error("Cancelled worker still running"); })
    ])).rejects.toThrow("Task cancelled or superseded by retry");
    await assertNoLateSideEffect(started);

    db.approve(task.id);
    const next = db.claim()!;
    expect(next.attempts).toBe(1);
    const answer = await execute(bot, next, [], db);
    expect(answer).toBe("fresh attempt");
    db.complete(next.id, answer);
    expect(db.getTask(task.id)?.status).toBe("completed");
    expect(db.events().filter((event) => event.type === "task_completed")).toHaveLength(1);
  });

  test("timeout terminates a real spawned CLI before its delayed side effect", async () => {
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Timeout test" });
    const task = db.addTask({ botId: bot.id, prompt: "Stall", requiresApproval: false });
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "slow", started],
      timeoutMs: 900
    });
    await expect(execute(bot, claimed, [], db)).rejects.toThrow("timed out");
    expect(existsSync(started)).toBe(true);
    await assertNoLateSideEffect(started);
  });
  test("test harness cannot disable its own timeout with invalid values", () => {
    for (const timeoutMs of [0, -1, Infinity, NaN, 3_600_001]) {
      expect(() => createOpenCodeExecutor({ timeoutMs })).toThrow("Test timeout override");
    }
  });
});
