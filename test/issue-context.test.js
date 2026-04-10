import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  extractIssueId,
  getIssueContext,
  parseStructuredDescription,
  parseWorkflow,
} from "../companion/lib/issue-context.js";

test("extractIssueId finds numeric issue ids in mixed strings", () => {
  assert.equal(extractIssueId("Issue #3558241"), "3558241");
  assert.equal(extractIssueId("https://www.drupal.org/project/canvas/issues/3558241"), "3558241");
  assert.equal(extractIssueId("no issue here"), null);
});

test("parseStructuredDescription reads common Beads fields", () => {
  const fields = parseStructuredDescription(`Issue URL: https://www.drupal.org/project/canvas/issues/3558241
MR URL: https://git.drupalcode.org/project/canvas/-/merge_requests/331
Status: Needs work
Next step: Add the regression test.
Test plan: Run phpunit and smoke test.
Conversation summary: Reviewer follow-up on unresolved MR comments.
Last thread comment: Maintainer asked for a tighter regression test.`);

  assert.deepEqual(fields, {
    issueUrl: "https://www.drupal.org/project/canvas/issues/3558241",
    mrUrl: "https://git.drupalcode.org/project/canvas/-/merge_requests/331",
    statusText: "Needs work",
    nextStep: "Add the regression test.",
    testPlan: "Run phpunit and smoke test.",
    conversationSummary: "Reviewer follow-up on unresolved MR comments.",
    lastThreadComment: "Maintainer asked for a tighter regression test.",
  });
});

test("parseWorkflow pulls the issue url and MR links out of workflow notes", () => {
  const workflow = parseWorkflow(`# Workflow

- **Workflow mode:** MR-based
- **Issue:** https://www.drupal.org/node/3558241
- **MRs:**
  - https://git.drupalcode.org/project/canvas/-/merge_requests/331
  - https://git.drupalcode.org/project/canvas/-/merge_requests/332
`);

  assert.equal(workflow.workflowMode, "MR-based");
  assert.equal(workflow.issueUrl, "https://www.drupal.org/node/3558241");
  assert.deepEqual(workflow.mrUrls, [
    "https://git.drupalcode.org/project/canvas/-/merge_requests/331",
    "https://git.drupalcode.org/project/canvas/-/merge_requests/332",
  ]);
});

test("getIssueContext combines beads, artifacts, history, and launcher scripts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "issue-companion-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const codexRoot = path.join(tempRoot, "codex");
  const artifactRoot = path.join(workspaceRoot, ".drupal-contribute-fix", "3558241-fix");

  await fs.mkdir(path.join(workspaceRoot, ".beads"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "scripts"), { recursive: true });
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.mkdir(path.join(codexRoot), { recursive: true });

  await fs.writeFile(
    path.join(workspaceRoot, ".beads", "issues.jsonl"),
    `${JSON.stringify({
      id: "drupal-contrib-xyz",
      title: "3558241 - Resolve MR !331 unresolved review comments",
      description: `Issue URL: https://www.drupal.org/project/canvas/issues/3558241
MR URL: https://git.drupalcode.org/project/canvas/-/merge_requests/331
Status: Needs work
Next step: Add the missing regression test.
Test plan: Run targeted phpunit.
Conversation summary: Finish the canonical MR with minimal review churn.
Last thread comment: Reviewer wants the missing regression coverage before RTBC.`,
      status: "open",
      issue_type: "bug",
      updated_at: "2026-03-07T12:00:00Z",
      comments: [
        {
          created_at: "2026-03-07T12:10:00Z",
          text: "Added the MR context to Beads.",
        },
      ],
    })}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(artifactRoot, "WORKFLOW.md"),
    `# Workflow

- **Workflow mode:** MR-based
- **Issue:** https://www.drupal.org/node/3558241
- **MRs:**
  - https://git.drupalcode.org/project/canvas/-/merge_requests/331
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(artifactRoot, "REPORT.md"),
    "This report explains the remaining review work for issue 3558241.",
    "utf8",
  );
  await fs.writeFile(
    path.join(artifactRoot, "ISSUE_COMMENT.drupal.txt"),
    "Posting a reroll after the regression test lands.",
    "utf8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "scripts", "run-issue-3558241.sh"),
    "#!/usr/bin/env bash\ncodex resume test-session-id\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(codexRoot, "history.jsonl"),
    `${JSON.stringify({
      session_id: "019c0cd9-4367-77d0-a0a2-a5ebbb15ab27",
      ts: 1769742751,
      text: "lets use this as our first test case for issue 3558241",
    })}\n${JSON.stringify({
      session_id: "019c0cd9-4367-77d0-a0a2-a5ebbb15ab27",
      ts: 1769742929,
      text: "read the issue at https://www.drupal.org/project/canvas/issues/3558241",
    })}\n`,
    "utf8",
  );

  const context = await getIssueContext("3558241", {
    workspaceRoot,
    beadsFile: path.join(workspaceRoot, ".beads", "issues.jsonl"),
    artifactRoot: path.join(workspaceRoot, ".drupal-contribute-fix"),
    scriptsRoot: path.join(workspaceRoot, "scripts"),
    codexHistoryFile: path.join(codexRoot, "history.jsonl"),
  });

  assert.equal(context.primary.title, "3558241 - Resolve MR !331 unresolved review comments");
  assert.equal(context.primary.nextStep, "Add the missing regression test.");
  assert.equal(context.primary.conversationSummary, "Finish the canonical MR with minimal review churn.");
  assert.equal(context.primary.lastThreadComment, "Reviewer wants the missing regression coverage before RTBC.");
  assert.equal(context.primary.suggestedCommand, "codex resume 019c0cd9-4367-77d0-a0a2-a5ebbb15ab27");
  assert.equal(context.sessions.length, 1);
  assert.equal(context.sessions[0].mentionCount, 2);
  assert.equal(context.sessions[0].firstPrompt, "lets use this as our first test case for issue 3558241");
  assert.equal(context.sessions[0].lastPrompt, "read the issue at https://www.drupal.org/project/canvas/issues/3558241");
  assert.equal(context.artifacts.length, 1);
  assert.equal(context.launchers.length, 1);
});
