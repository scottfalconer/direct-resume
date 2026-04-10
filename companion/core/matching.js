import {
  EVIDENCE_TYPES,
  DEFAULT_EVIDENCE_WEIGHTS,
  normalizeEvidenceList,
} from "./evidence.js";

const MAX_CONFIDENCE_SCORE = DEFAULT_EVIDENCE_WEIGHTS[EVIDENCE_TYPES.CANONICAL_URL];

export function rankCandidates(workObject, candidates, options = {}) {
  const explicitBindings = new Set(options.explicitSessionIds || []);

  return [...(candidates || [])]
    .map((candidate) => rankCandidate(workObject, candidate, explicitBindings))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return String(right.last_seen_at || "").localeCompare(String(left.last_seen_at || ""));
    });
}

export function rankCandidate(workObject, candidate, explicitBindings = new Set()) {
  const evidence = normalizeEvidenceList(candidate.evidence);
  const hasExplicitBinding =
    explicitBindings.has(candidate.session_id) ||
    evidence.some((item) => item.type === EVIDENCE_TYPES.EXPLICIT_BINDING);
  const score = evidence.reduce((sum, item) => sum + evidenceWeight(item), 0);
  const finalScore = hasExplicitBinding
    ? Math.max(score, DEFAULT_EVIDENCE_WEIGHTS[EVIDENCE_TYPES.EXPLICIT_BINDING])
    : score;

  return {
    ...candidate,
    work_object_id: workObject.canonical_id,
    evidence,
    score: finalScore,
    confidence: confidenceForScore(finalScore),
    match_type: matchTypeForScore(finalScore, hasExplicitBinding),
  };
}

function evidenceWeight(evidence) {
  if (Number.isFinite(evidence.weight)) {
    return evidence.weight;
  }
  return DEFAULT_EVIDENCE_WEIGHTS[evidence.type] || 0;
}

function confidenceForScore(score) {
  if (score >= DEFAULT_EVIDENCE_WEIGHTS[EVIDENCE_TYPES.EXPLICIT_BINDING]) {
    return 1;
  }
  return Math.min(0.99, Number((score / MAX_CONFIDENCE_SCORE).toFixed(2)));
}

function matchTypeForScore(score, hasExplicitBinding) {
  if (hasExplicitBinding) {
    return "explicit";
  }
  if (score >= DEFAULT_EVIDENCE_WEIGHTS[EVIDENCE_TYPES.PROJECT_SCOPED_ID]) {
    return "inferred";
  }
  return "suggested";
}
