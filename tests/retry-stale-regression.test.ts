import { describe, expect, test } from "bun:test";
import { BotRuntime } from "../src/runtime";
import { BotStore } from "../src/store";

describe("stale executor attempt isolation", () => {
  for (const outcome of ["success", "failure"] as const) {
    test("obsolete " + outcome + " cannot mutate a newer claimed retry", async () => {
      const db = new BotStore(":memory:");
      try {
        const bot = db.addBot({ name: "Race regression" });
        const task = db.addTask({ botId: bot.id, prompt: "Race", requiresApproval: false });
        let settle!: () => void;
        const pending = new Promise<string>((resolve, reject) => {
          settle = () => outcome === "success" ? resolve("stale output") : reject(new Error("stale failure"));
        });
        const runtime = new BotRuntime(db, async () => pending);
        const firstTick = runtime.tick();
        expect(db.getTask(task.id)?.status).toBe("running");
        db.cancel(task.id);
        expect(db.retry(task.id).attempts).toBe(1);
        expect(db.claim()?.attempts).toBe(1);
        settle();
        await firstTick;
        expect(db.getTask(task.id)?.status).toBe("running");
        expect(db.getTask(task.id)?.result).toBeNull();
        expect(db.getTask(task.id)?.error).toBeNull();
        expect(db.events().filter(event => event.type === "task_completed" || event.type === "task_failed")).toHaveLength(0);
        runtime.stop();
      } finally {
        db.close();
      }
    });
  }
});
describe("atomic claimed-attempt fencing", () => {
  test("database rejects completion and failure from an obsolete attempt", () => {
    const db = new BotStore(":memory:");
    try {
      const bot = db.addBot({ name: "Fence" });
      const task = db.addTask({ botId: bot.id, prompt: "Fence", requiresApproval: false });
      expect(db.claim()?.attempts).toBe(0);
      db.cancel(task.id);
      db.retry(task.id);
      expect(db.claim()?.attempts).toBe(1);
      expect(() => db.complete(task.id, "stale", 0)).toThrow();
      expect(() => db.fail(task.id, "stale", 0)).toThrow();
      expect(db.getTask(task.id)?.status).toBe("running");
      expect(db.getTask(task.id)?.result).toBeNull();
      expect(db.getTask(task.id)?.error).toBeNull();
      expect(db.complete(task.id, "fresh", 1).result).toBe("fresh");
    } finally {
      db.close();
    }
  });
  test("runtime shutdown does not cancel a newer attempt claimed elsewhere", async () => {
    const db = new BotStore(":memory:");
    try {
      const bot = db.addBot({ name: "Fence" });
      const task = db.addTask({ botId: bot.id, prompt: "Fence", requiresApproval: false });
      let finish!: (value: string) => void;
      const pending = new Promise<string>((resolve) => { finish = resolve; });
      const runtime = new BotRuntime(db, async () => pending);
      const firstTick = runtime.tick();
      db.cancel(task.id);
      db.retry(task.id);
      expect(db.claim()?.attempts).toBe(1);
      runtime.stop();
      expect(db.getTask(task.id)?.status).toBe("running");
      finish("stale");
      await firstTick;
      expect(db.getTask(task.id)?.status).toBe("running");
    } finally {
      db.close();
    }
  });
});

describe("claimed attempt snapshot", () => {
  test("executor mutation of its task argument cannot alter persistence provenance", async () => {
    const db = new BotStore(":memory:");
    try {
      const bot = db.addBot({ name: "Snapshot" });
      const task = db.addTask({ botId: bot.id, prompt: "Snapshot", requiresApproval: false });
      const runtime = new BotRuntime(db, async (_, claimed) => {
        claimed.attempts = 100;
        return "legitimate result";
      });
      await runtime.tick();
      expect(db.getTask(task.id)?.status).toBe("completed");
      expect(db.getTask(task.id)?.result).toBe("legitimate result");
      runtime.stop();
    } finally {
      db.close();
    }
  });
});
