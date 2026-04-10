import fs from "node:fs/promises";
import path from "node:path";

import {
  defaultDirectResumeHome,
  ensureLocalConfig,
} from "./local-config.js";

const BINDINGS_FILE = "bindings.json";
const BINDING_STATES = Object.freeze(["active", "stale", "hidden", "pruned"]);

export async function ensureLocalStore(options = {}) {
  const { storeDir, config } = await ensureLocalConfig(options);
  await ensureJsonFile(path.join(storeDir, BINDINGS_FILE), []);

  return {
    storeDir,
    config,
    bindingsFile: path.join(storeDir, BINDINGS_FILE),
  };
}

export async function readLocalBindings(options = {}) {
  const { bindingsFile } = await ensureLocalStore(options);
  const raw = await fs.readFile(bindingsFile, "utf8");
  return JSON.parse(raw);
}

export async function upsertLocalBinding(binding, options = {}) {
  const { bindingsFile, config } = await ensureLocalStore(options);
  const normalized = normalizeBinding(binding, config.machine_id);
  const existing = await readLocalBindings({ ...options, storeDir: path.dirname(bindingsFile) });
  const next = existing.filter(
    (item) =>
      !(
        item.work_object_id === normalized.work_object_id &&
        item.machine_id === normalized.machine_id &&
        item.agent === normalized.agent &&
        item.session_id === normalized.session_id
      ),
  );

  next.push(normalized);
  await writeJson(bindingsFile, next);
  return normalized;
}

export async function updateBindingState(binding, state, options = {}) {
  assertValidBindingState(state);
  const { bindingsFile } = await ensureLocalStore(options);
  const existing = await readLocalBindings(options);
  const next = existing.map((item) => {
    if (
      item.work_object_id === binding.work_object_id &&
      item.machine_id === binding.machine_id &&
      item.agent === binding.agent &&
      item.session_id === binding.session_id
    ) {
      return { ...item, state };
    }
    return item;
  });

  await writeJson(bindingsFile, next);
  return next;
}

async function ensureJsonFile(filePath, value) {
  try {
    await fs.access(filePath);
  }
  catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    await writeJson(filePath, value, 0o600);
  }
}

function normalizeBinding(binding, machineId) {
  const now = new Date().toISOString();
  const normalized = {
    work_object_id: requireString(binding.work_object_id, "work_object_id"),
    machine_id: machineId,
    agent: requireString(binding.agent, "agent"),
    session_id: requireString(binding.session_id, "session_id"),
    workspace_path: requireString(binding.workspace_path, "workspace_path"),
    created_at: binding.created_at || now,
    last_seen_at: binding.last_seen_at || now,
    last_verified_at: binding.last_verified_at || now,
    state: binding.state || "active",
  };

  assertValidBindingState(normalized.state);
  return normalized;
}

function assertValidBindingState(state) {
  if (!BINDING_STATES.includes(state)) {
    throw new Error(`Unsupported local binding state: ${state}`);
  }
}

async function writeJson(filePath, value, mode = 0o600) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode,
  });
}

function requireString(value, fieldName) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`LocalSessionBinding requires ${fieldName}.`);
  }
  return normalized;
}

function isMissingFile(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}
