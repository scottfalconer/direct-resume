import { spawn } from "node:child_process";

import {
  detectITermLaunchCapability,
  openCommandInITerm,
} from "./iterm.js";

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function detectTerminalLaunchCapability(config = {}) {
  if (!config.enabled) {
    return false;
  }

  if (config.terminal === "iterm") {
    return detectITermLaunchCapability();
  }

  if (config.terminal === "terminal") {
    return process.platform === "darwin";
  }

  return false;
}

export async function openCommandInVisibleTerminal(command, config = {}) {
  if (!config.enabled) {
    throw new Error("Terminal execution is disabled.");
  }

  if (config.terminal === "iterm") {
    await openCommandInITerm(command);
    return {
      terminal: "iterm",
    };
  }

  if (config.terminal === "terminal") {
    await openCommandInMacTerminal(command);
    return {
      terminal: "terminal",
    };
  }

  throw new Error(`Unsupported terminal launcher: ${config.terminal}`);
}

async function openCommandInMacTerminal(command) {
  if (process.platform !== "darwin") {
    throw new Error("Terminal.app launch is only supported on macOS.");
  }

  const scriptLines = [
    `set resumeCommand to ${appleScriptString(command)}`,
    'tell application "Terminal"',
    "activate",
    "do script resumeCommand",
    "end tell",
  ];

  await new Promise((resolve, reject) => {
    const args = scriptLines.flatMap((line) => ["-e", line]);
    const child = spawn("osascript", args);
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
    });
  });
}
