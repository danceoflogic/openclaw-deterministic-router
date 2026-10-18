import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { proposeStageRoute } from "../src/stage-routing.js";

// Opt-in, ZERO inference: the real installed Codex talks only to a loopback
// scripted provider. This verifies the update API, NOT a stage-routing hook or
// execution by real models. No OpenClaw process, credentials or config is used.
const binary = process.env.ISSUE42_CODEX_BIN;
const catalogPath = process.env.ISSUE42_MODEL_CATALOG;
type Message = Record<string, any>;

class Rpc {
  private id = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private queued: Message[] = [];
  private waiters: Array<{ method: string; resolve: (value: Message) => void; reject: (error: Error) => void }> = [];
  constructor(readonly child: ChildProcessWithoutNullStreams) {
    createInterface({ input: child.stdout }).on("line", (line) => {
      const message = JSON.parse(line) as Message;
      if (message.id !== undefined && !message.method) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(JSON.stringify(message.error)));
        else pending?.resolve(message.result);
      } else {
        const index = this.waiters.findIndex((entry) => entry.method === message.method);
        if (index >= 0) this.waiters.splice(index, 1)[0]!.resolve(message);
        else this.queued.push(message);
      }
    });
    child.on("exit", (code) => {
      for (const entry of this.pending.values()) entry.reject(new Error(`Codex exited: ${code}`));
      this.pending.clear();
      for (const entry of this.waiters) entry.reject(new Error(`Codex exited: ${code}`));
      this.waiters = [];
    });
  }
  send(message: Message): void { this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  request(method: string, params: Message): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ id, method, params });
    });
  }
  next(method: string): Promise<Message> {
    const index = this.queued.findIndex((entry) => entry.method === method);
    if (index >= 0) return Promise.resolve(this.queued.splice(index, 1)[0]!);
    return new Promise((resolve, reject) => this.waiters.push({ method, resolve, reject }));
  }
}

