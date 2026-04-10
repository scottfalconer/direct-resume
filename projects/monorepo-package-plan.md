# Single-Repo Package Plan

## Goal

Keep the shipped product wedge sharp while making the codebase ready for more than one work-object connector.

Shipped story:

> Open a work object in the browser and resume the right local coding-agent session in one step.

Internal architecture:

- one local core
- multiple work-object connectors
- multiple agent adapters

## Proposed layout

```text
direct-resume/
  companion/
    core/
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
  docs/
  test/
```

## Module responsibilities

### `companion/core`

Shared types and matching logic.

- `WorkObject`
- `PortableWorkAnchor`
- `LocalSessionBinding`
- `SessionCandidate`
- scoring and ranking
- typed evidence normalization
- config loading
- resume policy
- security policy for resume actions
- protocol schemas and structured error codes
- setup/pairing policy for extension-to-companion token bootstrap

### `companion/connectors/drupal.js`

Drupal.org issue connector.

- canonicalize Drupal issue URLs
- extract issue ids and project context
- normalize dashboard and issue-page object identity
- optional helper parsing for local Beads conventions

### `direct-resume-github`

Removed from the first engineering plan. GitHub may be useful later, but Jira is the second connector users already want.

### `companion/connectors/jira.js`

Jira ticket connector.

- canonicalize `*.atlassian.net/browse/KEY-123` URLs
- normalize tenant + issue key
- avoid collisions between tenants with the same key

### `companion/adapters/codex.js`

Codex session adapter.

- discover local Codex sessions
- return resumable session candidates with typed evidence
- include `workspace_path` for display and exec launch context
- check whether a session id is still alive before display
- generate copy-safe and exec-safe resume actions

### `companion/adapters/claude.js`

Claude Code session adapter.

- discover local Claude session records
- return resumable session candidates with typed evidence
- include `workspace_path` for display and exec launch context
- check whether a session id is still alive before display
- generate copy-safe and exec-safe resume actions

### `companion/server.js`

Local service used by the browser extension and CLI.

- health endpoint
- object resolution
- explicit linking across the portable anchor store and local binding store
- action execution policy
- setup/pairing endpoint or CLI-assisted pairing flow
- audit trail for local resume events

### `extension/`

Browser surface.

- send `{ url, page_title }` to the companion
- pass optional page metadata hints when available
- render no-match / one-match / multi-match states
- trigger link/resume actions

### `companion/cli`

Debugging and explicit user control.

- `doctor`
- `list`
- `link`
- `resume`
- `inspect-object`
- `inspect-session`

## Migration plan from this repo

### Phase 1: stabilize current prototype

- Keep the current repo layout.
- Extract shared types and matching code behind internal module boundaries.
- Add docs that stop describing this as a one-off helper.
- Remove the Drupal dashboard feature from the shared product plan; it is rarely used and not part of the direct-resume wedge.

### Phase 2: split by responsibility

- Move matching/index/config into `companion/core`.
- Move Drupal URL canonicalization into `companion/connectors/drupal.js`.
- Move Codex session discovery into `companion/adapters/codex.js`.
- Keep the current extension and companion as thin consumers.

### Phase 3: add Jira connector

- Add `companion/connectors/jira.js`.
- Do not add new product language yet.
- Validate that the connector contract survives a second real connector.

### Phase 4: release cleanup

- Copy-first by default
- configurable local exec, off by default
- config instead of hard-coded machine paths
- package names and install flow aligned with the product story; if published to npm, use `direct-resume-cli` rather than the bare product phrase

## Non-goals for the first public release

- team sync
- cloud storage
- issue planning
- issue comments as memory storage
- Slack or email connectors
- GitHub connector
- generalized AI history search UI
- workspace management or tmux orchestration
- public plugin platform
- native messaging transport
- Drupal dashboard as a shared core feature

## Decisions to pressure-test in `/plan-eng-review`

Resolved by `/plan-eng-review`:

1. One repo, internal module boundaries only.
2. Connectors for Drupal.org issues and Jira-style `atlassian.net/browse/KEY-123` tickets.
3. Two stores: Beads for portable work anchors, local Direct Resume store for machine-local session bindings, cache, and install token.
4. Extension talks to the companion over hardened localhost HTTP only in v1.
5. APIs resolve by full `WorkObject`, not bare issue strings.
6. `Exec` is a configurable local capability, off by default.
7. Extension sends `{ url, page_title }`; connector matching lives in the companion.
8. Add companion HTTP integration tests and a small DOM/message harness, but no full browser E2E in v1.
9. Add file-mtime-aware local adapter cache for session discovery.
10. Include `workspace_path` in local bindings and session candidates.
11. Add adapter liveness checks and stale-binding pruning.
12. Add explicit extension pairing/setup flow for the localhost token.
13. Let `/api/resolve` accept a `metadata` object with connector hints.
14. Weight full URL and connector-key evidence above bare numeric aliases.
15. Persist only explicit or user-confirmed local session bindings; keep inferred/suggested matches ephemeral or TTL-cached.
16. Move ranking into core and have connectors/adapters emit typed evidence instead of raw alias strings or adapter-local scores.
17. Return opaque candidate refs from `/api/resolve`; create typed action objects only from `/api/resume`.
18. Add protocol version, explicit schemas, structured error codes, and single-use pairing token rules.
19. Add one seam-level smoke test crossing extension message handling, localhost auth, resolve, and resume with fake connector/adapter implementations.
