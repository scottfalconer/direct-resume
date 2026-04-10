import { createEvidence, EVIDENCE_TYPES } from "../core/evidence.js";
import { createWorkObject, normalizeHost, parseUrl } from "../core/work-object.js";

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

export const jiraConnector = {
  source: "jira",
  match(input) {
    return Boolean(parseJiraInput(input));
  },
  canonicalize(input) {
    const parsed = parseJiraInput(input);
    if (!parsed) {
      throw new Error("Unsupported Jira work object URL.");
    }

    const canonicalUrl = `https://${parsed.host}/browse/${parsed.issueKey}`;
    return createWorkObject({
      kind: "jira.issue",
      canonical_id: `jira:${parsed.host}:${parsed.issueKey}`,
      canonical_url: canonicalUrl,
      display_title: parsed.title || parsed.issueKey,
      source: "jira",
      metadata: {
        host: parsed.host,
        issue_key: parsed.issueKey,
      },
    });
  },
  aliases(workObject) {
    const issueKey = workObject.metadata?.issue_key;
    const evidence = [
      createEvidence(EVIDENCE_TYPES.CANONICAL_URL, workObject.canonical_url, "jira.aliases"),
    ];
    if (issueKey) {
      evidence.push(createEvidence(EVIDENCE_TYPES.CONNECTOR_KEY, issueKey, "jira.aliases"));
    }
    return evidence;
  },
  display(workObject) {
    return {
      title: workObject.display_title,
      subtitle: workObject.metadata?.host || "Jira",
      url: workObject.canonical_url,
    };
  },
};

function parseJiraInput(input) {
  const metadata = input?.metadata || {};
  const title = input?.page_title || metadata.title || "";
  const url = parseUrl(input?.url);
  if (!url) {
    return null;
  }

  const host = normalizeHost(url.hostname);
  if (!host.endsWith(".atlassian.net")) {
    return null;
  }

  const browseMatch = url.pathname.match(/^\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)(?:\/)?$/);
  const metadataKey = normalizeIssueKey(metadata.issue_key);
  const issueKey = normalizeIssueKey(browseMatch?.[1]) || metadataKey;
  if (!issueKey) {
    return null;
  }

  return { host, issueKey, title };
}

function normalizeIssueKey(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return JIRA_KEY_PATTERN.test(normalized) ? normalized : null;
}
