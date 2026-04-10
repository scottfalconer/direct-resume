import { spawn, spawnSync } from "node:child_process";

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function detectITermLaunchCapability() {
  if (process.platform !== "darwin") {
    return false;
  }

  const result = spawnSync("osascript", ["-e", 'tell application "iTerm" to version'], {
    encoding: "utf8",
  });

  return result.status === 0;
}

export async function openCommandInITerm(command) {
  const scriptLines = [
    `set issueCommand to ${appleScriptString(command)}`,
    'tell application "iTerm"',
    "activate",
    "if (count of windows) = 0 then",
    "create window with default profile",
    "else",
    "tell current window",
    "create tab with default profile",
    "end tell",
    "end if",
    "tell current session of current window",
    "write text issueCommand",
    "end tell",
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
