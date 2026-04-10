import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isClosedUpstreamStatus,
  isTrackedLocalStatus,
  readTrackedBeads,
  syncClosedBeads,
} from "../companion/lib/closed-beads.js";

test("isTrackedLocalStatus keeps non-terminal local beads in scope", () => {
  assert.equal(isTrackedLocalStatus("open"), true);
  assert.equal(isTrackedLocalStatus("blocked"), true);
  assert.equal(isTrackedLocalStatus("in_progress"), true);
  assert.equal(isTrackedLocalStatus("closed"), false);
  assert.equal(isTrackedLocalStatus("tombstone"), false);
});

test("isClosedUpstreamStatus recognizes terminal Drupal.org statuses", () => {
  assert.equal(isClosedUpstreamStatus("Closed (fixed)"), true);
  assert.equal(isClosedUpstreamStatus("Closed (duplicate)"), true);
  assert.equal(isClosedUpstreamStatus("Fixed"), true);
  assert.equal(isClosedUpstreamStatus("Needs review"), false);
});

test("readTrackedBeads ignores closed and tombstoned local beads", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "issue-companion-closed-beads-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const beadsDir = path.join(workspaceRoot, ".beads");
  await fs.mkdir(beadsDir, { recursive: true });

  await fs.writeFile(
    path.join(beadsDir, "issues.jsonl"),
    [
      JSON.stringify({
        id: "bead-open",
        title: "3558241 - Open issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558241",
        status: "open",
      }),
      JSON.stringify({
        id: "bead-blocked",
        title: "3558242 - Blocked issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558242",
        status: "blocked",
      }),
      JSON.stringify({
        id: "bead-closed",
        title: "3558243 - Closed issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558243",
        status: "closed",
      }),
      JSON.stringify({
        id: "bead-tombstone",
        title: "3558244 - Tombstone issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558244",
        status: "tombstone",
      }),
    ].join("\n"),
    "utf8",
  );

  const tracked = await readTrackedBeads({ workspaceRoot });

  assert.deepEqual(
    tracked.map((item) => ({ beadId: item.beadId, issueId: item.issueId, localStatus: item.localStatus })),
    [
      { beadId: "bead-open", issueId: "3558241", localStatus: "open" },
      { beadId: "bead-blocked", issueId: "3558242", localStatus: "blocked" },
    ],
  );
});

test("syncClosedBeads closes stale local beads when apply=true", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "issue-companion-sync-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const beadsDir = path.join(workspaceRoot, ".beads");
  await fs.mkdir(beadsDir, { recursive: true });

  await fs.writeFile(
    path.join(beadsDir, "issues.jsonl"),
    [
      JSON.stringify({
        id: "bead-open",
        title: "3558241 - Open issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558241",
        status: "open",
      }),
      JSON.stringify({
        id: "bead-blocked",
        title: "3558242 - Blocked issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558242",
        status: "blocked",
      }),
      JSON.stringify({
        id: "bead-tombstone",
        title: "3558244 - Tombstone issue",
        description: "Issue URL: https://www.drupal.org/project/canvas/issues/3558244",
        status: "tombstone",
      }),
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const result = await syncClosedBeads({
    workspaceRoot,
    dorgScript: "/tmp/fake-dorg.py",
    apply: true,
    execFileImpl: async (command, args) => {
      calls.push({ command, args });

      if (command === "python" && args.includes("3558241")) {
        return {
          stdout: JSON.stringify({
            title: "3558241 - Open issue",
            status: { label: "Fixed" },
            url: "https://www.drupal.org/node/3558241",
          }),
        };
      }

      if (command === "python" && args.includes("3558242")) {
        return {
          stdout: JSON.stringify({
            title: "3558242 - Blocked issue",
            status: { label: "Needs work" },
            url: "https://www.drupal.org/node/3558242",
          }),
        };
      }

      if (command === "bd" && args[0] === "close") {
        return {
          stdout: JSON.stringify({
            ok: true,
            id: args[1],
          }),
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.checked, 2);
  assert.equal(result.closedCount, 1);
  assert.equal(result.wouldCloseCount, 0);
  assert.deepEqual(
    result.items.map((item) => ({ beadId: item.beadId, action: item.action, upstreamStatus: item.upstreamStatus })),
    [
      { beadId: "bead-open", action: "closed", upstreamStatus: "Fixed" },
      { beadId: "bead-blocked", action: "keep_open", upstreamStatus: "Needs work" },
    ],
  );
  assert.equal(calls.filter((call) => call.command === "bd").length, 1);
  assert.equal(calls.filter((call) => call.command === "python").length, 2);
});
