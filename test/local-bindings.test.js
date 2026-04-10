import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ensureLocalStore,
  readLocalBindings,
  updateBindingState,
  upsertLocalBinding,
} from "../companion/stores/local-bindings.js";

test("ensureLocalStore creates config and bindings files with a stable machine id", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-store-"));

  const first = await ensureLocalStore({ storeDir, machineId: "test-machine" });
  const second = await ensureLocalStore({ storeDir, machineId: "ignored-machine" });

  assert.equal(first.config.protocol_version, 1);
  assert.equal(first.config.machine_id, "test-machine");
  assert.equal(second.config.machine_id, "test-machine");
  assert.deepEqual(JSON.parse(await fs.readFile(first.bindingsFile, "utf8")), []);
});

test("upsertLocalBinding writes explicit local session bindings with workspace paths", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-binding-"));
  const binding = await upsertLocalBinding(
    {
      work_object_id: "drupal:canvas:3558241",
      agent: "codex",
      session_id: "session-1",
      workspace_path: "/Users/scott/dev/canvas",
    },
    { storeDir, machineId: "test-machine" },
  );

  assert.equal(binding.machine_id, "test-machine");
  assert.equal(binding.workspace_path, "/Users/scott/dev/canvas");
  assert.equal(binding.state, "active");
  assert.equal(typeof binding.last_verified_at, "string");
  assert.deepEqual(await readLocalBindings({ storeDir }), [binding]);
});

test("upsertLocalBinding replaces the same local binding instead of duplicating it", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-upsert-"));
  await upsertLocalBinding(
    {
      work_object_id: "jira:acquia.atlassian.net:PROS-370",
      agent: "claude",
      session_id: "session-1",
      workspace_path: "/tmp/old",
    },
    { storeDir, machineId: "test-machine" },
  );
  const updated = await upsertLocalBinding(
    {
      work_object_id: "jira:acquia.atlassian.net:PROS-370",
      agent: "claude",
      session_id: "session-1",
      workspace_path: "/tmp/new",
      last_seen_at: "2026-04-09T00:00:00.000Z",
    },
    { storeDir, machineId: "test-machine" },
  );

  const bindings = await readLocalBindings({ storeDir });
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].workspace_path, "/tmp/new");
  assert.equal(bindings[0].last_seen_at, "2026-04-09T00:00:00.000Z");
  assert.deepEqual(bindings[0], updated);
});

test("updateBindingState marks bindings stale, hidden, or pruned", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-state-"));
  const binding = await upsertLocalBinding(
    {
      work_object_id: "drupal:canvas:3558241",
      agent: "codex",
      session_id: "session-1",
      workspace_path: "/Users/scott/dev/canvas",
    },
    { storeDir, machineId: "test-machine" },
  );

  await updateBindingState(binding, "stale", { storeDir });
  assert.equal((await readLocalBindings({ storeDir }))[0].state, "stale");

  await updateBindingState(binding, "hidden", { storeDir });
  assert.equal((await readLocalBindings({ storeDir }))[0].state, "hidden");

  await updateBindingState(binding, "pruned", { storeDir });
  assert.equal((await readLocalBindings({ storeDir }))[0].state, "pruned");
});

test("updateBindingState rejects unsupported lifecycle states", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-invalid-state-"));
  const binding = await upsertLocalBinding(
    {
      work_object_id: "drupal:canvas:3558241",
      agent: "codex",
      session_id: "session-1",
      workspace_path: "/Users/scott/dev/canvas",
    },
    { storeDir, machineId: "test-machine" },
  );

  await assert.rejects(
    () => updateBindingState(binding, "deleted", { storeDir }),
    /Unsupported local binding state: deleted/,
  );
});
