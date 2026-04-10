# Direct Resume Second Review Packet

Generated: 2026-04-09  
Target repo: `https://github.com/scottfalconer/direct-resume`  
Local workspace: `/Users/scott/dev/direct-resume`

## Review Ask

Please review this plan before implementation.

Focus on:

- whether the v1 wedge is still sharp enough
- whether the architecture is enough for Drupal.org + Jira without becoming a platform
- whether the data model handles cross-machine use correctly
- whether the local security model is acceptable for a browser extension talking to a companion process
- whether the test plan covers the risky paths

Do not review this as a generic AI memory product. That is explicitly not the goal.

## Product Wedge

Direct Resume lets a developer open a work object in the browser and directly resume the right local AI coding session.

First supported work objects:

- Drupal.org issues
- Jira tickets like `https://<tenant>.atlassian.net/browse/PROS-370`

First supported agent adapters:

- Codex
- Claude Code

The user-facing promise:

> Open the issue or ticket. Resume the right local AI session.

## Why This Exists

The status quo is bad for heavy AI users:

- Codex/Claude session search is unreliable.
- Session previews often show the beginning of a conversation, not what it solved.
- Histories get buried across projects and machines.
- The work reappears in the issue tracker, but the useful AI context is trapped in the AI tool.

Direct Resume attaches re-entry to the work object, not to generic memory or chat search.

## Current Prototype

The copied prototype already does this for Drupal.org issues:

- Chrome extension injects a panel on Drupal.org issue pages.
- Local companion reads `.beads/issues.jsonl`.
- Companion reads local contribution artifacts from `.drupal-contribute-fix/<issue>-*`.
- Companion scans `~/.codex/history.jsonl` for matching sessions.
- Extension shows copy/open actions for likely resume commands.

Current limitations to fix before a public release:

- Drupal issue IDs are hard-coded as the routing model.
- Some paths still assume Scott's local machine.
- Command execution is prototype-only and too permissive.
- There is no Jira connector yet.
- There is no proper portable-anchor versus machine-local-binding split.
- Extension parsing and companion parsing are not cleanly separated.
- Dashboard behavior is useful only to Scott and is not part of the shared product.

## Core Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Product name | `Direct Resume` | Names the action, avoids vague "memory platform" framing. |
| Repo shape | One repo | Simpler install and development. Internal module boundaries are enough for v1. |
| First connectors | Drupal.org issues + Jira tickets | Drupal is the proven use case; Jira is the second real personal/team need. |
| Deferred connector | GitHub | Useful later, but not the next wedge. |
| Data model | Portable work anchors + machine-local session bindings | Shared work identity survives across machines without storing dead local session IDs in Beads. |
| Portable store | Beads | Lightweight, already cross-machine, user-editable. |
| Local store | `~/.direct-resume/` | Owns machine-local bindings, adapter cache, config, and install token. |
| Browser transport | Hardened localhost HTTP | Simpler install than native messaging. |
| Native messaging | Deferred | Adds install friction and native host registration. |
| Extension responsibility | Send `{ url, page_title }` only | Keeps connector logic in one place, the companion. |
| API identity | Full `WorkObject` | Bare issue IDs break with Jira and Drupal aliases. |
| Default action | Copy-safe resume command | Safe and universal. |
| Exec action | Configurable, off by default | Not every user has iTerm or wants direct command launch. |
| Dashboard | Not shared core | Rarely used and not part of the direct-resume promise. |
| Public plugin system | Deferred | Internal boundaries first; plugins only after more real connectors prove the contract. |
| Session index | Local mtime-aware adapter cache | Avoid rescanning large local history files on every page load without building a search platform. |
| Tests | Node `node:test`, HTTP integration tests, small DOM/message harness | Enough coverage for the real risks without full browser E2E in v1. |
| Workspace context | Store `workspace_path` on local bindings and session candidates | Users need to know where to paste copy-safe commands, and exec needs a working directory. |
| Stale sessions | Adapter liveness checks prune dead bindings | Avoid showing broken Resume buttons after local history cleanup. |
| Setup auth | Explicit pairing flow | The extension cannot read local files to discover the companion token. |
| Authoritative state | Persist explicit links only | Inferred/suggested matches are guesses, not truth. |
| Ranking | Core ranks typed evidence | Keeps scoring deterministic across connectors and adapters. |
| Action handling | `/api/resolve` returns opaque refs; `/api/resume` returns typed actions | Avoids leaking raw commands during discovery and re-checks policy at action time. |
| Protocol | Versioned schemas and structured errors | Makes extension/companion compatibility debuggable. |

## Proposed Architecture

