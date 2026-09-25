import { describe, expect, it, vi } from "vitest";
import plugin from "../src/index.js";

type InternalHookOptions = {
  name?: string;
  description?: string;
};

describe("plugin registration contract", () => {
  it("registers the internal session patch hook and typed model-call observers", () => {
    const registerHook = vi.fn(
      (
        events: string | string[],
        _handler: (event: unknown) => unknown,
        opts?: InternalHookOptions,
      ) => {
        if (!opts?.name?.trim()) {
          throw new Error("hook registration missing name");
        }

        return { events, opts };
      },
    );

    const on = vi.fn();

    const api = {
      pluginConfig: { mode: "shadow" },
      registerHook,
      on,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };

    expect(() => plugin.register(api as never)).not.toThrow();

    expect(registerHook).toHaveBeenCalledTimes(1);
    expect(registerHook).toHaveBeenCalledWith(
      "session:patch",
      expect.any(Function),
      expect.objectContaining({
        name: "deterministic-router-session-patch",
        description: expect.any(String),
      }),
    );

    const options = registerHook.mock.calls[0]?.[2];
    expect(options?.name?.trim()).toBe("deterministic-router-session-patch");

    expect(on).toHaveBeenCalledWith("before_model_resolve", expect.any(Function));
    expect(on).toHaveBeenCalledWith("model_call_started", expect.any(Function));
    expect(on).toHaveBeenCalledWith("model_call_ended", expect.any(Function));
  });
});
