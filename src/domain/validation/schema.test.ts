import { expect, it, vi } from "vitest";
import { cloneFixture } from "./__fixtures__/fixtureFactory";

it("enables jitless mode before constructing any architecture object schema", async () => {
  vi.resetModules();
  const { z } = await import("zod");
  const previousJitless = z.config().jitless;
  const configure = vi.fn(z.config);
  const object = vi.fn(z.object);
  vi.doMock("zod", () => ({ z: { ...z, config: configure, object } }));

  try {
    // Start with the default mode so prior imports cannot hide late configuration.
    z.config({ jitless: false });
    const { parseArchitectureShape } = await import("./schema");

    expect(configure).toHaveBeenCalledWith({ jitless: true });
    expect(object).toHaveBeenCalled();
    for (const callOrder of object.mock.invocationCallOrder) {
      expect(callOrder).toBeGreaterThan(configure.mock.invocationCallOrder[0]!);
    }
    expect(z.config().jitless).toBe(true);
    expect(parseArchitectureShape(cloneFixture()).ok).toBe(true);
    expect(parseArchitectureShape({}).ok).toBe(false);
  } finally {
    z.config({ jitless: previousJitless });
    vi.doUnmock("zod");
    vi.resetModules();
  }
});
