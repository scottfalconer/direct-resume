# Release Readiness - 2026-05-05

Scope: Direct Resume v0.1 as a GitHub/unpacked-extension release.

## Review Findings Fixed

- Removed machine-specific install commands from extension offline/setup UI.
- Moved remaining Scott-specific runtime defaults to `os.homedir()` plus environment-variable overrides.
- Changed legacy Drupal Beads/dashboard behavior from default-on to opt-in with `DIRECT_RESUME_ENABLE_LEGACY_DRUPAL=1`.
- Removed the legacy privileged Codex launch path.
- Removed `workspaceRoot` from unauthenticated `/health` output.
- Changed Codex explicit-binding liveness from false-stale to `unknown` when `session_index.jsonl` exists but does not include the manually linked session.
- Added extension content-script and background-service-worker smoke tests.
- Added `package-lock.json` so `npm audit --omit=dev` is a real release gate.

## Verification

Fresh checks run from the repo root:

- `npm test` -> 43 tests passed, 0 failed.
- `npm run check:companion` -> passed.
- `npm run check:extension` -> passed.
- `npm audit --omit=dev` -> 0 vulnerabilities.
- `git diff --check` -> passed.
- `DIRECT_RESUME_HOME="$(mktemp -d)" npm run setup` -> generated store, machine id, and one-time pairing token.
- Temp companion startup smoke -> `/health` returned `service: direct-resume`, `can_exec: false`, and did not expose `workspaceRoot`.
- Chrome for Testing unpacked-extension smoke -> loaded `extension/` and rendered the Direct Resume panel on `https://www.drupal.org/project/canvas/issues/3558241`.
- Chrome extension pack validation -> `Google Chrome --pack-extension=/tmp/direct-resume-pack/direct-resume-extension` completed successfully.

## Release Boundary

This is release-candidate quality for the documented v0.1 flow:

- clone the repo
- run `npm run setup`
- run `npm start`
- load `extension/` as an unpacked Chromium extension
- link and copy-resume local Codex or Claude sessions from supported Drupal/Jira issue pages

Not included in this release boundary:

- Chrome Web Store packaging/listing
- signed CRX distribution
- team/cloud sync
- workspace orchestration
- issue planning
- default-on legacy Drupal dashboard behavior
