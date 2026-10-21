import type { Architecture, ArchitectureFile } from "../domain/types";
import { createId } from "../domain/ids";
import { parseArchitectureFile } from "../domain/validation";
import type { ImportResult } from "./types";
import { readJsonFile } from "./readFile";
import type { Repository } from "../persistence/types";

const MAX_NAME_LENGTH = 50_000;

function importedArchitectureId(): string {
  return createId("arch");
}

async function nextAvailableArchitectureId(repo: Repository): Promise<string> {
  while (true) {
    const id = importedArchitectureId();
    if (!(await repo.exists(id))) return id;
  }
}

async function putWithoutOverwrite(repo: Repository, file: ArchitectureFile): Promise<boolean> {
  const collisionSafeRepository = repo as Repository & {
    putIfAbsent?: (candidate: ArchitectureFile) => Promise<boolean>;
  };
  if (collisionSafeRepository.putIfAbsent) {
    return collisionSafeRepository.putIfAbsent(file);
  }
  if (await repo.exists(file.architecture.id)) return false;
  await repo.put(file);
  return true;
}

function importedName(name: string): string {
  const suffix = " (imported)";
  return `${name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
}

export async function importArchitectureFile(
  file: File,
  repo: Repository,
  now: () => string,
): Promise<ImportResult> {
  const loaded = await readJsonFile(file);
  if (!loaded.ok) return loaded;

  const parsed = parseArchitectureFile(loaded.value);
  if (!parsed.ok) return parsed;

  const original = parsed.value.architecture;
  let architecture: Architecture = original;
  let renamed = false;

  if (await repo.exists(original.id)) {
    architecture = {
      ...original,
      id: await nextAvailableArchitectureId(repo),
      name: importedName(original.name),
    };
    renamed = true;
  }

  const updatedAt = now();
  while (true) {
    const fileToSave: ArchitectureFile = {
      schemaVersion: parsed.value.schemaVersion,
      architecture: { ...architecture, updatedAt },
    };
    if (await putWithoutOverwrite(repo, fileToSave)) {
      return { ok: true, file: fileToSave, renamed };
    }

    architecture = {
      ...architecture,
      id: await nextAvailableArchitectureId(repo),
      ...(renamed ? {} : { name: importedName(original.name) }),
    };
    renamed = true;
  }
}
