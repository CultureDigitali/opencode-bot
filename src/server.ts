import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { BotStore } from "./store";
import { BotRuntime } from "./runtime";

type Payload = Record<string, unknown>;
const MAX_BODY_BYTES = 64_000;
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

function matchesToken(expected: string, supplied: string | null): boolean {
  if (!supplied?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(supplied.slice(7));
  const actual = Buffer.from(expected);
  return provided.length === actual.length && timingSafeEqual(provided, actual);
}

function isLocal(host: string): boolean {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
}

async function payload(request: Request): Promise<Payload> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  const declared = Number(request.headers.get("Content-Length"));
  if (declared > MAX_BODY_BYTES) throw new Error("Request body exceeds size limit");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel("Body limit exceeded");
        throw new Error("Request body exceeds size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object");
  return parsed as Payload;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") throw new Error("Expected boolean value");
  return value;
}

export function createHandler(store: BotStore, runtime: BotRuntime, token = "") {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const route = url.pathname;
    if (request.method === "GET" && route === "/health") {
      return json({ status: "ok", service: "opencode-bot", version: "0.1.0" });
    }
    if (request.method === "GET" && ["/", "/dashboard.js", "/dashboard.css"].includes(route)) {
      const filename = route === "/" ? "dashboard.html" : route.slice(1);
      const file = Bun.file(join(import.meta.dir, filename));
      if (!(await file.exists())) return json({ error: "Asset not available" }, 404);
      return new Response(file, { headers: { ...headers, "Content-Type": filename.endsWith(".html") ? "text/html; charset=utf-8" : filename.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8" } });
    }
    if (token && !matchesToken(token, request.headers.get("Authorization"))) {
      return json({ error: "Bearer token required" }, 401);
    }
    const origin = request.headers.get("Origin");
    if (origin) {
      try {
        if (new URL(origin).host !== url.host) return json({ error: "Cross-origin requests are disabled" }, 403);
      } catch {
        return json({ error: "Invalid Origin" }, 403);
      }
    }
    if (!route.startsWith("/api/")) return json({ error: "Not found" }, 404);
    try {
      if (request.method === "GET" && route === "/api/status") return json(store.stats());
      if (request.method === "GET" && route === "/api/bots") return json(store.listBots());
      if (request.method === "POST" && route === "/api/bots") {
        const body = await payload(request);
        return json(store.addBot({ name: body.name as string, instructions: body.instructions as string, model: body.model as string, agent: body.agent as string }), 201);
      }
      if (request.method === "GET" && route === "/api/tasks") return json(store.tasks(Number(url.searchParams.get("limit") || 100)));
      if (request.method === "POST" && route === "/api/tasks") {
        const body = await payload(request);
        const created = store.addTask({
          botId: body.botId as string,
          prompt: body.prompt as string,
          requiresApproval: asBoolean(body.requiresApproval, true),
          handoffBotId: (body.handoffBotId as string | null) || null
        });
        if (created.status === "queued") void runtime.tick();
        return json(created, 201);
      }
      if (request.method === "GET" && route === "/api/events") {
        const after = Number(url.searchParams.get("after") || 0);
        return json(store.events(Number.isFinite(after) ? after : 0));
      }
      if (request.method === "GET" && route === "/api/schedules") return json(store.schedules());
      if (request.method === "POST" && route === "/api/schedules") {
        const body = await payload(request);
        const schedule = store.addSchedule({
          botId: body.botId as string, name: body.name as string, expression: body.expression as string,
          timezone: body.timezone as string | null, prompt: body.prompt as string,
          autoApprove: asBoolean(body.autoApprove, false)
        });
        runtime.reloadSchedules();
        return json(schedule, 201);
      }
      const taskMatch = route.match(/^\/api\/tasks\/([0-9a-f-]{36})(?:\/(approve|cancel|retry))?$/i);
      if (taskMatch) {
        const id = taskMatch[1]!;
        if (request.method === "GET" && !taskMatch[2]) {
          const task = store.getTask(id);
          return task ? json(task) : json({ error: "Task not found" }, 404);
        }
        if (request.method === "POST") {
          switch (taskMatch[2]) {
            case "approve": {
              const task = store.approve(id);
              void runtime.tick();
              return json(task);
            }
            case "cancel": return json(store.cancel(id));
            case "retry": {
              const task = store.retry(id);
              if (task.status === "queued") void runtime.tick();
              return json(task);
            }
          }
        }
      }
      const scheduleMatch = route.match(/^\/api\/schedules\/([0-9a-f-]{36})\/(enable|disable|run-now)$/i);
      if (scheduleMatch && request.method === "POST") {
        const id = scheduleMatch[1]!;
        const action = scheduleMatch[2]!;
        if (action === "run-now") {
          const created = store.enqueueSchedule(id);
          if (created.status === "queued") void runtime.tick();
          return json(created, 201);
        }
        const schedule = store.toggleSchedule(id, action === "enable");
        runtime.reloadSchedules();
        return json(schedule);
      }
      const memoryMatch = route.match(/^\/api\/bots\/([0-9a-f-]{36})\/memory(?:\/([a-zA-Z0-9_-]{1,80}))?$/i);
      if (memoryMatch) {
        const botId = memoryMatch[1]!;
        if (request.method === "GET" && !memoryMatch[2]) return json(store.memory(botId));
        if (request.method === "PUT" && memoryMatch[2]) {
          const body = await payload(request);
          store.addMemory(botId, memoryMatch[2], body.content as string);
          return json({ status: "saved" });
        }
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      if (error instanceof SyntaxError) return json({ error: "Malformed JSON" }, 400);
      const notFound = /^(Unknown bot|Unknown handoff bot|Unknown schedule)/.test(message);
      const conflict = /cannot be|not awaiting approval|Handoff depth exceeded/.test(message);
      return json({ error: message }, notFound ? 404 : conflict ? 409 : 400);
    }
  };
}

if (import.meta.main) {
  const host = process.env.OPENCODE_BOT_HOST || "127.0.0.1";
  const token = process.env.OPENCODE_BOT_TOKEN || "";
  const port = Number(process.env.OPENCODE_BOT_PORT || 4271);
  if (!isLocal(host) && !token) throw new Error("LAN binding requires OPENCODE_BOT_TOKEN");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid TCP port");
  const store = new BotStore();
  const runtime = new BotRuntime(store);
  const server = Bun.serve({ hostname: host, port, fetch: createHandler(store, runtime, token) });
  runtime.start();
  console.log("OpenCode Bot ready at " + server.url + " (API " + (token ? "token protected" : "loopback only") + ")");
  const stop = async () => {
    runtime.stop();
    await runtime.waitForIdle();
    server.stop();
    store.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