```text
Browser page
    │
    │ current URL + page title
    ▼
Extension content script
    │
    │ chrome.runtime message
    ▼
Extension background worker
    │
    │ POST http://127.0.0.1:<port>/api/resolve
    ▼
Local companion
    │
    ├── Connector registry
    │       ├── Drupal.org connector
    │       └── Jira connector
    │
    ├── Stores
    │       ├── Beads portable anchors
    │       └── ~/.direct-resume local bindings/cache/config/token
    │
    ├── Agent adapters
    │       ├── Codex
    │       └── Claude Code
    │
    └── Resume policy
            ├── copy action
            └── exec action, only when locally enabled and match is explicit/confirmed
```

## Planned File Layout

```text
direct-resume/
  companion/
    core/
      work-object.js
      matching.js
      resume-policy.js
      config.js
      setup-pairing.js
    connectors/
      drupal.js
      jira.js
    adapters/
      codex.js
      claude.js
    stores/
      beads.js
      local-bindings.js
      session-cache.js
    server.js
  extension/
    background.js
    content.js
    styles.css
    manifest.json
  notes/
  projects/
  test/
```

The names can change during implementation, but the boundary should not.

## Data Model

### WorkObject

Stable identity for the thing in the browser.

```json
{
  "kind": "jira.issue",
  "canonical_id": "jira:acquia.atlassian.net:PROS-370",
  "canonical_url": "https://acquia.atlassian.net/browse/PROS-370",
  "display_title": "PROS-370",
  "source": "jira"
}
```

Drupal example:

```json
{
  "kind": "drupal.issue",
  "canonical_id": "drupal:canvas:3558241",
  "canonical_url": "https://www.drupal.org/project/canvas/issues/3558241",
  "display_title": "3558241 - Resolve MR !331 unresolved review comments",
  "source": "drupal"
}
```

### PortableWorkAnchor

Stored in Beads or represented through Beads metadata. Portable across machines.

Must not store the local session ID as the source of truth.

```json
{
  "work_object_id": "drupal:canvas:3558241",
  "origin": "explicit_link",
  "created_at": "2026-04-08T22:00:00Z",
  "last_seen_at": "2026-04-08T22:10:00Z",
  "aliases": [
    "3558241",
    "https://www.drupal.org/project/canvas/issues/3558241"
  ],
  "shared_summary": "Reviewer follow-up on unresolved MR comments."
}
```

### LocalSessionBinding

Stored locally under `~/.direct-resume/`.

This is authoritative user-created state. Persist only explicit or user-confirmed links here.

```json
{
  "work_object_id": "drupal:canvas:3558241",
  "machine_id": "9c2f53f8-7e9d-4b16-a0cb-355f20d63e67",
  "agent": "codex",
  "session_id": "019c0cd9-4367-77d0-a0a2-a5ebbb15ab27",
  "workspace_path": "/Users/scott/dev/drupal-contrib/projects/canvas",
  "created_at": "2026-04-08T22:00:00Z",
  "last_seen_at": "2026-04-08T22:10:00Z",
  "last_verified_at": "2026-04-08T22:10:00Z",
  "state": "active"
}
```

`machine_id` is an install-generated UUID, not the hostname.

Allowed states:

- `active`
- `stale`
- `hidden`
- `pruned`

### SessionCandidate

Returned by Codex/Claude adapters before final ranking.

Session candidates are heuristic discovery output. They are not authoritative bindings until the user explicitly links or confirms one.

```json
{
  "candidate_ref": "resolve-opaque-candidate-ref",
  "agent": "codex",
  "session_id": "019c0cd9-4367-77d0-a0a2-a5ebbb15ab27",
  "resume_label": "Codex session from Apr 8",
  "workspace_path": "/Users/scott/dev/drupal-contrib/projects/canvas",
  "summary": "Reviewer follow-up on unresolved MR comments.",
  "first_seen_at": "2026-04-08T20:00:00Z",
  "last_seen_at": "2026-04-08T22:10:00Z",
  "evidence": [
    "matched Drupal issue URL",
    "matched issue id 3558241"
  ]
}
```

`candidate_ref` is opaque. The extension sends it back to `/api/link` or `/api/resume`; it does not construct commands.

### Evidence

Adapters and connectors emit typed evidence. Core owns ranking.

Initial evidence types:

- `explicit_binding`
- `canonical_url`
- `connector_key`
- `project_scoped_id`
- `bare_numeric_id`
- `repo_proximity`
- `recency`

## Companion API

### `GET /health`

Returns companion status and safe capability flags.

Must not leak unnecessary local paths.

### `POST /api/resolve`

Input:

```json
{
  "protocol_version": 1,
  "url": "https://acquia.atlassian.net/browse/PROS-370",
  "page_title": "PROS-370 Some Jira ticket title",
  "metadata": {
    "canonical_url": "https://acquia.atlassian.net/browse/PROS-370",
    "issue_key": "PROS-370"
  }
}
```

