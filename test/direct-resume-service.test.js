import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DirectResumeService } from "../companion/core/direct-resume-service.js";
import { readLocalBindings } from "../companion/stores/local-bindings.js";

function fakeAdapter(livenessState = "live") {
  return {
    agent: "codex",
    displayName: "Codex",
    async discover() {
      return [];
    },
    async isLive() {
      return {
        state: livenessState,
        checked_at: "2026-04-09T00:00:00.000Z",
      };
    },
    parseSessionReference(value) {
      return {
        agent: "codex",
        session_id: String(value).replace(/^codex resume\s+/, ""),
      };
    },
    buildResumeAction(candidate, mode) {
      return {
        type: mode === "exec" ? "visible_terminal" : "copy_command",
        mode,
        agent: "codex",
        command: `cd ${candidate.workspace_path} && codex resume ${candidate.session_id}`,
        workspace_path: candidate.workspace_path,
      };
    },
  };
}

test("service links an explicit session and resolves it without exposing raw commands", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-service-"));
  const service = new DirectResumeService({
    adapters: [fakeAdapter()],
    storeOptions: { storeDir, machineId: "machine-1" },
  });
  const input = {
    url: "https://www.drupal.org/project/canvas/issues/3558241",
    agent: "codex",
    session_id: "codex-session-1",
    workspace_path: "/Users/scott/dev/canvas",
  };

  const linked = await service.link(input);
  assert.equal(linked.binding.work_object_id, "drupal:canvas:3558241");

  const resolved = await service.resolve(input);
  assert.equal(resolved.state, "one_match");
  assert.equal(resolved.candidates[0].agent, "codex");
  assert.equal(resolved.candidates[0].session_id, "codex-session-1");
  assert.equal(resolved.candidates[0].match_type, "explicit");
  assert.equal("command" in resolved.candidates[0], false);
});

test("service resumes candidates through opaque candidate references", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-service-resume-"));
  const service = new DirectResumeService({
    adapters: [fakeAdapter()],
    storeOptions: { storeDir, machineId: "machine-1" },
  });
  await service.link({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
    agent: "codex",
    session_id: "codex-session-1",
    workspace_path: "/Users/scott/dev/canvas",
  });
  const resolved = await service.resolve({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
  });

  const resumed = await service.resume({
    candidate_ref: resolved.candidates[0].candidate_ref,
    mode: "copy",
  });

  assert.equal(resumed.action.type, "copy_command");
  assert.equal(resumed.action.command, "cd /Users/scott/dev/canvas && codex resume codex-session-1");
});

test("service marks stale explicit bindings instead of returning broken matches", async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-service-stale-"));
  const liveService = new DirectResumeService({
    adapters: [fakeAdapter("live")],
    storeOptions: { storeDir, machineId: "machine-1" },
  });
  await liveService.link({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
    agent: "codex",
    session_id: "codex-session-1",
    workspace_path: "/Users/scott/dev/canvas",
  });

  const staleService = new DirectResumeService({
    adapters: [fakeAdapter("stale")],
    storeOptions: { storeDir, machineId: "machine-1" },
  });
  const resolved = await staleService.resolve({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
  });

  assert.equal(resolved.state, "no_match");
  assert.equal((await readLocalBindings({ storeDir }))[0].state, "stale");
});
