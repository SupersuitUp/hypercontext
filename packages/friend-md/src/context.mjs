import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// A portable package never discovers a global Freedom installation or another person's root.
export const resolveWorkspace = (root = process.cwd()) => resolve(root);

export function paths(root = process.cwd()) {
  root = resolveWorkspace(root);
  const configFile = join(root, ".freedom.json");
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, "utf8")) : {};
  const override = config.paths ?? {};
  if (!override || typeof override !== "object" || Array.isArray(override)) throw new Error("config paths must be an object");
  const result = { root };
  for (const key of ["people", "self", "user"]) {
    const value = override[key] ?? key;
    if (typeof value !== "string" || !value.trim()) throw new Error(`config paths.${key} must be a directory`);
    result[key] = resolve(root, value);
  }
  return result;
}

export const selfDir = (root) => paths(root).self;

export function workspaceFile(root, key) {
  if (key !== "self.md") throw new Error(`unsupported record file: ${key}`);
  const p = paths(root);
  const fresh = join(p.self, "self.md");
  const legacy = join(p.user, "USER.md");
  return existsSync(fresh) ? fresh : existsSync(legacy) ? legacy : fresh;
}