it.skipIf(!binary || !catalogPath)("installed Codex publishes turn settings before a held tool is released (mock provider only)", async () => {
  const home = await mkdtemp(join(tmpdir(), "issue42-offline-"));
  const requests: Message[] = [];
  const ordering: string[] = [];
  let child: ChildProcessWithoutNullStreams | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stderr = "";
  let serverError: unknown;
  const server = createServer(async (req, res) => {
    try {
      if (req.url !== "/v1/responses" || req.method !== "POST") {
        throw new Error(`Unexpected offline request: ${req.method} ${req.url}`);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Message;
      requests.push(body);
      const n = requests.length;
      if (n > 3) throw new Error("Offline request budget exceeded (no retries allowed)");
      ordering.push(`request:${body.model}`);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const emit = (event: Message) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      emit({ type: "response.created", response: { id: `r${n}` } });
      emit({ type: "response.output_item.done", item: n < 3
        ? { type: "function_call", call_id: `call${n}`, name: "offline_pause", arguments: "{}" }
        : { type: "message", role: "assistant", id: "final", content: [{ type: "output_text", text: "offline task complete" }] } });
      emit({ type: "response.completed", response: { id: `r${n}`, usage: {
        input_tokens: 0, output_tokens: 0, total_tokens: 0,
      } } });
      ordering.push(`mock-response-completed:${n}`);
      res.end();
    } catch (error) {
      serverError = error;
      res.writeHead(500).end();
    }
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No loopback listener");
    const catalog = JSON.parse(await readFile(catalogPath!, "utf8"));
    const template = catalog.models.find((model: Message) => model.slug === "gpt-5.5");
    if (!template) throw new Error("Expected upstream 0.160.0 bundled metadata fixture");
    const sol = { provider: "openai", model: "gpt-6-sol" };
    const luna = { provider: "openai", model: "gpt-6-luna" };
    // Deliberately identical synthetic metadata: this does NOT verify real-model
    // compatibility, entitlement, or OpenClaw's per-request permission checks.
    await writeFile(join(home, "models.json"), JSON.stringify({ models: [sol, luna].map(
      ({ model }) => ({ ...template, slug: model }),
    ) }));
    await writeFile(join(home, "config.toml"), `
model = "gpt-6-sol"
model_provider = "offline"
model_catalog_json = ${JSON.stringify(join(home, "models.json"))}
approval_policy = "never"
sandbox_mode = "read-only"
model_reasoning_effort = "low"
[features]
step_model_switching = true
shell_tool = false
[analytics]
enabled = false
[model_providers.offline]
name = "Loopback scripted provider (no inference)"
base_url = "http://127.0.0.1:${address.port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
`);
    child = spawn(binary!, ["app-server", "--listen", "stdio://"], {
      cwd: home,
      env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: home, OTEL_SDK_DISABLED: "true" },
      stdio: "pipe",
    });
    // Enforce cleanup even if the protocol stops producing messages. Vitest's
    // outer timeout alone would not unwind a blocked RPC or kill its process.
    deadline = setTimeout(() => child?.kill("SIGKILL"), 20_000);
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    const rpc = new Rpc(child);
    await rpc.request("initialize", { clientInfo: { name: "issue42_offline", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    rpc.send({ method: "initialized" });
    const { thread } = await rpc.request("thread/start", {
      model: sol.model, cwd: home, experimentalRawEvents: false,
      dynamicTools: [{ type: "function", name: "offline_pause", description: "Offline test barrier, not a stage hook", inputSchema: { type: "object", properties: {} } }],
    });
    const { turn } = await rpc.request("turn/start", { threadId: thread.id,
      input: [{ type: "text", text: "offline-context-marker" }] });
    let currentModel = sol;
    for (const [index, nextObjective] of [
      "Summarise this note into three concise bullets. ".repeat(100),
      "Prove this theorem formally, step by step, and derive the result.",
    ].entries()) {
      const call = await rpc.next("item/tool/call");
      expect(call.params).toMatchObject({ threadId: thread.id, turnId: turn.id, tool: "offline_pause" });
      expect(requests).toHaveLength(index + 1);
      const proposal = proposeStageRoute({ experimentalEnabled: true,
        manualSelectionState: "clear", originalTier: "REASONING", originalModel: sol,
        currentModel, eligibleModels: [sol, luna],
        // Synthetic test authority ONLY; the pending tool is not a genuine
        // all-tools-settled boundary. Never expose this as a runtime adapter.
        boundary: { responseCompleted: true, toolsSettled: true, objectiveChanged: true, nextObjective },
      }, DEFAULT_PLUGIN_CONFIG);
      expect(proposal.shouldRequestChange).toBe(true);
      const outcome = await rpc.request("turn/settings/update", {
        threadId: thread.id, turnId: turn.id, model: proposal.proposedModel.model,
      });
      expect(outcome).toEqual({ status: "applied" });
      ordering.push(`settings-applied:${proposal.proposedModel.model}`);
      expect(requests).toHaveLength(index + 1);
      currentModel = proposal.proposedModel;
      rpc.send({ id: call.id, result: { success: true, contentItems: [
        { type: "inputText", text: `offline-tool-receipt-${index + 1}` },
      ] } });
      ordering.push(`tool-released:${index + 1}`);
    }
    const completed = await rpc.next("turn/completed");
    expect(completed.params.turn).toMatchObject({ id: turn.id, status: "completed" });
    expect(serverError).toBeUndefined();
    expect(requests.map((body) => body.model)).toEqual([sol.model, luna.model, sol.model]);
    expect(JSON.stringify(requests[2]!.input)).toContain("offline-context-marker");
    expect(JSON.stringify(requests[2]!.input)).toContain("offline-tool-receipt-1");
    expect(JSON.stringify(requests[2]!.input)).toContain("offline-tool-receipt-2");
    expect(ordering.indexOf(`settings-applied:${luna.model}`)).toBeLessThan(ordering.indexOf(`request:${luna.model}`));
    expect(ordering.lastIndexOf(`settings-applied:${sol.model}`)).toBeLessThan(ordering.lastIndexOf(`request:${sol.model}`));
    console.info("OFFLINE ONLY: installed Codex accepted updates; loopback request bodies Sol -> Luna -> Sol; one completed turn; context/tool receipts intact. No real models executed and no stage hook verified.");
  } catch (error) {
    throw new Error(`${String(error)}\n${stderr}`);
  } finally {
    clearTimeout(deadline);
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
      child.kill("SIGKILL");
      await exited;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
}, 30_000);
