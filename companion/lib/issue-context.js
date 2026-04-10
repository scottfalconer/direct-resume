import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const DESCRIPTION_KEYS = new Map([
  ["Issue URL", "issueUrl"],
  ["MR URL", "mrUrl"],
  ["Status", "statusText"],
  ["Next step", "nextStep"],
  ["Test plan", "testPlan"],
  ["Intent", "intent"],
  ["Conversation summary", "conversationSummary"],
  ["Chat summary", "conversationSummary"],
  ["Last thread comment", "lastThreadComment"],
  ["Last comment", "lastThreadComment"],
  ["Artifacts", "artifacts"],
  ["Local sandbox", "localSandbox"],
  ["Project", "project"],
  ["Stage", "stage"],
  ["Mode", "mode"],
  ["Snapshot", "snapshot"],
]);

export function defaultRoots() {
  const workspaceRoot =
    process.env.ISSUE_COMPANION_WORKSPACE_ROOT ||
    "/Users/scott/dev/drupal-contrib";
  const codexHome = process.env.ISSUE_COMPANION_CODEX_HOME || path.join(os.homedir(), ".codex");

  return {
    workspaceRoot,
    beadsFile: path.join(workspaceRoot, ".beads", "issues.jsonl"),
    artifactRoot: path.join(workspaceRoot, ".drupal-contribute-fix"),
    scriptsRoot: path.join(workspaceRoot, "scripts"),
    codexHistoryFile: path.join(codexHome, "history.jsonl"),
  };
}

export function extractIssueId(value) {
  const match = String(value ?? "").match(/(\d{5,8})/);
  return match ? match[1] : null;
}

export function parseStructuredDescription(text) {
  const fields = {};
  let currentKey = null;

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      currentKey = null;
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z /_-]+):\s*(.*)$/);
    if (match && DESCRIPTION_KEYS.has(match[1])) {
      currentKey = DESCRIPTION_KEYS.get(match[1]);
      fields[currentKey] = match[2].trim();
      continue;
    }

    if (currentKey) {
      fields[currentKey] = `${fields[currentKey]} ${line}`.trim();
    }
  }

  return fields;
}

export function parseWorkflow(text) {
  const workflow = {
    workflowMode: null,
    issueUrl: null,
    mrUrls: [],
  };

  if (!text) {
    return workflow;
  }

  const workflowModeMatch = text.match(/\*\*Workflow mode:\*\*\s*([^\n]+)/);
  if (workflowModeMatch) {
    workflow.workflowMode = workflowModeMatch[1].trim();
  }

  const issueMatch = text.match(/\*\*Issue:\*\*\s*(https?:\/\/[^\s]+)/);
  if (issueMatch) {
    workflow.issueUrl = issueMatch[1];
  }

  const mrMatches = text.match(/\bhttps:\/\/git\.drupalcode\.org\/[^\s)]+/g) || [];
  workflow.mrUrls = [...new Set(mrMatches)];

  return workflow;
}

function previewText(text, maxLength = 260) {
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

  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

async function safeReadFile(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  }
  catch {
    return null;
  }
}

async function readJsonLines(filePath, onLine) {
  if (!(await pathExists(filePath))) {
    return;
  }

  const lineReader = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lineReader) {
    if (!line.trim()) {
      continue;
    }
    await onLine(line);
  }
}

function scoreBeadIssue(issue, issueId) {
  const title = String(issue.title ?? "");
  const description = String(issue.description ?? "");
  const externalRef = String(issue.external_ref ?? "");

  if (title.startsWith(`${issueId} -`)) {
    return 100;
  }
  if (externalRef === `drupal:${issueId}`) {
    return 90;
  }
  if (description.includes(`/issues/${issueId}`) || description.includes(`/node/${issueId}`)) {
    return 80;
  }
  if (title.includes(issueId) || description.includes(issueId)) {
    return 60;
  }
  return 0;
}

export async function scanBeads(issueId, roots = defaultRoots()) {
  const matches = [];

  await readJsonLines(roots.beadsFile, async (line) => {
    if (!line.includes(issueId)) {
      return;
    }

    let issue;
    try {
      issue = JSON.parse(line);
    }
    catch {
      return;
    }

    const score = scoreBeadIssue(issue, issueId);
    if (!score) {
      return;
    }

    const descriptionFields = parseStructuredDescription(issue.description);
    const recentComments = Array.isArray(issue.comments)
      ? issue.comments.slice(-3).map((comment) => ({
          createdAt: isoTimestamp(comment.created_at),
          text: previewText(comment.text, 220),
        }))
      : [];
    const latestComment = recentComments[recentComments.length - 1] || null;
    matches.push({
      beadId: issue.id,
      score,
      title: issue.title ?? `Issue ${issueId}`,
      status: issue.status ?? null,
      priority: issue.priority ?? null,
      issueType: issue.issue_type ?? null,
      updatedAt: isoTimestamp(issue.updated_at || issue.created_at),
      labels: Array.isArray(issue.labels) ? issue.labels : [],
      descriptionFields,
      conversationSummary:
        descriptionFields.conversationSummary ||
        previewText(issue.notes, 260) ||
        null,
      lastThreadComment:
        descriptionFields.lastThreadComment ||
        latestComment?.text ||
        null,
      descriptionPreview: previewText(issue.description, 340),
      comments: recentComments,
    });
  });

  matches.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return String(right.updatedAt).localeCompare(String(left.updatedAt));
  });

  return matches;
}

