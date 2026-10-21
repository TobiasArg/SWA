import { fileTooLargeIssue, jsonParseIssue, type ValidationResult } from "../domain/validation/issues";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export async function readJsonFile(
  file: Pick<File, "size" | "text">,
): Promise<ValidationResult<unknown>> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, issues: [fileTooLargeIssue()] };
  }

  let source: string;
  try {
    source = await file.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file could not be read.";
    return { ok: false, issues: [jsonParseIssue(message)] };
  }

  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parser error";
    return { ok: false, issues: [jsonParseIssue(message)] };
  }
}
