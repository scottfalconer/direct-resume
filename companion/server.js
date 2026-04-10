import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  defaultRoots,
  extractIssueId,
  getIssueContext,
  parseStructuredDescription,
} from "./lib/issue-context.js";
import {
  isClosedUpstreamStatus,
  syncClosedBeads,
} from "./lib/closed-beads.js";
import { detectITermLaunchCapability, openCommandInITerm, shellQuote } from "./lib/iterm.js";

const HOST = process.env.ISSUE_COMPANION_HOST || "127.0.0.1";
const PORT = Number(process.env.ISSUE_COMPANION_PORT || 38551);
const execFileAsync = promisify(execFile);
const DORG_SCRIPT = "/Users/scott/.agents/skills/drupal-issue-queue/scripts/dorg.py";
const DASHBOARD_CACHE_TTL_MS = 15_000;
const REMOTE_ISSUE_CACHE_TTL_MS = 30 * 60 * 1000;
const CLOSED_BEAD_SYNC_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.ISSUE_COMPANION_CLOSED_BEAD_SYNC_INTERVAL_MS || 60 * 60 * 1000),
);
const ALLOW_ITERM_LAUNCH = (() => {
  if (process.env.ISSUE_COMPANION_ALLOW_ITERM === "0") {
    return false;
  }
  if (process.env.ISSUE_COMPANION_ALLOW_ITERM === "1") {
    return true;
  }
  return detectITermLaunchCapability();
})();
const roots = defaultRoots();
const cache = new Map();
const dashboardCache = new Map();
const remoteIssueCache = new Map();
const closedBeadSyncState = {
  inFlight: null,
  lastCheckedAt: 0,
  lastResult: null,
};

