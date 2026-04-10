import { createEvidence, EVIDENCE_TYPES } from "../core/evidence.js";
import { createWorkObject, normalizeHost, parseUrl } from "../core/work-object.js";

const DRUPAL_HOST = "www.drupal.org";

export const drupalConnector = {
  source: "drupal",
  match(input) {
    return Boolean(parseDrupalInput(input));
  },
  canonicalize(input) {
    const parsed = parseDrupalInput(input);
    if (!parsed) {
      throw new Error("Unsupported Drupal.org work object URL.");
    }

    const projectSegment = parsed.project ? `project/${parsed.project}/issues` : "node";
    const canonicalUrl = `https://${DRUPAL_HOST}/${projectSegment}/${parsed.issueId}`;
    const projectPart = parsed.project || "node";

    return createWorkObject({
      kind: "drupal.issue",
      canonical_id: `drupal:${projectPart}:${parsed.issueId}`,
      canonical_url: canonicalUrl,
      display_title: parsed.title || `Drupal issue ${parsed.issueId}`,
      source: "drupal",
      metadata: {
        issue_id: parsed.issueId,
        project: parsed.project,
      },
    });
  },
  aliases(workObject) {
    const issueId = workObject.metadata?.issue_id;
    const project = workObject.metadata?.project;
    const evidence = [
      createEvidence(EVIDENCE_TYPES.CANONICAL_URL, workObject.canonical_url, "drupal.aliases"),
    ];

    if (project && issueId) {
      evidence.push(
        createEvidence(EVIDENCE_TYPES.PROJECT_SCOPED_ID, `${project}:${issueId}`, "drupal.aliases"),
      );
    }
    if (issueId) {
      evidence.push(createEvidence(EVIDENCE_TYPES.BARE_NUMERIC_ID, issueId, "drupal.aliases"));
      evidence.push(
        createEvidence(EVIDENCE_TYPES.CANONICAL_URL, `https://${DRUPAL_HOST}/node/${issueId}`, "drupal.aliases"),
      );
    }

    return evidence;
  },
  display(workObject) {
    return {
      title: workObject.display_title,
      subtitle: workObject.metadata?.project
        ? `${workObject.metadata.project} #${workObject.metadata.issue_id}`
        : `#${workObject.metadata?.issue_id}`,
      url: workObject.canonical_url,
    };
  },
};

function parseDrupalInput(input) {
  const metadata = input?.metadata || {};
  const title = input?.page_title || metadata.title || "";
  const metadataCanonical = metadata.canonical_url || metadata.og_url;
  const urls = [metadataCanonical, input?.url].filter(Boolean);

  for (const value of urls) {
    const parsed = parseDrupalUrl(value, title);
    if (parsed) {
      return {
        ...parsed,
        project: parsed.project || metadata.project || null,
      };
    }
  }

  return null;
}

function parseDrupalUrl(value, title = "") {
  const url = parseUrl(value);
  if (!url || normalizeHost(url.hostname) !== DRUPAL_HOST) {
    return null;
  }

  const projectMatch = url.pathname.match(/^\/project\/([^/]+)\/issues\/(\d{5,8})(?:\/)?$/);
  if (projectMatch) {
    return {
      issueId: projectMatch[2],
      project: projectMatch[1],
      title,
    };
  }

  const nodeMatch = url.pathname.match(/^\/node\/(\d{5,8})(?:\/)?$/);
  if (nodeMatch) {
    return {
      issueId: nodeMatch[1],
      project: null,
      title,
    };
  }

  return null;
}
