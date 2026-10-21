import { describe, expect, it, vi } from "vitest";
import { createId } from "./ids";

describe("createId", () => {
  it("adds the requested domain prefix to a UUID", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("4ad9d4b9-1a2b-4a5d-98e2-889e32f574c1");

    expect(createId("cmp")).toBe("cmp_4ad9d4b9-1a2b-4a5d-98e2-889e32f574c1");
  });
});
