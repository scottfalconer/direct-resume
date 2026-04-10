import test from "node:test";
import assert from "node:assert/strict";

import { createEvidence, EVIDENCE_TYPES } from "../companion/core/evidence.js";
import { rankCandidates } from "../companion/core/matching.js";
import { createWorkObject } from "../companion/core/work-object.js";

const workObject = createWorkObject({
  kind: "drupal.issue",
  canonical_id: "drupal:canvas:3558241",
  canonical_url: "https://www.drupal.org/project/canvas/issues/3558241",
  display_title: "Drupal issue 3558241",
  source: "drupal",
});

test("ranking prefers canonical URL evidence over bare numeric evidence", () => {
  const ranked = rankCandidates(workObject, [
    {
      agent: "codex",
      session_id: "numeric-only",
      evidence: [
        createEvidence(EVIDENCE_TYPES.BARE_NUMERIC_ID, "3558241", "test"),
      ],
    },
    {
      agent: "codex",
      session_id: "canonical-url",
      evidence: [
        createEvidence(
          EVIDENCE_TYPES.CANONICAL_URL,
          "https://www.drupal.org/project/canvas/issues/3558241",
          "test",
        ),
      ],
    },
  ]);

  assert.equal(ranked[0].session_id, "canonical-url");
  assert.equal(ranked[0].match_type, "inferred");
  assert.equal(ranked[1].session_id, "numeric-only");
  assert.equal(ranked[1].match_type, "suggested");
});

test("explicit bindings rank first and get full confidence", () => {
  const ranked = rankCandidates(
    workObject,
    [
      {
        agent: "codex",
        session_id: "canonical-url",
        evidence: [
          createEvidence(
            EVIDENCE_TYPES.CANONICAL_URL,
            "https://www.drupal.org/project/canvas/issues/3558241",
            "test",
          ),
        ],
      },
      {
        agent: "codex",
        session_id: "explicit-link",
        evidence: [
          createEvidence(EVIDENCE_TYPES.BARE_NUMERIC_ID, "3558241", "test"),
        ],
      },
    ],
    {
      explicitSessionIds: ["explicit-link"],
    },
  );

  assert.equal(ranked[0].session_id, "explicit-link");
  assert.equal(ranked[0].match_type, "explicit");
  assert.equal(ranked[0].confidence, 1);
});

test("project scoped evidence is inferred but bare numeric evidence remains suggested", () => {
  const ranked = rankCandidates(workObject, [
    {
      agent: "codex",
      session_id: "project-scoped",
      evidence: [
        createEvidence(EVIDENCE_TYPES.PROJECT_SCOPED_ID, "canvas:3558241", "test"),
      ],
    },
    {
      agent: "codex",
      session_id: "numeric-only",
      evidence: [
        createEvidence(EVIDENCE_TYPES.BARE_NUMERIC_ID, "3558241", "test"),
      ],
    },
  ]);

  assert.equal(ranked[0].session_id, "project-scoped");
  assert.equal(ranked[0].match_type, "inferred");
  assert.equal(ranked[1].session_id, "numeric-only");
  assert.equal(ranked[1].match_type, "suggested");
});
