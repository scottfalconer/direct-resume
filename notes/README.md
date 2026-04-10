# Direct Resume Notes

This folder is the working notebook for the renamed Direct Resume project.

## Start Here

- [Product/design doc](direct-resume-design-20260408.md) — approved product direction and engineering-review decisions.
- [Second review packet](reviews/second-review-packet-20260409.md) — self-contained architecture and decision brief for outside review.
- [Engineering test plan](reviews/eng-review-test-plan-20260408.md) — QA and coverage targets for the refactor.
- [Competitor research summary](research/direct-resume-competitor-research-20260408.md) — closest adjacent products and positioning.

## Current Decision Snapshot

- Product name: Direct Resume.
- First connectors: Drupal.org issues and Jira tickets like `*.atlassian.net/browse/PROS-370`.
- Architecture: one repo with internal connector and adapter boundaries.
- Storage: Beads for portable work anchors, local store for machine-local session bindings/cache/token.
- Transport: hardened localhost HTTP for v1.
- Default action: copy-safe resume commands; local exec is configurable and off by default.
- Test approach: Node `node:test`, companion HTTP integration tests, and a small DOM/message harness.

## Source Artifacts

The copied research bundle still lives under `projects/research-20260408-direct-resume/` for LLM/offline analysis.
