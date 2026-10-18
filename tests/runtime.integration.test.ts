import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createOpenCodeExecutor } from "../src/runtime";
import { BotStore } from "../src/store";

const created: string[] = [];
const stores: BotStore[] = [];
const pending: Promise<unknown>[] = [];
const runnerDirectories: string[] = [];

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
} else if (mode === "tree") {
  Bun.spawn([process.execPath, import.meta.path, "grandchild", started], {
    stdin: "ignore", stdout: "inherit", stderr: "inherit"
  });
  writeFileSync(started, "ready");
  await Bun.sleep(3000);
} else if (mode === "escaped") {
  // POSIX process-group escape: the grandchild still inherits both pipes.
  Bun.spawn([process.execPath, import.meta.path, "grandchild", started], {
    detached: true, stdin: "ignore", stdout: "inherit", stderr: "inherit"
  });
  writeFileSync(started, "ready");
  await Bun.sleep(3000);
} else if (mode === "grandchild") {
  writeFileSync(started + ".grandchild", "ready");
  await Bun.sleep(1800);
  writeFileSync(started + ".late", "surviving grandchild side effect");
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

function buildFreshWindowsRunner(): string {
  const built = Bun.spawnSync([
    "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    join(process.cwd(), "scripts", "windows", "build-runner.ps1")
  ], { stdout: "pipe", stderr: "pipe" });
  expect(built.exitCode).toBe(0);
  const runner = new TextDecoder().decode(built.stdout).trim().split(/\r?\n/).at(-1) ?? "";
  expect(existsSync(runner)).toBe(true);
  const buildDir = dirname(runner);
  expect(resolve(dirname(buildDir))).toBe(resolve(tmpdir()));
  expect(/^ocb-job-runner-[0-9a-f]{32}$/.test(buildDir.split(/[\\/]/).at(-1) ?? "")).toBe(true);
  runnerDirectories.push(buildDir);
  return runner;
}
function windowsRunnerDigest(runner: string): string {
  return createHash("sha256").update(readFileSync(runner)).digest("hex");
}

let runnerBuiltForTests: string | undefined;
function windowsRunnerPath(): string {
  const configured = process.env.OPENCODE_BOT_WINDOWS_JOB_RUNNER;
  if (configured) {
    expect(existsSync(configured)).toBe(true);
    return configured;
  }
  // Run from a fresh checkout or in isolation without relying on old artifacts.
  runnerBuiltForTests ??= buildFreshWindowsRunner();
  return runnerBuiltForTests;
}
afterEach(async () => {
  await Promise.allSettled(pending.splice(0));
  for (const db of stores.splice(0)) db.close();
  for (const folder of created.splice(0)) rmSync(folder, { recursive: true, force: true });
});
afterAll(() => {
  for (const dir of runnerDirectories) {
    // Only touch uniquely named build folders directly under OS temp.
    if (resolve(dirname(dir)) === resolve(tmpdir()) &&
        /^ocb-job-runner-[0-9a-f]{32}$/.test(dir.split(/[\\/]/).at(-1) ?? "")) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("real spawned worker cancellation", () => {
  test("overdue completed result is rejected even when a deadline callback never fires", async () => {
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Late-result deadline test" });
    const task = db.addTask({ botId: bot.id, prompt: "Classify overdue process completion", requiresApproval: false });
    const claimed = db.claim()!;
    let clockReads = 0;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "quick", started], timeoutMs: 900,
      nowMs: () => (clockReads++ === 0 ? 0 : 901)
    });
    await expect(execute(bot, claimed, [], db)).rejects.toThrow("timed out");
    expect(clockReads).toBe(2);
  });

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
  test("Windows native helper cannot regress to a post-creation job assignment", () => {
    // The supervisor-kill test below checks containment after the child
    // starts. It cannot catch a suspended, unassigned orphan killed in the
    // tiny window BEFORE the old AssignProcessToJobObject call. Keep this
    // structural regression alongside the real process-tree tests.
    const source = readFileSync(join(process.cwd(), "scripts", "windows", "JobRunner.cs"), "utf8");
    expect(source).toContain("PROC_THREAD_ATTRIBUTE_JOB_LIST");
    expect(source).toContain("EXTENDED_STARTUPINFO_PRESENT");
    expect(source).toContain("UpdateProcThreadAttribute(");
    expect(source).not.toMatch(/\bAssignProcessToJobObject\s*\(/);
    expect(source).not.toMatch(/\bResumeThread\s*\(/);
    expect(source).not.toMatch(/\bCREATE_SUSPENDED\b/);
  });
  const windowsTest = process.platform === "win32" ? test : test.skip;
  windowsTest("Windows runner builder never reuses a source-hash-only cached executable", () => {
    const first = buildFreshWindowsRunner();
    const second = buildFreshWindowsRunner();
    expect(first).not.toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  }, 20000); // Two separate C# compilations exceed Bun's 5s default on loaded Windows hosts.
  windowsTest("Windows helper rejects tampering before launching a process", async () => {
    const runner = buildFreshWindowsRunner();
    const expected = windowsRunnerDigest(runner);
    const { appendFileSync } = await import("node:fs");
    appendFileSync(runner, "tampered-build");
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Runner hash rejection" });
    const task = db.addTask({ botId: bot.id, prompt: "Must not execute", requiresApproval: false });
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "slow", started],
      timeoutMs: 900, windowsJobRunner: runner, windowsJobRunnerSha256: expected
    });
    await expect(execute(bot, claimed, [], db)).rejects.toThrow("SHA-256 mismatch");
    expect(existsSync(started)).toBe(false);
  });
  windowsTest("Windows runner rejects an unpaired override and an oversized executable", async () => {
    const runner = buildFreshWindowsRunner();
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Native runner validation" });
    const task = db.addTask({ botId: bot.id, prompt: "Must not execute", requiresApproval: false });
    const claimed = db.claim()!;
    const command = () => [process.execPath, script, "slow", started];
    // Even if local CI set an ambient digest, an explicit path override must
    // supply its own matching digest rather than inheriting unrelated trust.
    await expect(createOpenCodeExecutor({ command, windowsJobRunner: runner, timeoutMs: 900 })(
      bot, claimed, [], db
    )).rejects.toThrow("requires its own SHA-256");
    await expect(createOpenCodeExecutor({
      command, windowsJobRunner: "", windowsJobRunnerSha256: "0".repeat(64), timeoutMs: 900
    })(bot, claimed, [], db)).rejects.toThrow("configured without a runner path");
    const oversized = join(dirname(script), "oversized-runner.exe");
    writeFileSync(oversized, "");
    truncateSync(oversized, 33 * 1024 * 1024);
    await expect(createOpenCodeExecutor({
      command, windowsJobRunner: oversized, windowsJobRunnerSha256: "0".repeat(64), timeoutMs: 900
    })(bot, claimed, [], db)).rejects.toThrow("32 MiB");
    expect(existsSync(started)).toBe(false);
  });
  windowsTest("Windows Job Object enforces a deadline and stops inherited-pipe grandchildren", async () => {
    const runner = windowsRunnerPath();
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Windows process tree test" });
    const task = db.addTask({ botId: bot.id, prompt: "Long-running child", requiresApproval: false });
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "tree", started],
      timeoutMs: 900,
      windowsJobRunner: runner,
      windowsJobRunnerSha256: windowsRunnerDigest(runner)
    });
    const running = execute(bot, claimed, [], db);
    pending.push(running);
    await waitFor(started + ".grandchild");
    // The supervisor owns the native deadline; Bun retains a later watchdog.
    // Assert its specific timeout signal, plus no descendant side effects.
    await expect(running).rejects.toThrow("Windows Job Object");
    await assertNoLateSideEffect(started);
  });
  windowsTest("Windows Job Object contains detached grandchildren without late side effects", async () => {
    const runner = windowsRunnerPath();
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Windows detached descendant test" });
    const task = db.addTask({ botId: bot.id, prompt: "Stop detached child", requiresApproval: false });
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "escaped", started],
      timeoutMs: 900,
      windowsJobRunner: runner,
      windowsJobRunnerSha256: windowsRunnerDigest(runner)
    });
    const running = execute(bot, claimed, [], db);
    pending.push(running);
    await waitFor(started + ".grandchild");
    await expect(running).rejects.toThrow("Windows Job Object");
    await assertNoLateSideEffect(started);
  });
  windowsTest("force-killing the Windows supervisor closes the job and kills descendants", async () => {
    const runner = windowsRunnerPath();
    const { script, started } = fixture();
    // Kill ONLY the supervisor PID. /T would conceal an incorrectly configured
    // kill-on-close Job Object by making taskkill clean up descendants itself.
    const supervisor = Bun.spawn([runner, "7000", process.execPath, script, "tree", started], {
      stdin: "ignore", stdout: "ignore", stderr: "ignore"
    });
    const exit = supervisor.exited;
    pending.push(exit);
    try {
      await waitFor(started + ".grandchild");
      const killed = Bun.spawnSync(["taskkill", "/PID", String(supervisor.pid), "/F"], {
        stdin: "ignore", stdout: "ignore", stderr: "ignore"
      });
      expect(killed.exitCode).toBe(0);
      await Promise.race([
        exit,
        Bun.sleep(3000).then(() => { throw new Error("Windows supervisor did not exit after termination"); })
      ]);
      await assertNoLateSideEffect(started);
    } finally {
      // If the assertion fails, only touch the exact helper PID created here.
      if (supervisor.exitCode === null) {
        try { supervisor.kill(); } catch { /* already terminated */ }
      }
    }
  });
  const posixTest = process.platform === "win32" ? test.skip : test;
  posixTest("POSIX timeout stops ordinary inherited-pipe grandchildren", async () => {
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "POSIX tree test" });
    const task = db.addTask({ botId: bot.id, prompt: "Stall", requiresApproval: false });
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "tree", started], timeoutMs: 900
    });
    const running = execute(bot, claimed, [], db);
    pending.push(running);
    await waitFor(started + ".grandchild");
    await expect(running).rejects.toThrow("timed out");
    await assertNoLateSideEffect(started);
  });
  posixTest("escaped POSIX descendant holding pipes cannot block worker completion", async () => {
    const { script, started } = fixture();
    const db = new BotStore(":memory:");
    stores.push(db);
    const bot = db.addBot({ name: "Escaped child test" });
    const task = db.addTask({ botId: bot.id, prompt: "Stall", requiresApproval: false });
    const claimed = db.claim()!;
    const execute = createOpenCodeExecutor({
      command: () => [process.execPath, script, "escaped", started], timeoutMs: 900
    });
    const running = execute(bot, claimed, [], db);
    pending.push(running);
    await waitFor(started + ".grandchild");
    await expect(Promise.race([
      running,
      Bun.sleep(1600).then(() => { throw new Error("Escaped pipe holder blocked worker slot"); })
    ])).rejects.toThrow("timed out");
    // Process-group signals are not an OS sandbox. The intentionally escaped
    // fixture remains alive briefly, then exits before test teardown.
    await waitFor(started + ".late", 3000);
  });
  test("test harness cannot disable its own timeout with invalid values", () => {
    for (const timeoutMs of [0, -1, Infinity, NaN, 3_600_001]) {
      expect(() => createOpenCodeExecutor({ timeoutMs })).toThrow("Test timeout override");
    }
  });
});