async function listNamedFiles(directoryPath) {
  if (!(await pathExists(directoryPath))) {
    return [];
  }

  const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function scanArtifacts(issueId, roots = defaultRoots()) {
  if (!(await pathExists(roots.artifactRoot))) {
    return [];
  }

  const entries = await fsp.readdir(roots.artifactRoot, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${issueId}-`)) {
      continue;
    }

    const artifactPath = path.join(roots.artifactRoot, entry.name);
    const workflowText = await safeReadFile(path.join(artifactPath, "WORKFLOW.md"));
    const reportText = await safeReadFile(path.join(artifactPath, "REPORT.md"));
    const issueCommentText =
      (await safeReadFile(path.join(artifactPath, "ISSUE_COMMENT.drupal.txt"))) ||
      (await safeReadFile(path.join(artifactPath, "ISSUE_COMMENT.md")));
    const stat = await fsp.stat(artifactPath);

    matches.push({
      slug: entry.name,
      path: artifactPath,
      updatedAt: stat.mtime.toISOString(),
      workflow: parseWorkflow(workflowText),
      reportPreview: previewText(reportText, 320),
      issueCommentPreview: previewText(issueCommentText, 280),
      diffFiles: await listNamedFiles(path.join(artifactPath, "diffs")),
      patchFiles: await listNamedFiles(path.join(artifactPath, "patches")),
      hasWorkflow: Boolean(workflowText),
      hasReport: Boolean(reportText),
      hasIssueComment: Boolean(issueCommentText),
    });
  }

  matches.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return matches;
}

export async function scanCodexHistory(issueId, roots = defaultRoots()) {
  const sessions = new Map();

  await readJsonLines(roots.codexHistoryFile, async (line) => {
    if (!line.includes(issueId)) {
      return;
    }

    let entry;
    try {
      entry = JSON.parse(line);
    }
    catch {
      return;
    }

    if (!entry.session_id || typeof entry.text !== "string" || !entry.text.includes(issueId)) {
      return;
    }

    const existing = sessions.get(entry.session_id) || {
      sessionId: entry.session_id,
      mentionCount: 0,
      firstMentionedAt: isoTimestamp(entry.ts),
      lastMentionedAt: isoTimestamp(entry.ts),
      firstPrompt: previewText(entry.text, 220),
      lastPrompt: previewText(entry.text, 260),
      command: `codex resume ${entry.session_id}`,
      _firstTs: Number(entry.ts),
      _lastTs: Number(entry.ts),
    };

    existing.mentionCount += 1;
    if (Number(entry.ts) <= existing._firstTs) {
      existing._firstTs = Number(entry.ts);
      existing.firstMentionedAt = isoTimestamp(entry.ts);
      existing.firstPrompt = previewText(entry.text, 220);
    }
    if (Number(entry.ts) >= existing._lastTs) {
      existing._lastTs = Number(entry.ts);
      existing.lastMentionedAt = isoTimestamp(entry.ts);
      existing.lastPrompt = previewText(entry.text, 260);
    }
    sessions.set(entry.session_id, existing);
  });

  return [...sessions.values()]
    .sort((left, right) => String(right.lastMentionedAt).localeCompare(String(left.lastMentionedAt)))
    .slice(0, 6)
    .map(({ _firstTs, _lastTs, ...session }) => session);
}

export async function scanIssueLaunchers(issueId, roots = defaultRoots()) {
  const launcherPath = path.join(roots.scriptsRoot, `run-issue-${issueId}.sh`);
  if (!(await pathExists(launcherPath))) {
    return [];
  }

  const stat = await fsp.stat(launcherPath);
  return [
    {
      type: "issue-script",
      label: `Issue launcher #${issueId}`,
      path: launcherPath,
      updatedAt: stat.mtime.toISOString(),
      command: `bash ${launcherPath}`,
    },
  ];
}

export async function getIssueContext(issueId, roots = defaultRoots(), options = {}) {
  const [beadMatches, artifacts, sessions, launchers] = await Promise.all([
    scanBeads(issueId, roots),
    scanArtifacts(issueId, roots),
    scanCodexHistory(issueId, roots),
    scanIssueLaunchers(issueId, roots),
  ]);

  const bead = beadMatches[0] || null;
  const artifact = artifacts[0] || null;
  const preferredCommand = sessions[0]?.command || launchers[0]?.command || null;
  const preferredAction = sessions[0]
    ? { type: "codex-session", label: "Resume latest Codex session", sessionId: sessions[0].sessionId }
    : launchers[0]
      ? { type: "issue-script", label: launchers[0].label }
      : null;

  return {
    issueId,
    generatedAt: new Date().toISOString(),
    capabilities: {
      canLaunchITerm: Boolean(options.allowITermLaunch),
    },
    primary: {
      title: bead?.title || artifact?.slug || `Issue ${issueId}`,
      issueUrl:
        bead?.descriptionFields.issueUrl ||
        artifact?.workflow.issueUrl ||
        `https://www.drupal.org/node/${issueId}`,
      mrUrl: bead?.descriptionFields.mrUrl || artifact?.workflow.mrUrls?.[0] || null,
      status: bead?.descriptionFields.statusText || bead?.status || null,
      issueType: bead?.issueType || null,
      updatedAt: bead?.updatedAt || artifact?.updatedAt || sessions[0]?.lastMentionedAt || null,
      nextStep: bead?.descriptionFields.nextStep || null,
      testPlan: bead?.descriptionFields.testPlan || null,
      intent: bead?.descriptionFields.intent || null,
      conversationSummary: bead?.conversationSummary || null,
      lastThreadComment: bead?.lastThreadComment || null,
      suggestedCommand: preferredCommand,
      suggestedAction: preferredAction,
    },
    beads: beadMatches,
    artifacts,
    sessions,
    launchers,
  };
}
