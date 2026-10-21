import { describe, expect, it, vi } from "vitest";
import { MAX_IMPORT_FILE_BYTES, readJsonFile } from "./readFile";

describe("JSON file reader", () => {
  it("rejects oversized files before reading any content", async () => {
    const text = vi.fn(async () => "{}" );
    const result = await readJsonFile({ size: MAX_IMPORT_FILE_BYTES + 1, text });

    expect(result).toMatchObject({ ok: false, issues: [{ code: "E_FILE_TOO_LARGE" }] });
    expect(text).not.toHaveBeenCalled();
  });

  it("reads and parses files at the allowed size boundary", async () => {
    const text = vi.fn(async () => "{\"ok\":true}");
    const result = await readJsonFile({ size: MAX_IMPORT_FILE_BYTES, text });

    expect(result).toEqual({ ok: true, value: { ok: true } });
    expect(text).toHaveBeenCalledOnce();
  });

  it("returns a JSON parse issue for malformed files", async () => {
    const result = await readJsonFile({ size: 4, text: async () => "nope" });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "E_JSON_PARSE" }] });
  });

  it("maps file read failures to a user-readable issue", async () => {
    const result = await readJsonFile({
      size: 1,
      text: async () => {
        throw new Error("Permission denied");
      },
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "E_JSON_PARSE", message: "The file is not valid JSON (Permission denied)." }],
    });
  });
});
