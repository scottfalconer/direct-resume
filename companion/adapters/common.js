import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { createEvidence } from "../core/evidence.js";
import { shellQuote } from "../lib/iterm.js";

export function defaultCodexHome() {
  return process.env.DIRECT_RESUME_CODEX_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function defaultClaudeHome() {
  return process.env.DIRECT_RESUME_CLAUDE_HOME || process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
}

export async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

export async function readJsonLines(filePath, onLine) {
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

export async function findFiles(rootDir, predicate, options = {}) {
  const maxDepth = options.maxDepth ?? 4;
  const results = [];

  async function walk(currentDir, depth) {
    if (depth > maxDepth || !(await pathExists(currentDir))) {
      return;
    }

    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
        continue;
      }

      if (entry.isFile() && predicate(entryPath, entry.name)) {
        results.push(entryPath);
      }
    }
  }

  await walk(rootDir, 0);
  return results;
}

export function evidenceForText(aliases, text, source) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) {
    return [];
  }

  return aliases
    .filter((alias) => {
      const value = String(alias.value || "").toLowerCase();
      return value && haystack.includes(value);
    })
    .map((alias) => createEvidence(alias.type, alias.value, source, alias.weight));
}

export function buildWorkspaceCommand(command, workspacePath) {
  if (!workspacePath) {
    return command;
  }
  return `cd ${shellQuote(workspacePath)} && ${command}`;
}

export function summarizeText(text, maxLength = 180) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

export function normalizeSessionId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{5,}$/.test(normalized) ? normalized : null;
}
