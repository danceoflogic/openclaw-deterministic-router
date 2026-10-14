import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../src/index.js";

describe("OpenClaw operator.read authorization", () => {
  const disposals: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of disposals.splice(0)) cleanup();
  });

  it("allows a read-scoped caller and denies a caller with no operator scope", async () => {
    // OpenClaw 2026.9.8 is pinned in this project's devDependencies. Exercise
    // its shipped Gateway scope predicate rather than a local reimplementation.
    const distDir = new URL("../node_modules/openclaw/dist/", import.meta.url);
    const serverStartNames = readdirSync(distDir).filter((name) => name.startsWith("server-start-") && name.endsWith(".mjs"));
    expect(serverStartNames).toHaveLength(1);
    const serverStartSource = readFileSync(new URL(serverStartNames[0]!, distDir), "utf8");
    const methodScopesImport = serverStartSource.match(/(?:from\s+|import\s+)"\.\/(method-scopes-[^\"]+\.mjs)"/);
    expect(methodScopesImport?.[1]).toBeDefined();
    const scopeModule = await import(pathToFileURL(new URL(methodScopesImport![1]!, distDir).pathname).href);
    const authorizeRequiredScope = scopeModule.r as (
      requiredScope: string,
      scopes: string[],
    ) => { allowed: boolean; missingScope?: string };

    expect(authorizeRequiredScope("operator.read", ["operator.read"])).toEqual({ allowed: true });
    expect(authorizeRequiredScope("operator.read", [])).toEqual({
      allowed: false,
      missingScope: "operator.read",
    });
  });

  it("uses the pinned Gateway pre-dispatch authorization with the registered status handler", async () => {
    const distDir = new URL("../node_modules/openclaw/dist/", import.meta.url);
    const gatewayMethods = await import(pathToFileURL(new URL("server-methods-CTM0-Ih6.mjs", distDir).pathname).href);
    const registryModule = await import(pathToFileURL(new URL("registry-CAoo0u-p.mjs", distDir).pathname).href);
    const registrations: Array<{ name: string; handler: (ctx: unknown) => void; options: { scope: string; profileAccess: string } }> = [];
    const rawSessionKey = "synthetic-private-session-key";
    const sessionKeyHash = createHash("sha256").update(rawSessionKey, "utf8").digest("hex");
    plugin.register({
      id: "deterministic-router",
      pluginConfig: { mode: "shadow", autoSessionKeyHashes: [sessionKeyHash] },
      registerGatewayMethod: (name: string, handler: (ctx: unknown) => void, options: { scope: string; profileAccess: string }) => registrations.push({ name, handler, options }),
      registerHook: () => undefined,
      on: () => undefined,
      lifecycle: { onDispose: (cleanup: () => void) => { disposals.push(cleanup); } },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    } as never);
    const registration = registrations.find(({ name }) => name === "deterministic-router.status");
    expect(registration?.options.scope).toBe("operator.read");
    expect(registration?.options.profileAccess).toBe("independent");
    expect(registration).toBeDefined();

    let calls = 0;
    const handler = (ctx: unknown) => { calls += 1; registration!.handler(ctx); };
    const methodRegistry = registryModule.n([{
      name: registration!.name, handler, scope: registration!.options.scope,
      owner: { kind: "plugin", pluginId: "deterministic-router" }, profileAccess: registration!.options.profileAccess,
    }]);
    const context = { getRuntimeConfig: () => ({}), getCommittedRuntimeConfig: () => ({}) };
    const authorize = async (scopes: string[]) => gatewayMethods.authorizeGatewayRequestPreDispatch({
      method: registration!.name, requestParams: {}, methodRegistry, context,
      client: { connect: { role: "operator", scopes }, authenticatedGitHubIdentitySync: async () => undefined },
    });

    expect(methodRegistry.requiresAuthenticatedProfile(registration!.name)).toBe(false);

    const denied = await authorize([]);
    expect(denied.error).toMatchObject({ details: { missingScope: "operator.read" } });
    expect(calls).toBe(0);

    const allowed = await authorize(["operator.read"]);
    expect(allowed.error).toBeNull();
    const response: { ok?: boolean; payload?: unknown; error?: unknown } = {};
    handler({ respond: (ok: boolean, payload: unknown, error?: unknown) => Object.assign(response, { ok, payload, error }) });
    expect(calls).toBe(1);
    expect(response).toMatchObject({ ok: true, payload: {
      status: "available", pluginId: "deterministic-router", mode: "shadow", effectiveMode: "shadow",
      protectManualSelection: true, requireSessionKeyForAuto: true, autoSessionAllowlistCount: 1,
    } });
    const serializedResponse = JSON.stringify(response);
    expect(serializedResponse).not.toContain(rawSessionKey);
    expect(serializedResponse).not.toContain(sessionKeyHash);
    expect(Object.keys(response.payload as object)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/raw.?session.?key|session.?key.?hash|hash/i),
    ]));
  });
});
