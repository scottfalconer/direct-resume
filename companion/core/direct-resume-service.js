import { randomUUID } from "node:crypto";

import { defaultAdapters, findAdapter } from "../adapters/index.js";
import { defaultConnectors, resolveWorkObject } from "../connectors/index.js";
import { createEvidence, EVIDENCE_TYPES } from "./evidence.js";
import { rankCandidates } from "./matching.js";
import {
  DirectResumeError,
  ERROR_CODES,
  PROTOCOL_VERSION,
} from "./protocol.js";
import {
  readLocalBindings,
  updateBindingState,
  upsertLocalBinding,
} from "../stores/local-bindings.js";

const CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;

export class DirectResumeService {
  constructor(options = {}) {
    this.connectors = options.connectors || defaultConnectors;
    this.adapters = options.adapters || defaultAdapters;
    this.storeOptions = options.storeOptions || {};
    this.candidateCache = new Map();
    this.now = options.now || (() => new Date());
  }

  async resolve(input) {
    this.pruneCandidateCache();
    const resolved = resolveWorkObject(input, this.connectors);
    if (!resolved) {
      return {
        ok: true,
        protocol_version: PROTOCOL_VERSION,
        state: "unsupported",
        work_object: null,
        candidates: [],
      };
    }

    const { connector, workObject } = resolved;
    const aliases = connector.aliases(workObject);
    const explicitCandidates = await this.explicitBindingCandidates(workObject);
    const discoveredCandidates = await this.discoverCandidates(workObject, aliases);
    const explicitSessionIds = explicitCandidates.map((candidate) => candidate.session_id);
    const ranked = rankCandidates(
      workObject,
      [...explicitCandidates, ...discoveredCandidates],
      { explicitSessionIds },
    );
    const candidates = ranked.slice(0, 8).map((candidate) => this.cacheCandidate(candidate));

    return {
      ok: true,
      protocol_version: PROTOCOL_VERSION,
      state: stateForCandidates(candidates),
      connector: connector.source,
      work_object: workObject,
      candidates: candidates.map(publicCandidate),
    };
  }

  async link(input) {
    const resolved = resolveWorkObject(input, this.connectors);
    if (!resolved) {
      throw new DirectResumeError(
        ERROR_CODES.UNSUPPORTED_WORK_OBJECT,
        "This page is not a supported Direct Resume work object.",
        400,
      );
    }

    const agent = requireString(input.agent, "agent");
    const adapter = findAdapter(agent, this.adapters);
    if (!adapter) {
      throw new DirectResumeError(ERROR_CODES.UNSUPPORTED_AGENT, `Unsupported agent: ${agent}`, 400);
    }

    const parsed = adapter.parseSessionReference(input.session_id || input.resume_text || "");
    if (!parsed.session_id) {
      throw new DirectResumeError(
        ERROR_CODES.BAD_REQUEST,
        "Paste a valid session id or resume command.",
        400,
      );
    }

    const binding = await upsertLocalBinding(
      {
        work_object_id: resolved.workObject.canonical_id,
        agent,
        session_id: parsed.session_id,
        workspace_path: requireString(input.workspace_path, "workspace_path"),
      },
      this.storeOptions,
    );

    return {
      ok: true,
      protocol_version: PROTOCOL_VERSION,
      binding,
      resolved: await this.resolve(input),
    };
  }

  async resume(input) {
    this.pruneCandidateCache();
    const candidateRef = requireString(input.candidate_ref, "candidate_ref");
    const entry = this.candidateCache.get(candidateRef);
    if (!entry) {
      throw new DirectResumeError(
        ERROR_CODES.CANDIDATE_EXPIRED,
        "This resume candidate expired. Resolve the page again and retry.",
        404,
      );
    }

    const candidate = entry.candidate;
    const adapter = findAdapter(candidate.agent, this.adapters);
    if (!adapter) {
      throw new DirectResumeError(
        ERROR_CODES.UNSUPPORTED_AGENT,
        `Unsupported agent: ${candidate.agent}`,
        400,
      );
    }

    const liveness = await adapter.isLive(candidate);
    if (liveness.state === "stale") {
      if (candidate.binding) {
        await updateBindingState(candidate.binding, "stale", this.storeOptions);
      }
      throw new DirectResumeError(
        ERROR_CODES.SESSION_STALE,
        "That local session binding is stale. Link the current session again.",
        410,
      );
    }

    const mode = input.mode === "exec" ? "exec" : "copy";
    return {
      ok: true,
      protocol_version: PROTOCOL_VERSION,
      action: adapter.buildResumeAction(candidate, mode),
      candidate: publicCandidate(candidate),
    };
  }

  cacheCandidate(candidate) {
    const candidateRef = `cand_${randomUUID()}`;
    const cachedAt = this.now().toISOString();
    const cached = {
      ...candidate,
      candidate_ref: candidateRef,
      cached_at: cachedAt,
    };
    this.candidateCache.set(candidateRef, {
      cachedAt: Date.parse(cachedAt),
      candidate: cached,
    });
    return cached;
  }

  pruneCandidateCache() {
    const cutoff = Date.now() - CANDIDATE_CACHE_TTL_MS;
    for (const [candidateRef, entry] of this.candidateCache.entries()) {
      if (entry.cachedAt < cutoff) {
        this.candidateCache.delete(candidateRef);
      }
    }
  }

  async explicitBindingCandidates(workObject) {
    const bindings = await readLocalBindings(this.storeOptions);
    const candidates = [];

    for (const binding of bindings) {
      if (binding.work_object_id !== workObject.canonical_id || binding.state !== "active") {
        continue;
      }

      const adapter = findAdapter(binding.agent, this.adapters);
      if (!adapter) {
        continue;
      }

      const candidate = {
        agent: binding.agent,
        session_id: binding.session_id,
        label: `${adapter.displayName || binding.agent} linked session`,
        summary: "Explicitly linked from this work object.",
        workspace_path: binding.workspace_path,
        last_seen_at: binding.last_seen_at,
        binding,
        evidence: [
          createEvidence(EVIDENCE_TYPES.EXPLICIT_BINDING, workObject.canonical_id, "local_binding"),
        ],
      };
      const liveness = await adapter.isLive(candidate);
      if (liveness.state === "stale") {
        await updateBindingState(binding, "stale", this.storeOptions);
        continue;
      }

      candidates.push({
        ...candidate,
        liveness,
      });
    }

    return candidates;
  }

  async discoverCandidates(workObject, aliases) {
    const discovered = [];

    for (const adapter of this.adapters) {
      const candidates = await adapter.discover(workObject, aliases);
      discovered.push(...candidates);
    }

    return discovered;
  }
}

function publicCandidate(candidate) {
  return {
    candidate_ref: candidate.candidate_ref,
    agent: candidate.agent,
    session_id: candidate.session_id,
    label: candidate.label || `${candidate.agent} session ${candidate.session_id}`,
    summary: candidate.summary || null,
    workspace_path: candidate.workspace_path || null,
    last_seen_at: candidate.last_seen_at || null,
    match_type: candidate.match_type,
    confidence: candidate.confidence,
    score: candidate.score,
    liveness: candidate.liveness || null,
    evidence: (candidate.evidence || []).map((item) => ({
      type: item.type,
      source: item.source,
    })),
  };
}

function stateForCandidates(candidates) {
  if (candidates.length === 0) {
    return "no_match";
  }
  if (candidates.length === 1) {
    return "one_match";
  }
  return "multiple_matches";
}

function requireString(value, fieldName) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new DirectResumeError(ERROR_CODES.BAD_REQUEST, `Missing ${fieldName}.`, 400);
  }
  return normalized;
}
