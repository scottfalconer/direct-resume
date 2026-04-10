export const EVIDENCE_TYPES = Object.freeze({
  EXPLICIT_BINDING: "explicit_binding",
  CANONICAL_URL: "canonical_url",
  CONNECTOR_KEY: "connector_key",
  PROJECT_SCOPED_ID: "project_scoped_id",
  BARE_NUMERIC_ID: "bare_numeric_id",
  REPO_PROXIMITY: "repo_proximity",
  RECENCY: "recency",
});

export const DEFAULT_EVIDENCE_WEIGHTS = Object.freeze({
  [EVIDENCE_TYPES.EXPLICIT_BINDING]: 1000,
  [EVIDENCE_TYPES.CANONICAL_URL]: 120,
  [EVIDENCE_TYPES.CONNECTOR_KEY]: 90,
  [EVIDENCE_TYPES.PROJECT_SCOPED_ID]: 70,
  [EVIDENCE_TYPES.REPO_PROXIMITY]: 30,
  [EVIDENCE_TYPES.RECENCY]: 15,
  [EVIDENCE_TYPES.BARE_NUMERIC_ID]: 10,
});

export function createEvidence(type, value, source, weight = null) {
  if (!Object.values(EVIDENCE_TYPES).includes(type)) {
    throw new Error(`Unsupported evidence type: ${type}`);
  }

  return {
    type,
    value: String(value ?? ""),
    source: String(source ?? "unknown"),
    weight: weight == null ? DEFAULT_EVIDENCE_WEIGHTS[type] : Number(weight),
  };
}

export function normalizeEvidenceList(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence
    .filter((item) => item && typeof item === "object")
    .map((item) => createEvidence(item.type, item.value, item.source, item.weight));
}
