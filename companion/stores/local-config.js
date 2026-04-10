import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { PROTOCOL_VERSION } from "../core/protocol.js";

const CONFIG_FILE = "config.json";
const PAIRING_TOKEN_TTL_MS = 15 * 60 * 1000;

export function defaultDirectResumeHome() {
  return process.env.DIRECT_RESUME_HOME || path.join(os.homedir(), ".direct-resume");
}

export async function ensureLocalConfig(options = {}) {
  const storeDir = options.storeDir || defaultDirectResumeHome();
  await fs.mkdir(storeDir, { recursive: true, mode: 0o700 });

  const configFile = path.join(storeDir, CONFIG_FILE);
  const existing = await readConfigFile(configFile);
  const config = normalizeConfig(existing, options);

  if (JSON.stringify(existing) !== JSON.stringify(config)) {
    await writeJson(configFile, config);
  }

  return {
    storeDir,
    configFile,
    config,
  };
}

export async function updateLocalConfig(updater, options = {}) {
  const { configFile, config } = await ensureLocalConfig(options);
  const next = normalizeConfig(await updater({ ...config }), options);
  await writeJson(configFile, next);
  return next;
}

export async function createPairingToken(options = {}) {
  const token = options.token || randomToken(24);
  const expiresAt = new Date(Date.now() + (options.ttlMs || PAIRING_TOKEN_TTL_MS)).toISOString();

  const config = await updateLocalConfig((current) => ({
    ...current,
    pairing_token: token,
    pairing_token_expires_at: expiresAt,
  }), options);

  return {
    token,
    expiresAt,
    config,
  };
}

export async function consumePairingToken(token, options = {}) {
  const normalizedToken = String(token || "").trim();
  const { config } = await ensureLocalConfig(options);

  if (!normalizedToken || normalizedToken !== config.pairing_token) {
    return {
      ok: false,
      reason: "invalid",
      config,
    };
  }

  const expiresAt = new Date(config.pairing_token_expires_at || 0);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      reason: "expired",
      config,
    };
  }

  const next = await updateLocalConfig((current) => ({
    ...current,
    pairing_token: null,
    pairing_token_expires_at: null,
  }), options);

  return {
    ok: true,
    config: next,
  };
}

async function readConfigFile(configFile) {
  try {
    return JSON.parse(await fs.readFile(configFile, "utf8"));
  }
  catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function normalizeConfig(config, options = {}) {
  const now = new Date().toISOString();
  const current = config && typeof config === "object" ? config : {};

  return {
    protocol_version: PROTOCOL_VERSION,
    machine_id: String(current.machine_id || options.machineId || randomUUID()),
    api_token: String(current.api_token || options.apiToken || randomToken(32)),
    created_at: current.created_at || now,
    exec: normalizeExecConfig(current.exec),
    pairing_token: current.pairing_token || null,
    pairing_token_expires_at: current.pairing_token_expires_at || null,
  };
}

function normalizeExecConfig(execConfig = {}) {
  const envEnabled = process.env.DIRECT_RESUME_EXEC === "1" || process.env.ISSUE_COMPANION_ALLOW_ITERM === "1";
  const envDisabled = process.env.DIRECT_RESUME_EXEC === "0" || process.env.ISSUE_COMPANION_ALLOW_ITERM === "0";
  const terminal = process.env.DIRECT_RESUME_TERMINAL || execConfig.terminal || "terminal";

  return {
    enabled: envDisabled ? false : Boolean(execConfig.enabled || envEnabled),
    terminal,
  };
}

function randomToken(byteLength) {
  return randomBytes(byteLength).toString("base64url");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
