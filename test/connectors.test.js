import test from "node:test";
import assert from "node:assert/strict";

import { resolveWorkObject } from "../companion/connectors/index.js";
import { drupalConnector } from "../companion/connectors/drupal.js";
import { jiraConnector } from "../companion/connectors/jira.js";
import { EVIDENCE_TYPES } from "../companion/core/evidence.js";

test("Drupal connector canonicalizes project issue URLs", () => {
  const workObject = drupalConnector.canonicalize({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
    page_title: "Fix Canvas issue",
  });

  assert.equal(workObject.kind, "drupal.issue");
  assert.equal(workObject.canonical_id, "drupal:canvas:3558241");
  assert.equal(workObject.canonical_url, "https://www.drupal.org/project/canvas/issues/3558241");
  assert.equal(workObject.display_title, "Fix Canvas issue");
  assert.deepEqual(workObject.metadata, {
    issue_id: "3558241",
    project: "canvas",
  });
});

test("Drupal connector prefers canonical metadata over node URLs", () => {
  const workObject = drupalConnector.canonicalize({
    url: "https://www.drupal.org/node/3558241",
    metadata: {
      canonical_url: "https://www.drupal.org/project/canvas/issues/3558241",
    },
  });

  assert.equal(workObject.canonical_id, "drupal:canvas:3558241");
  assert.equal(workObject.canonical_url, "https://www.drupal.org/project/canvas/issues/3558241");
});

test("Drupal aliases include strong project evidence and weak bare numeric evidence", () => {
  const workObject = drupalConnector.canonicalize({
    url: "https://www.drupal.org/project/canvas/issues/3558241",
  });
  const aliases = drupalConnector.aliases(workObject);

  assert.deepEqual(
    aliases.map((alias) => ({ type: alias.type, value: alias.value })),
    [
      {
        type: EVIDENCE_TYPES.CANONICAL_URL,
        value: "https://www.drupal.org/project/canvas/issues/3558241",
      },
      { type: EVIDENCE_TYPES.PROJECT_SCOPED_ID, value: "canvas:3558241" },
      { type: EVIDENCE_TYPES.BARE_NUMERIC_ID, value: "3558241" },
      { type: EVIDENCE_TYPES.CANONICAL_URL, value: "https://www.drupal.org/node/3558241" },
    ],
  );
});

test("Jira connector canonicalizes atlassian.net browse URLs with tenant scoped ids", () => {
  const workObject = jiraConnector.canonicalize({
    url: "https://acquia.atlassian.net/browse/PROS-370",
    page_title: "PROS-370 test ticket",
  });

  assert.equal(workObject.kind, "jira.issue");
  assert.equal(workObject.canonical_id, "jira:acquia.atlassian.net:PROS-370");
  assert.equal(workObject.canonical_url, "https://acquia.atlassian.net/browse/PROS-370");
  assert.equal(workObject.display_title, "PROS-370 test ticket");
  assert.deepEqual(workObject.metadata, {
    host: "acquia.atlassian.net",
    issue_key: "PROS-370",
  });
});

test("Jira connector keeps identical issue keys separate across tenants", () => {
  const first = jiraConnector.canonicalize({
    url: "https://acquia.atlassian.net/browse/PROS-370",
  });
  const second = jiraConnector.canonicalize({
    url: "https://example.atlassian.net/browse/PROS-370",
  });

  assert.notEqual(first.canonical_id, second.canonical_id);
});

test("Jira connector can use DOM metadata on fragmented issue pages", () => {
  const workObject = jiraConnector.canonicalize({
    url: "https://acquia.atlassian.net/jira/software/projects/PROS/boards/1",
    metadata: {
      issue_key: "pros-370",
    },
  });

  assert.equal(workObject.canonical_id, "jira:acquia.atlassian.net:PROS-370");
  assert.equal(workObject.canonical_url, "https://acquia.atlassian.net/browse/PROS-370");
});

test("default connector resolver ignores unsupported URLs", () => {
  const resolved = resolveWorkObject({
    url: "https://example.com/project/canvas/issues/3558241",
  });

  assert.equal(resolved, null);
});
