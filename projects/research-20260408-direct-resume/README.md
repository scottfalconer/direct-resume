# Research: Direct Resume Landscape

As of: 2026-04-08
Question: What existing tools are closest to a Drupal-first / GitHub-next tool that lets a user open a work object in the browser and directly resume the right local Codex or Claude session? Also, what naming/package direction is safest for a product called `Direct Resume`?

## Scope

This research focuses on authoritative public sources and local reproducible snapshots:

- GitHub READMEs for adjacent OSS tools
- Official product/docs pages for adjacent commercial tools
- Package/registry availability checks for candidate names

## Plan

Search the closest adjacent categories first:

1. Issue-native planning/orchestration
2. Browser URL to local workspace/task routing
3. Repo/agent memory
4. Naming/package namespace availability

Stopping condition:

- Enough evidence to say whether the exact wedge is already occupied
- Enough evidence to choose a product/repo/package naming direction

## Must-have evidence

- At least one close adjacent from each of the three main categories
- Primary-source snapshots for the closest competitors
- Reproducible namespace/package checks for the naming candidates

## Connector Decision Matrix

| Source | Use? (Y/N) | Why it’s relevant to the question | What you will pull (specific) |
|---|---|---|---|
| Salesforce (Case) | N | This is product landscape research, not a case/account investigation. | None |
| Slack | N | No internal Slack evidence is needed to answer the market/naming question. | None |
| Jira | N | We are not investigating a specific internal Jira project or ticket history. | None |
| Confluence | N | No internal Confluence docs are required for the external competitor scan. | None |
| Drive | N | No internal Drive docs are required for the external competitor scan. | None |
| Domo | N | No analytics dataset is needed to answer the naming/landscape question. | None |
| Sumo Logic | N | This question does not involve traffic, abuse, performance, attribution, or logs. | None |
| docs.acquia.com | N | This is not an Acquia docs grounding question. | None |
| Zoom | N | Existing Zoom transcript context was already used earlier for product framing, not needed for this evidence pack. | None |

Note: this bundle relies on public web and GitHub sources instead of the internal connectors above.

## Preliminary answer

The exact wedge still appears open enough to pursue, but it is not a pure vacuum.

The closest public adjacencies cluster into three buckets:

1. **Issue-native orchestration/planning**
   - `iloom`
   - `CodeRabbit Issue Planner`
   - `Codex in Linear`

2. **Browser URL to local workspace/task routing**
   - `Wormhole`

3. **Repo/agent memory**
   - `Claude Code memory`
   - `Memdex`

The strongest seam remains:

> external work-object anchored + browser-triggered + local-first + direct recovery of the right prior local Claude/Codex-style session

Closest tools usually get 2-3 of those properties, not all 4.

## Naming conclusion

`Direct Resume` is usable as a product name, but the bare phrase is generic enough that package/repo naming should include a technical suffix.

Safer shape:

- Product: `Direct Resume`
- Core repo/package: `direct-resume-cli` or `direct-resume-core`
- Connectors: `direct-resume-drupal`, `direct-resume-github`

Why:

- The raw package names currently appear open in the registries checked.
- The phrase “direct resume” is descriptive enough that other tools may use it as a feature label, even if they do not own the product namespace.
- Search noise from HR/ATS “resume” terms is real, so suffixes help discoverability.

