import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { extractIssueId, parseStructuredDescription } from "./issue-context.js";

const execFileAsync = promisify(execFile);

export function isTrackedLocalStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return Boolean(normalized) && !["closed", "tombstone"].includes(normalized);
}

export function isClosedUpstreamStatus(statusLabel) {
  const normalized = String(statusLabel || "").trim();
  return /^closed\b/i.test(normalized) || /^fixed$/i.test(normalized);
}

export async function readTrackedBeads({
  workspaceRoot,
  beadsFile = path.join(workspaceRoot, ".beads", "issues.jsonl"),
} = {}) {
  let raw;
  try {
    raw = await fs.readFile(beadsFile, "utf8");
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      }
      catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((issue) => isTrackedLocalStatus(issue.status))
    .map((issue) => {
      const fields = parseStructuredDescription(issue.description);
      const issueId = extractIssueId(fields.issueUrl || issue.title || issue.description || "");
      return issueId
        ? {
            beadId: issue.id,
            issueId,
            title: issue.title,
            localStatus: issue.status,
            issueUrl: fields.issueUrl || null,
          }
        : null;
    })
    .filter(Boolean);
}

export async function fetchUpstreamIssueSummary(issueId, {
  workspaceRoot,
  dorgScript,
  execFileImpl = execFileAsync,
} = {}) {
  const { stdout } = await execFileImpl(
    "python",
    [dorgScript, "--format", "json", "issue", issueId, "--mode", "summary", "--comments", "1"],
    {
      cwd: workspaceRoot,
      maxBuffer: 5 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout);
  return {
    issueId,
    title: parsed.title || `Issue ${issueId}`,
    upstreamStatus: parsed.status?.label || null,
    updatedAt: parsed.updated || null,
    issueUrl: parsed.url || null,
  };
}

export async function closeTrackedBead(beadId, reason, {
  workspaceRoot,
  execFileImpl = execFileAsync,
} = {}) {
  const { stdout } = await execFileImpl(
    "bd",
    ["close", beadId, "--reason", reason, "--json"],
    {
      cwd: workspaceRoot,
      maxBuffer: 5 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout);
}

export async function syncClosedBeads({
  workspaceRoot,
  dorgScript,
  beadsFile = path.join(workspaceRoot, ".beads", "issues.jsonl"),
  apply = false,
  execFileImpl = execFileAsync,
} = {}) {
  const tracked = await readTrackedBeads({ workspaceRoot, beadsFile });
  const results = [];

  for (const bead of tracked) {
    const upstream = await fetchUpstreamIssueSummary(bead.issueId, {
      workspaceRoot,
      dorgScript,
      execFileImpl,
    });
    const shouldClose = isClosedUpstreamStatus(upstream.upstreamStatus);
    const result = {
      beadId: bead.beadId,
      issueId: bead.issueId,
      title: bead.title,
      localStatus: bead.localStatus,
      upstreamStatus: upstream.upstreamStatus,
      issueUrl: upstream.issueUrl || bead.issueUrl,
      action: shouldClose ? (apply ? "closed" : "would_close") : "keep_open",
    };

    if (shouldClose && apply) {
      result.closeResult = await closeTrackedBead(
        bead.beadId,
        `Upstream Drupal.org issue ${bead.issueId} is ${upstream.upstreamStatus}; closing stale local bead.`,
        {
          workspaceRoot,
          execFileImpl,
        },
      );
    }

    results.push(result);
  }

  return {
    apply,
    checked: results.length,
    closedCount: results.filter((item) => item.action === "closed").length,
    wouldCloseCount: results.filter((item) => item.action === "would_close").length,
    items: results,
  };
}
