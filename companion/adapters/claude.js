import path from "node:path";
import fs from "node:fs/promises";

import {
  buildWorkspaceCommand,
  defaultClaudeHome,
  evidenceForText,
  findFiles,
  normalizeSessionId,
  pathExists,
  summarizeText,
} from "./common.js";

export const claudeAdapter = {
  agent: "claude",
  displayName: "Claude Code",

  async discover(workObject, aliases, options = {}) {
    const claudeHome = options.claudeHome || defaultClaudeHome();
    const indexFiles = options.claudeIndexFiles || await findFiles(
      path.join(claudeHome, "projects"),
      (filePath, fileName) => fileName === "sessions-index.json",
      { maxDepth: 3 },
    );
    const candidates = [];

    for (const indexFile of indexFiles) {
      let index;
      try {
        index = JSON.parse(await fs.readFile(indexFile, "utf8"));
      }
      catch {
        continue;
      }

      for (const entry of index.entries || []) {
        const text = [
          entry.sessionId,
          entry.firstPrompt,
          entry.summary,
          entry.gitBranch,
          entry.projectPath,
        ].filter(Boolean).join(" ");
        const evidence = evidenceForText(aliases, text, "claude.sessions_index");
        if (!entry.sessionId || evidence.length === 0) {
          continue;
        }

        candidates.push({
          agent: "claude",
          session_id: entry.sessionId,
          label: entry.summary || entry.firstPrompt || `Claude session ${entry.sessionId}`,
          summary: summarizeText(entry.summary || entry.firstPrompt),
          workspace_path: entry.projectPath || index.originalPath || null,
          session_file: entry.fullPath || null,
          last_seen_at: entry.modified || entry.created || null,
          evidence,
        });
      }
    }

    return candidates;
  },

  async isLive(candidate, options = {}) {
    if (candidate.session_file) {
      return {
        state: (await pathExists(candidate.session_file)) ? "live" : "stale",
        checked_at: new Date().toISOString(),
      };
    }

    const claudeHome = options.claudeHome || defaultClaudeHome();
    const files = await findFiles(
      path.join(claudeHome, "projects"),
      (filePath, fileName) => fileName === `${candidate.session_id}.jsonl`,
      { maxDepth: 3 },
    );

    return {
      state: files.length ? "live" : "unknown",
      checked_at: new Date().toISOString(),
    };
  },

  parseSessionReference(value) {
    const text = String(value || "").trim();
    const commandMatch = text.match(/\bclaude(?:\s+[^\s]+)*\s+(?:--resume|resume)\s+([A-Za-z0-9._:-]+)/);
    return {
      agent: "claude",
      session_id: normalizeSessionId(commandMatch?.[1] || text),
    };
  },

  buildResumeAction(candidate, mode = "copy") {
    const baseCommand = `claude --resume ${candidate.session_id}`;
    const command = buildWorkspaceCommand(baseCommand, candidate.workspace_path);

    return {
      type: mode === "exec" ? "visible_terminal" : "copy_command",
      mode,
      agent: "claude",
      command,
      workspace_path: candidate.workspace_path || null,
      label: `Resume Claude session ${candidate.session_id}`,
    };
  },
};
