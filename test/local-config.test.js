import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  consumePairingToken,
  createPairingToken,
  ensureLocalConfig,
} from "../companion/stores/local-config.js";

test("ensureLocalConfig creates a stable machine id and api token", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-config-"));

  const first = await ensureLocalConfig({ storeDir, machineId: "machine-1", apiToken: "api-1" });
  const second = await ensureLocalConfig({ storeDir, machineId: "machine-2", apiToken: "api-2" });

  assert.equal(first.config.protocol_version, 1);
  assert.equal(first.config.machine_id, "machine-1");
  assert.equal(first.config.api_token, "api-1");
  assert.equal(second.config.machine_id, "machine-1");
  assert.equal(second.config.api_token, "api-1");
});

test("pairing tokens are single-use and return the api token", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-pairing-"));
  await ensureLocalConfig({ storeDir, machineId: "machine-1", apiToken: "api-1" });
  const pairing = await createPairingToken({ storeDir, token: "pair-1", ttlMs: 60_000 });

  assert.equal(pairing.token, "pair-1");

  const accepted = await consumePairingToken("pair-1", { storeDir });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.config.api_token, "api-1");

  const rejected = await consumePairingToken("pair-1", { storeDir });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "invalid");
});

test("expired pairing tokens are rejected distinctly", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-expired-pairing-"));
  await createPairingToken({ storeDir, token: "pair-1", ttlMs: -1 });

  const result = await consumePairingToken("pair-1", { storeDir });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "expired");
});

test("runtime exec env overrides are not persisted to config", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-runtime-exec-"));
  const prior = process.env.DIRECT_RESUME_EXEC;

  try {
    process.env.DIRECT_RESUME_EXEC = "1";
    const effective = await ensureLocalConfig({ storeDir, machineId: "machine-1", apiToken: "api-1" });
    assert.equal(effective.config.exec.enabled, true);

    const stored = JSON.parse(await fs.readFile(path.join(storeDir, "config.json"), "utf8"));
    assert.equal(stored.exec.enabled, false);
  }
  finally {
    if (prior === undefined) {
      delete process.env.DIRECT_RESUME_EXEC;
    }
    else {
      process.env.DIRECT_RESUME_EXEC = prior;
    }
  }
});