`metadata` is a hint, not trusted authority. The extension may pass DOM or meta-tag facts such as `og:url`, issue key, project label, or title. The connector still validates the supported URL shape.

Output:

```json
{
  "protocol_version": 1,
  "work_object": {},
  "matches": [
    {
      "candidate_ref": "resolve-opaque-candidate-ref",
      "agent": "codex",
      "resume_label": "Codex session from Apr 8",
      "workspace_path": "/Users/scott/dev/drupal-contrib/projects/canvas",
      "summary": "Reviewer follow-up on unresolved MR comments.",
      "match_type": "inferred",
      "confidence": 0.82,
      "evidence": []
    }
  ],
  "capabilities": {
    "can_exec": false
  }
}
```

Errors are structured:

```json
{
  "protocol_version": 1,
  "error": {
    "code": "unsupported_url",
    "message": "No Direct Resume connector supports this page."
  }
}
```

### `POST /api/link`

Creates or updates:

- the portable work anchor
- the local session binding

Valid inputs:

- `candidate_ref` from the latest resolve result
- or manual `{ agent, session_id, workspace_path }`

The resulting local binding is explicit authoritative state.

V1 linking behavior:

- User opens a supported work object.
- Extension shows detected recent candidates.
- User explicitly chooses one and clicks `Link`.
- If detection misses, user can paste a session ID and workspace path manually.
- Later CLI helpers like `direct-resume link --current` can improve this.

### `POST /api/resume`

Returns a resume action for a selected candidate.

Modes:

- `copy`: always allowed for valid candidates.
- `exec`: allowed only if local exec is enabled and the selected binding is explicit or user-confirmed.
- `exec`: must launch a visible configured terminal/editor surface, not a headless background process.

If no launcher is configured, the companion returns a copy-safe fallback.

Input should use an opaque candidate or binding reference, not a raw command.

Output is a typed action object:

```json
{
  "protocol_version": 1,
  "action": {
    "type": "copy",
    "label": "Copy Codex resume command",
    "command": "codex resume 019c0cd9-4367-77d0-a0a2-a5ebbb15ab27",
    "workspace_path": "/Users/scott/dev/drupal-contrib/projects/canvas"
  }
}
```

Before returning any action, the companion re-runs liveness and policy checks.

## Match Policy

### Explicit

User chose or confirmed the session for this work object on this machine.

- Rank first.
- Confidence `1.0`.
- Eligible for exec if local exec is enabled.
- Persisted as `LocalSessionBinding`.

### Inferred

Local history strongly mentions the work object.

- Rank below explicit.
- Show evidence.
- Copy-only until promoted or confirmed.
- Ephemeral resolve output only, unless promoted.

### Suggested

Weak heuristic match.

- Never auto-execute.
- Present as possible match only.
- Ephemeral resolve output only, unless promoted.

## Security Plan

Default release posture:

- Companion binds to loopback only.
- Extension talks to localhost HTTP only in v1.
- No wildcard CORS.
- Requests require an extension-origin allowlist and per-install token.
- Token setup uses an explicit pairing flow. V1 can use `direct-resume setup` to print a short-lived, single-use token or open a local setup page, then the user confirms/pastes that token into the extension.
- Pairing tokens are accepted only in a header or request body, never in a query string.
- Copy is the default action.
- Exec is off by default and machine-local.
- Exec requires a configured visible launcher, such as Terminal.app, iTerm, or an editor URI. Plain headless `child_process.exec()` is not acceptable for interactive agents.
- Connectors never emit shell commands.
- Only adapters can produce resume actions.
- Companion validates that requested actions came from adapter output.

Prototype behavior to remove or quarantine:

- hard-coded Scott paths
- permissive CORS
- iTerm auto-detection as implicit exec permission
- `codex --dangerously-bypass-approvals-and-sandbox` as default resume behavior

## Build Order

1. Add core model types and pure helpers.
2. Add Drupal connector and tests for alias canonicalization.
3. Add Jira connector and tests for tenant/key canonicalization.
4. Add local store under `~/.direct-resume/` for config, token, local bindings, and adapter cache.
5. Add setup/pairing flow for the extension-to-companion token.
6. Add Beads portable-anchor store wrapper.
7. Add Codex adapter behind the new `SessionAdapter` contract, including `workspace_path` and liveness checks.
8. Add Claude adapter behind the same contract.
9. Move ranking into core with typed evidence.
10. Add companion endpoints: `/health`, `/api/resolve`, `/api/link`, `/api/resume`.
11. Add protocol version, explicit schemas, and structured error codes.
12. Harden localhost HTTP with origin/token checks.
13. Refactor extension to send `{ url, page_title, metadata }`.
14. Make `/api/resolve` return opaque candidate refs and `/api/resume` return typed action objects.
15. Implement no-match, one-match, multi-match, copy-only, offline, and exec-enabled UI states.
16. Implement visible-launcher exec configuration, or keep exec hidden until configured.
17. Remove or quarantine dashboard behavior from the shared product flow.
18. Update install docs for `~/dev/direct-resume` and the GitHub repo.

