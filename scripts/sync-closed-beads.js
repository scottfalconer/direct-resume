import { syncClosedBeads } from "../companion/lib/closed-beads.js";

const WORKSPACE_ROOT = "/Users/scott/dev/drupal-contrib";
const DORG_SCRIPT = "/Users/scott/.agents/skills/drupal-issue-queue/scripts/dorg.py";
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