function jsonResponse(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function resolveContext(issueId) {
  const cached = cache.get(issueId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < 15000) {
    return cached.context;
  }

  const context = await getIssueContext(issueId, roots, {
    allowITermLaunch: ALLOW_ITERM_LAUNCH,
  });
  cache.set(issueId, { cachedAt: now, context });
  return context;
}

function previewText(text, maxLength = 220) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function isoTimestamp(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readReadyBeads() {
  const { stdout } = await execFileAsync("bd", ["ready", "--json"], {
    cwd: roots.workspaceRoot,
    maxBuffer: 5 * 1024 * 1024,
  });

  const items = JSON.parse(stdout);
  const deduped = new Map();

  items
    .map((item) => {
      const descriptionFields = parseStructuredDescription(item.description);
      const issueId = extractIssueId(descriptionFields.issueUrl || item.title || item.description || "");
      return {
        beadId: item.id,
        title: item.title,
        issueId,
        localStatus: item.status || null,
        issueType: item.issue_type || null,
        updatedAt: isoTimestamp(item.updated_at || item.created_at),
        descriptionFields,
      };
    })
    .filter((item) => item.issueId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .forEach((item) => {
      if (!deduped.has(item.issueId)) {
        deduped.set(item.issueId, item);
      }
    });

  return [...deduped.values()];
}

function pickLatestComment(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return null;
  }

  const chosen = comments.find((comment) => String(comment.body_markdown || "").trim()) || comments[0];
  const body = previewText(chosen.body_markdown, 240);
  if (!body) {
    return null;
  }

  return {
    author: chosen.author_name || null,
    createdAt: isoTimestamp(chosen.created),
    body,
  };
}

async function fetchRemoteIssueSummary(issueId) {
  const cached = remoteIssueCache.get(issueId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < REMOTE_ISSUE_CACHE_TTL_MS) {
    return cached.data;
  }

  const { stdout } = await execFileAsync(
    "python",
    [DORG_SCRIPT, "--format", "json", "issue", issueId, "--mode", "summary", "--comments", "5"],
    {
      cwd: roots.workspaceRoot,
      maxBuffer: 5 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout);
  const data = {
    issueId,
    title: parsed.title || `Issue ${issueId}`,
    issueUrl: parsed.url || `https://www.drupal.org/node/${issueId}`,
    upstreamStatus: parsed.status?.label || null,
    updatedAt: isoTimestamp(parsed.updated),
    latestComment: pickLatestComment(parsed.latest_comments),
  };

  remoteIssueCache.set(issueId, { cachedAt: now, data });
  return data;
}

async function resolveDashboardBeads() {
  const cached = dashboardCache.get("ready");
  const now = Date.now();
  if (cached && now - cached.cachedAt < DASHBOARD_CACHE_TTL_MS) {
    return cached.items;
  }

  const readyBeads = await readReadyBeads();
  const items = [];

  for (const bead of readyBeads) {
    const context = await resolveContext(bead.issueId);
    const remote = await fetchRemoteIssueSummary(bead.issueId);
    items.push({
      beadId: bead.beadId,
      issueId: bead.issueId,
      title: remote.title || context.primary.title || bead.title,
      issueUrl: remote.issueUrl || context.primary.issueUrl,
      upstreamStatus: remote.upstreamStatus,
      isClosed: isClosedUpstreamStatus(remote.upstreamStatus),
      upstreamUpdatedAt: remote.updatedAt,
      latestComment: remote.latestComment,
      localStatus: bead.localStatus,
      issueType: bead.issueType,
      updatedAt: bead.updatedAt || context.primary.updatedAt,
      conversationSummary:
        context.primary.conversationSummary ||
        context.primary.intent ||
        context.sessions[0]?.firstPrompt ||
        null,
      nextStep: context.primary.nextStep,
      suggestedCommand: context.primary.suggestedCommand,
      suggestedAction: context.primary.suggestedAction,
    });
  }

  items.sort((left, right) => {
    if (left.isClosed !== right.isClosed) {
      return left.isClosed ? 1 : -1;
    }
    return String(right.upstreamUpdatedAt || right.updatedAt).localeCompare(
      String(left.upstreamUpdatedAt || left.updatedAt),
    );
  });

  dashboardCache.set("ready", { cachedAt: now, items });
  return items;
}

function clearLocalCaches() {
  cache.clear();
  dashboardCache.clear();
}

async function maybeSyncClosedBeads() {
  const now = Date.now();

  if (closedBeadSyncState.inFlight) {
    return closedBeadSyncState.inFlight;
  }

  if (
    closedBeadSyncState.lastCheckedAt &&
    now - closedBeadSyncState.lastCheckedAt < CLOSED_BEAD_SYNC_INTERVAL_MS
  ) {
    return closedBeadSyncState.lastResult;
  }

  closedBeadSyncState.lastCheckedAt = now;
  closedBeadSyncState.inFlight = (async () => {
    try {
      const result = await syncClosedBeads({
        workspaceRoot: roots.workspaceRoot,
        dorgScript: DORG_SCRIPT,
        apply: true,
      });

      if (result.closedCount > 0) {
        clearLocalCaches();
        console.log(`[closed-beads] Closed ${result.closedCount} stale local Beads.`);
      }

      const state = {
        ok: true,
        checkedAt: new Date().toISOString(),
        result,
      };
      closedBeadSyncState.lastResult = state;
      return state;
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const state = {
        ok: false,
        checkedAt: new Date().toISOString(),
        error: message,
      };
      closedBeadSyncState.lastResult = state;
      console.error(`[closed-beads] ${message}`);
      return state;
    }
    finally {
      closedBeadSyncState.inFlight = null;
    }
  })();

  return closedBeadSyncState.inFlight;
}

function buildLaunchCommand(context, body) {
  if (body.type === "issue-script") {
    const launcher = context.launchers.find((entry) => entry.type === "issue-script");
    if (!launcher) {
      throw new Error("No issue launcher is available for this issue.");
    }
    return launcher.command;
  }

  if (body.type === "codex-session") {
    const session = context.sessions.find((entry) => entry.sessionId === body.sessionId);
    if (!session) {
      throw new Error("That Codex session is not known for this issue.");
    }
    return `cd ${shellQuote(roots.workspaceRoot)} && codex --dangerously-bypass-approvals-and-sandbox resume ${session.sessionId}`;
  }

  throw new Error("Unsupported launch action.");
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    jsonResponse(response, 400, { error: "Missing URL." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const issueMatch = url.pathname.match(/^\/api\/issues\/(\d+)(?:\/open)?$/);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      jsonResponse(response, 200, {
        ok: true,
        workspaceRoot: roots.workspaceRoot,
        capabilities: {
          canLaunchITerm: ALLOW_ITERM_LAUNCH,
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/beads") {
      await maybeSyncClosedBeads();
      jsonResponse(response, 200, {
        generatedAt: new Date().toISOString(),
        capabilities: {
          canLaunchITerm: ALLOW_ITERM_LAUNCH,
        },
        items: await resolveDashboardBeads(),
      });
      return;
    }

    if (request.method === "GET" && issueMatch && !url.pathname.endsWith("/open")) {
      const issueId = extractIssueId(issueMatch[1]);
      const context = await resolveContext(issueId);
      jsonResponse(response, 200, context);
      return;
    }

    if (request.method === "POST" && issueMatch && url.pathname.endsWith("/open")) {
      if (!ALLOW_ITERM_LAUNCH) {
        jsonResponse(response, 403, {
          error: "iTerm launching is disabled. Start the companion with ISSUE_COMPANION_ALLOW_ITERM=1 to enable it.",
        });
        return;
      }

      const issueId = extractIssueId(issueMatch[1]);
      const body = await readRequestBody(request);
      const context = await resolveContext(issueId);
      const command = buildLaunchCommand(context, body);
      await openCommandInITerm(command);
      jsonResponse(response, 200, { ok: true, command });
      return;
    }

    jsonResponse(response, 404, { error: "Not found." });
  }
  catch (error) {
    jsonResponse(response, 500, {
      error: error instanceof Error ? error.message : "Unknown server error.",
    });
  }
});

server.listen(PORT, HOST, () => {
  const launchMode = ALLOW_ITERM_LAUNCH ? "enabled" : "disabled";
  console.log(`Issue companion listening on http://${HOST}:${PORT} (iTerm launch ${launchMode})`);
  void maybeSyncClosedBeads();
  setInterval(() => {
    void maybeSyncClosedBeads();
  }, CLOSED_BEAD_SYNC_INTERVAL_MS);
});
