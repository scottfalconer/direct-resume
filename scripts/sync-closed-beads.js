import { syncClosedBeads } from "../companion/lib/closed-beads.js";
import os from "node:os";
import path from "node:path";

const WORKSPACE_ROOT =
  process.env.ISSUE_COMPANION_WORKSPACE_ROOT ||
  path.join(os.homedir(), "dev", "drupal-contrib");
const DORG_SCRIPT =
  process.env.ISSUE_COMPANION_DORG_SCRIPT ||
  path.join(os.homedir(), ".agents", "skills", "drupal-issue-queue", "scripts", "dorg.py");
const APPLY = process.argv.includes("--apply");

async function main() {
  const result = await syncClosedBeads({
    workspaceRoot: WORKSPACE_ROOT,
    dorgScript: DORG_SCRIPT,
    apply: APPLY,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