## Test Plan

Use Node's built-in `node:test`.

Required coverage:

- Drupal connector canonicalizes `/node/<id>` and `/project/<project>/issues/<id>` to one work object.
- Jira connector canonicalizes `*.atlassian.net/browse/KEY-123` and avoids tenant collisions.
- Unsupported URLs return no connector.
- Extension sends only `{ url, page_title }`.
- Companion `/api/resolve` returns stable work object plus ranked candidates.
- `/api/link` writes both a portable anchor and a local binding.
- `/api/link` records `workspace_path`.
- `/api/link` persists only explicit/user-confirmed bindings.
- `/api/resume` returns copy actions for valid candidates.
- `/api/resume` accepts opaque refs, not raw commands.
- `/api/resume` re-runs liveness and policy checks before returning a typed action.
- `/api/resume` rejects exec when local exec is disabled.
- `/api/resume` rejects exec for inferred/suggested matches.
- `/api/resume` falls back to copy when no visible launcher is configured.
- Origin/token security rejects invalid requests.
- Setup pairing stores the token in both extension storage and local companion config.
- Setup pairing token is short-lived, single-use, and never sent in a query string.
- Adapter liveness checks hide or prune stale local session bindings.
- Existing Drupal issue flow still finds the expected best Codex session after WorkObject refactor.
- Offline extension behavior still shows a safe start hint.
- Multiple plausible matches show a ranked list and never auto-resume.
- Bare numeric Drupal issue aliases score lower than full URL or connector-key evidence.
- Resolve metadata hints improve canonicalization without overriding connector URL validation.
- One thin smoke test crosses extension message handling, localhost auth, resolve, and resume with fake connector/adapter implementations.

Test artifact:

- `notes/reviews/eng-review-test-plan-20260408.md`

## Performance Plan

Use a small local session cache.

Rules:

- Explicit local bindings resolve before any history scan.
- Explicit local bindings must pass adapter liveness checks before display.
- Inferred/suggested matches are ephemeral or TTL-cached, not authoritative state.
- Adapter discovery caches by source file path, mtime, and size.
- Cache rebuilds lazily when source files change.
- Beads stores portable anchors and aliases, not the full local session index.

Do not build SQLite or full-text search in v1 unless history scanning proves too slow.

## Not In Scope For V1

- Cloud service
- Account system
- Team sync
- Public plugin platform
- Slack connector
- Email connector
- GitHub connector
- Generic AI chat search
- Issue planning
- Cloud agent orchestration
- Workspace/tmux management
- Native messaging transport
- Full browser E2E harness
- Drupal dashboard as shared core
- Headless exec of interactive CLI agents

## Open Questions For Reviewer

1. Should portable anchors be encoded inside existing Beads descriptions, Beads external refs, or a separate Beads issue type/convention?
2. Is manual candidate selection plus optional session ID/workspace paste enough for `Link current session` in v1?
3. Should `Exec` be copy-only for the first public release even though the architecture supports opt-in visible launchers?
4. Is localhost HTTP with origin/token hardening plus explicit pairing acceptable for early power users, or should native messaging be revisited sooner?
5. Should Claude support ship with Codex in the first implementation pass, or immediately after Codex once the adapter contract is proven?
6. Should the copied research bundle under `projects/research-20260408-direct-resume/` stay in the public repo, or should only the markdown summary under `notes/research/` be committed?
7. Should inferred/suggested matches be only in-memory per resolve call, or persisted in a short TTL cache for smoother UI?

## Reviewer Red Flags To Look For

- Anything that turns this back into an "AI memory platform."
- Any plan that stores local session IDs as portable shared truth.
- Any plan that persists inferred/suggested matches as authoritative local bindings.
- Any connector logic duplicated between extension and companion.
- Any adapter-local scoring that bypasses core ranking.
- Any raw shell command returned from `/api/resolve`.
- Any `/api/resume` path that skips liveness or policy checks.
- Any resume path where an inferred match can execute without explicit user confirmation.
- Any hard-coded path or macOS/iTerm assumption in the release path.
- Any exec path that launches an interactive agent headlessly.
- Any UI that omits the workspace/repo path for a session candidate.
- Any stale local binding shown as resumable without an adapter liveness check.
- Any test plan that skips the browser-extension state machine.
- Any performance plan that repeatedly scans large history files on every page load.

## Current Verification

Last verified from `/Users/scott/dev/direct-resume`:

```bash
npm test
npm run check:companion
npm run check:extension
```

Results recorded on 2026-04-09:

- `npm test`: 8 passed, 0 failed.
- `npm run check:companion`: passed.
- `npm run check:extension`: passed.
