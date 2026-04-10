export function createWorkObject({
  kind,
  canonical_id: canonicalId,
  canonical_url: canonicalUrl,
  display_title: displayTitle,
  source,
  metadata = {},
}) {
  const workObject = {
    kind: requireString(kind, "kind"),
    canonical_id: requireString(canonicalId, "canonical_id"),
    canonical_url: requireString(canonicalUrl, "canonical_url"),
    display_title: requireString(displayTitle, "display_title"),
    source: requireString(source, "source"),
    metadata,
  };

  new URL(workObject.canonical_url);
  return workObject;
}

export function parseUrl(value) {
  try {
    return new URL(String(value ?? ""));
  }
  catch {
    return null;
  }
}

export function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase();
}

function requireString(value, fieldName) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`WorkObject requires ${fieldName}.`);
  }
  return normalized;
}
