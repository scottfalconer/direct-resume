# Direct Resume for Drupal.org

This repository contains the Drupal connector prototype for **Direct Resume**.

Direct Resume turns a work object into a direct return point for the right local AI coding session.

In this prototype, the work object is a Drupal.org issue page. When you open an issue, the extension surfaces the best matching local Codex session, issue launcher, and related local context so you can get back to work without digging through chat history, session IDs, or old terminal tabs.

## Current status

This is an early, local-first prototype aimed at heavy AI contributors.

It is **not** trying to be:

- a generic AI memory platform
- an issue planner
- a team sync product
- a cloud agent orchestration layer

The sharp wedge is simpler:

> Open the issue. Resume the right local session.

## Why it exists

AI coding tools are good at generating code and bad at helping you re-enter the exact conversation you had weeks ago when issue feedback lands.

Typical failure modes:

- issue ids are not reliable enough in session search
- session previews show how a conversation started, not what it solved
- histories get buried across projects and machines
- old terminal state disappears even though the issue is still the same work object

This prototype fixes the re-entry problem by attaching recovery to the issue page instead of the AI client UI.

## What this prototype does

- Reads local issue state from `.beads/issues.jsonl`.
- Reads local contribution artifacts from `.drupal-contribute-fix/<issue>-*`.
- Finds related Codex sessions from `~/.codex/history.jsonl`.
- Shows a suggested resume command directly on `https://www.drupal.org/project/.../issues/...`.
- Injects a `My Beads` block on `https://www.drupal.org/dashboard` for actionable tracked issues.
- Opens resume commands in iTerm when iTerm is available on macOS.
- Periodically audits local Beads against upstream issue status and auto-closes stale local Beads when Drupal.org issues are already closed.
- Includes manual audit/sync commands when you want to force that reconciliation yourself.

## What is in this repo

- `companion/`: localhost server that reads local files and exposes issue context as JSON.
- `extension/`: unpacked Chrome extension that injects the panel on Drupal.org issue pages.
- `test/`: focused tests for the local data readers.
- `projects/`: planning and research artifacts for the Direct Resume product direction.

## Product direction

The current codebase is the **Drupal connector first** version of a larger shape:

- Product name: `Direct Resume`
- Repo direction: one repo with internal connector and adapter boundaries
- Connectors: Drupal.org issues first, Jira-style `atlassian.net/browse/KEY-123` tickets next
- Future adapters: Codex and Claude Code

The architecture should support multiple connectors without becoming a plugin platform. The user-facing story should stay narrow: open the work object, resume the right local session.

See:

- [monorepo-package-plan.md](/Users/scott/dev/direct-resume/projects/monorepo-package-plan.md)
- [connector-contract.md](/Users/scott/dev/direct-resume/projects/connector-contract.md)

## Start the companion

```bash
cd /Users/scott/dev/direct-resume
npm start
```

That serves the API on `http://127.0.0.1:38551`.

When actively working anywhere under `/Users/scott/dev/drupal-contrib`, keep this companion running and keep the unpacked Chrome extension loaded so Drupal.org issues always show current local context.

Recommended Beads description fields for active issues:

- `Issue URL`
- `MR URL`
- `Status`
- `Next step`
- `Test plan`
- `Conversation summary`
- `Last thread comment`

## iTerm launch

iTerm launch is enabled automatically on macOS when the `iTerm` app is available.

If you need to disable it for a session:

```bash
cd /Users/scott/dev/direct-resume
ISSUE_COMPANION_ALLOW_ITERM=0 npm start
```

The companion only launches commands that it already derived for the current issue:

- `bash /Users/scott/dev/drupal-contrib/scripts/run-issue-<id>.sh`
- `codex resume <session-id>`

For `Open in iTerm` on Codex session resumes, the companion launches:

- `codex --dangerously-bypass-approvals-and-sandbox resume <session-id>`

This behavior is acceptable for a personal prototype. It is not the final security posture for a shared release. The planned release path is copy-first by default, with opt-in execution.

## Load the extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `/Users/scott/dev/direct-resume/extension`.
5. Open a Drupal.org issue page such as `https://www.drupal.org/project/canvas/issues/3558241`.
6. Open `https://www.drupal.org/dashboard` to see the `My Beads` block.

If the panel says the companion is offline, copy and run the start command it shows.

## Closed-bead maintenance

The companion checks tracked Beads on startup and then periodically while it is running. If an upstream Drupal.org issue is already closed, the companion closes the stale local Bead so open work stays prioritized on the dashboard.

If you want to force a manual audit:

```bash
cd /Users/scott/dev/direct-resume
npm run audit:closed-beads
```

If you want to force the local close step immediately:

```bash
cd /Users/scott/dev/direct-resume
npm run sync:closed-beads
```

On the dashboard block, open issues stay at the top. Any upstream-closed issues that have not been reconciled yet stay hidden in a collapsed section until the next sync.

## Verification

Run the focused checks from the project directory:

```bash
npm test
npm run check:companion
npm run check:extension
npm run audit:closed-beads
```
