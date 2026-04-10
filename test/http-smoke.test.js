import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  createPairingToken,
  ensureLocalConfig,
} from "../companion/stores/local-config.js";

test("localhost API pairs, links, resolves, and returns copy resume actions", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-http-store-"));
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-http-codex-"));
  const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-http-claude-"));
  const port = 39000 + (process.pid % 1000);
  const baseUrl = `http://127.0.0.1:${port}`;

  await ensureLocalConfig({ storeDir, machineId: "machine-1", apiToken: "api-token-1" });
  await createPairingToken({ storeDir, token: "pair-token-1", ttlMs: 60_000 });
  await fs.writeFile(
    path.join(codexHome, "session_index.jsonl"),
    `${JSON.stringify({
      id: "codex-session-1",
      thread_name: "3558241 Canvas issue session",
      updated_at: "2026-04-09T12:00:00.000Z",
    })}\n`,
    "utf8",
  );

  const child = spawn(process.execPath, ["companion/server.js"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DIRECT_RESUME_HOME: storeDir,
      DIRECT_RESUME_CODEX_HOME: codexHome,
      DIRECT_RESUME_CLAUDE_HOME: claudeHome,
      DIRECT_RESUME_PORT: String(port),
      DIRECT_RESUME_DISABLE_LEGACY_SYNC: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(baseUrl, child);

    const paired = await postJson(`${baseUrl}/api/pair`, {
      pairing_token: "pair-token-1",
    });
    assert.equal(paired.api_token, "api-token-1");

    const linkPayload = {
      url: "https://www.drupal.org/project/canvas/issues/3558241",
      agent: "codex",
      session_id: "codex-session-1",
      workspace_path: "/Users/scott/dev/canvas",
    };
    const linked = await postJson(`${baseUrl}/api/link`, linkPayload, paired.api_token);
    assert.equal(linked.binding.work_object_id, "drupal:canvas:3558241");
    assert.equal(linked.resolved.state, "one_match");

    const resolved = await postJson(`${baseUrl}/api/resolve`, {
      url: "https://www.drupal.org/project/canvas/issues/3558241",
    }, paired.api_token);
    assert.equal(resolved.state, "one_match");

    const resumed = await postJson(`${baseUrl}/api/resume`, {
      candidate_ref: resolved.candidates[0].candidate_ref,
      mode: "copy",
    }, paired.api_token);
    assert.equal(resumed.action.type, "copy_command");
    assert.equal(resumed.action.command, "cd '/Users/scott/dev/canvas' && codex resume codex-session-1");
  }
  finally {
    child.kill();
  }
});

async function waitForHealth(baseUrl, child) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (child.exitCode !== null) {
      throw new Error(`Companion exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    }
    catch {
      // Retry until the server starts listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for companion health endpoint.");
}

async function postJson(url, body, token = null) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `Request failed with status ${response.status}`);
  }
  return payload;
}
