import { describe, expect, it } from "vitest";
import { editorHref, parseHash } from "./router";

describe("parseHash", () => {
  it("routes the root and unknown hashes to the library", () => {
    expect(parseHash("")).toEqual({ name: "library" });
    expect(parseHash("#/")).toEqual({ name: "library" });
    expect(parseHash("#/settings")).toEqual({ name: "library" });
    expect(parseHash("#/a/")).toEqual({ name: "library" });
    expect(parseHash("#/a/x/y")).toEqual({ name: "library" });
    expect(parseHash("#/a/%E0%A4%A")).toEqual({ name: "library" });
  });

  it("routes #/a/<id> to the editor and decodes the id", () => {
    expect(parseHash("#/a/arch_1")).toEqual({ name: "editor", id: "arch_1" });
    expect(parseHash(editorHref("odd id/with ? and #"))).toEqual({ name: "editor", id: "odd id/with ? and #" });
  });
});
