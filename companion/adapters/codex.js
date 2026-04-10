import path from "node:path";

import {
  buildWorkspaceCommand,
  defaultCodexHome,
  evidenceForText,
  normalizeSessionId,
  pathExists,
  readJsonLines,
  summarizeText,
} from "./common.js";

export const codexAdapter = {
  agent: "codex",
  displayName: "Codex",

  async discover(workObject, aliases, options = {}) {
    const codexHome = options.codexHome || defaultCodexHome();
    const indexCandidates = await discoverFromSessionIndex(aliases, codexHome, options);
    const historyCandidates = await discoverFromLegacyHistory(aliases, codexHome, options);
    return mergeCandidates([...indexCandidates, ...historyCandidates]);
  },

  async isLive(candidate, options = {}) {
    if (candidate.session_file) {
      return {
        state: (await pathExists(candidate.session_file)) ? "live" : "stale",
        checked_at: new Date().toISOString(),
      };
    }

    const codexHome = options.codexHome || defaultCodexHome();
    const sessionId = candidate.session_id;
    let sawIndex = false;
    let found = false;

    await readJsonLines(path.join(codexHome, "session_index.jsonl"), async (line) => {
      sawIndex = true;
      if (found) {
        return;
      }
      try {
        const entry = JSON.parse(line);
        found = entry.id === sessionId;
      }
      catch {
        // Ignore malformed index lines.
      }
    });

    return {
      state: !sawIndex || found ? "live" : "stale",
      checked_at: new Date().toISOString(),
    };
  },

  parseSessionReference(value) {
    const text = String(value || "").trim();
    const commandMatch = text.match(/\bcodex(?:\s+[^\s]+)*\s+resume\s+([A-Za-z0-9._:-]+)/);
    return {
      agent: "codex",
      session_id: normalizeSessionId(commandMatch?.[1] || text),
    };
  },

  buildResumeAction(candidate, mode = "copy") {
    const baseCommand = `codex resume ${candidate.session_id}`;
    const command = buildWorkspaceCommand(baseCommand, candidate.workspace_path);

    return {
      type: mode === "exec" ? "visible_terminal" : "copy_command",
      mode,
      agent: "codex",
      command,
      workspace_path: candidate.workspace_path || null,
      label: `Resume Codex session ${candidate.session_id}`,
    };
  },
};

async function discoverFromSessionIndex(aliases, codexHome, options) {
  const indexFile = options.codexIndexFile || path.join(codexHome, "session_index.jsonl");
  const candidates = [];

  await readJsonLines(indexFile, async (line) => {
    let entry;
    try {
      entry = JSON.parse(line);
    }
    catch {
      return;
    }

    const evidence = evidenceForText(aliases, `${entry.thread_name || ""} ${entry.id || ""}`, "codex.session_index");
    if (!entry.id || evidence.length === 0) {
      return;
    }

    candidates.push({
      agent: "codex",
      session_id: entry.id,
      label: entry.thread_name || `Codex session ${entry.id}`,
      summary: summarizeText(entry.thread_name),
      workspace_path: entry.workspace_path || null,
      last_seen_at: entry.updated_at || null,
      evidence,
    });
  });

  return candidates;
}

async function discoverFromLegacyHistory(aliases, codexHome, options) {
  const historyFile = options.codexHistoryFile || path.join(codexHome, "history.jsonl");
  const bySession = new Map();

  await readJsonLines(historyFile, async (line) => {
    let entry;
    try {
      entry = JSON.parse(line);
    }
    catch {
      return;
    }

    const evidence = evidenceForText(aliases, entry.text, "codex.history");
    if (!entry.session_id || evidence.length === 0) {
      return;
    }

    const existing = bySession.get(entry.session_id) || {
      agent: "codex",
      session_id: entry.session_id,
      label: `Codex session ${entry.session_id}`,
      summary: summarizeText(entry.text),
      workspace_path: entry.cwd || null,
      last_seen_at: entry.ts ? new Date(Number(entry.ts) * 1000).toISOString() : null,
      evidence: [],
    };

    existing.evidence.push(...evidence);
    bySession.set(entry.session_id, existing);
  });

  return [...bySession.values()];
}

function mergeCandidates(candidates) {
  const bySession = new Map();
  for (const candidate of candidates) {
    const existing = bySession.get(candidate.session_id);
    if (!existing) {
      bySession.set(candidate.session_id, candidate);
      continue;
    }

    existing.evidence.push(...candidate.evidence);
    existing.workspace_path ||= candidate.workspace_path;
    existing.summary ||= candidate.summary;
    if (String(candidate.last_seen_at || "") > String(existing.last_seen_at || "")) {
      existing.last_seen_at = candidate.last_seen_at;
      existing.label = candidate.label || existing.label;
    }
  }
  return [...bySession.values()];
}
