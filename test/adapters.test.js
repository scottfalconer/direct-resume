import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { codexAdapter } from "../companion/adapters/codex.js";
import { claudeAdapter } from "../companion/adapters/claude.js";
import { drupalConnector } from "../companion/connectors/drupal.js";

test("Codex adapter discovers sessions from session_index.jsonl", async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-codex-"));
  await fs.writeFile(
    path.join(codexHome, "session_index.jsonl"),
    `${JSON.stringify({
      id: "codex-session-1",
      thread_name: "3558241 Canvas issue follow-up",
      updated_at: "2026-04-09T10:00:00.000Z",
    })}\n`,
    "utf8",
  );

  const workObject = drupalConnector.canonicalize({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
  });
  const candidates = await codexAdapter.discover(workObject, drupalConnector.aliases(workObject), { codexHome });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].agent, "codex");
  assert.equal(candidates[0].session_id, "codex-session-1");
  assert.equal(candidates[0].evidence[0].source, "codex.session_index");
});

test("Claude adapter discovers sessions from sessions-index.json files", async () => {
  const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "direct-resume-claude-"));
  const projectDir = path.join(claudeHome, "projects", "-Users-scott-dev-canvas");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "sessions-index.json"),
    JSON.stringify({
      version: 1,
      originalPath: "/Users/scott/dev/canvas",
      entries: [
        {
          sessionId: "claude-session-1",
          firstPrompt: "Review https://www.drupal.org/project/canvas/issues/3558241",
          summary: "Canvas issue 3558241 review",
          projectPath: "/Users/scott/dev/canvas",
          modified: "2026-04-09T11:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );

  const workObject = drupalConnector.canonicalize({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
  });
  const candidates = await claudeAdapter.discover(workObject, drupalConnector.aliases(workObject), { claudeHome });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].agent, "claude");
  assert.equal(candidates[0].session_id, "claude-session-1");
  assert.equal(candidates[0].workspace_path, "/Users/scott/dev/canvas");
});

test("agent adapters parse resume commands without accepting empty references", () => {
  assert.deepEqual(codexAdapter.parseSessionReference("codex resume codex-session-1"), {
    agent: "codex",
    session_id: "codex-session-1",
  });
  assert.deepEqual(claudeAdapter.parseSessionReference("claude --resume claude-session-1"), {
    agent: "claude",
    session_id: "claude-session-1",
  });
  assert.equal(codexAdapter.parseSessionReference("").session_id, null);
});
